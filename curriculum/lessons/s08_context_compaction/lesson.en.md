# s08 · Context Compaction and Checkpoints

> Compaction is a lossy compilation step: the harness replaces an overlong model-visible history with a smaller checkpoint while preserving the source events, provenance, and enough state to continue.

## What you will build {#learn}

s06 bounded context with deterministic truncation and pruning. Those policies remove text without understanding it. s07 then established an append-only journal that preserves the factual run even when a model-visible projection changes. This chapter combines the two ideas: when history crosses a trigger, an injected summarizer compiles older messages into a semantic checkpoint, records exactly what range it summarized, and resumes the same loop.

By the end, you should be able to:

- distinguish pruning, truncation, semantic compaction, replay checkpoints, and durable memory;
- place compaction before the next model request rather than after an overflow failure;
- inject a summarizer without coupling the core loop to a provider;
- record source size, output size, dropped-message count, and source SHA-256;
- explain why the summary is a fallible projection rather than authoritative history;
- design evaluations for constraint retention, unfinished work, file identity, and repeated-compaction drift.

### Prerequisites

You should be comfortable with s06's `ContextBudget` and s07's distinction between an immutable factual log and rebuildable projections. The demo remains offline: `summarize_history` is a deterministic function, not a model call. Production systems may use a model summarizer, a structured reducer, or a hybrid.

---

## The problem: deletion is predictable but not sufficient {#problem}

Pruning recent-first can keep a request under a hard limit, but it knows nothing about goals, constraints, unfinished work, test results, or artifact identity. Consider a long coding session:

```text
user goal
project instructions
design decision
tool call: read 2,000-line log
tool result
file edit
focused test passes
new user correction
```

A purely positional policy may keep the latest correction but drop why the edit was made or which test passed. Keeping all text is impossible; deleting blindly is cheap but semantically fragile. Compaction deliberately creates a smaller representation of the old span.

| Operation | Input | Output | Semantic interpretation | Source retained elsewhere? |
| --- | --- | --- | --- | --- |
| Tool truncation | One oversized result | Preview plus omission metadata | No | Should be, via artifact handle |
| Message pruning | Message sequence | Selected messages | No | Yes, in journal |
| Context compaction | Older history span | Summary/checkpoint | Yes | Required for audit and recovery |
| Replay checkpoint | Event prefix + reducer | Cached derived state | Deterministic | Yes |
| Durable memory | Selected fact | Cross-turn/session record | Yes, intentionally curated | Must retain source attribution |

Compaction fails in subtler ways than overflow. It can omit a negative constraint, merge two file names, convert a hypothesis into a fact, lose an unresolved question, or recursively summarize an earlier mistake. Therefore the harness must make compaction visible and evaluable.

> A shorter prompt is not evidence of a better context manager. The real question is whether downstream work remains correct and traceable.

---

## Mental model: compiler, source map, and checkpoint {#mental-model}

Treat compaction like compiling source into a smaller intermediate representation:

```text
append-only SessionJournal (facts)
             │
             ├── select source message range
             │
             ├── summarize / structure / validate
             │          └── source_sha256 + policy version
             ▼
model-visible checkpoint + optional recent tail
             │
             └── next model.request
```

The journal is analogous to source code; the checkpoint is an artifact. A compiler output can be regenerated, versioned, tested, and rejected. It should not erase its input.

### Four contracts

1. **Trigger contract:** when does compaction run—token threshold, turn boundary, tool result, latency budget, or explicit request?
2. **Selection contract:** which messages form the old span, which remain verbatim, and which protocol groups must stay atomic?
3. **Summary contract:** which fields must survive—goal, constraints, completed work, open tasks, artifacts, tests, and unknowns?
4. **Provenance contract:** which source range, algorithm/model, configuration, hash, and time produced the checkpoint?

The teaching code implements a character trigger, an injected callable, a recent-message count, and a source fingerprint. It intentionally leaves model quality and token accounting outside the core.

---

## Build semantic compaction step by step {#build}

### Step 1: define a structured report

`CompactionReport` returns both the next messages and audit metadata:

```python
@dataclass(frozen=True)
class CompactionReport:
    messages: tuple[Message, ...]
    summary: str
    dropped_count: int
    original_chars: int
    final_chars: int
    source_sha256: str
```

Calling the field `dropped_count` is deliberate: messages leave the model-visible projection even though their source events remain durable. Naming the loss prevents “summary” from sounding lossless.

### Step 2: inject the summarizer

The policy accepts `summarize: Callable[[Sequence[Message]], str]`:

```python
ContextCompactor(
    trigger_chars=260,
    keep_recent_messages=0,
    summarize=summarize_history,
)
```

The core loop does not know whether the callable uses deterministic rules, a local model, a remote provider, or a human-authored checkpoint. Provider credentials and retries stay at an adapter boundary.

### Step 3: trigger before the request

At the top of each turn, before `model.request`, the runner checks visible size:

```python
if self.compactor is not None and self.compactor.should_compact(messages):
    report = self.compactor.compact(messages)
    messages = list(report.messages)
    self._emit("context.compact", ...)
```

Running after the provider rejects an oversized request is recovery, not prevention. A production trigger should reserve output tokens, tool descriptors, system sections, and a safety margin.

### Step 4: pin the system message and select the old span

The lesson retains the first system message and divides the remainder into `dropped` and `recent`:

```python
system = tuple(messages[:1]) if messages[:1] and messages[0].role == "system" else ()
remaining = tuple(messages[len(system):])
keep_count = min(max(0, keep_recent_messages), len(remaining))
dropped = remaining if keep_count == 0 else remaining[:-keep_count]
recent = () if keep_count == 0 else remaining[-keep_count:]
```

This simple message-count policy is educational. Production code should group user turns, assistant tool calls, tool results, approvals, and file patches atomically. Splitting a tool request from its result can create invalid provider history.

### Step 5: require a non-empty summary

An empty checkpoint cannot silently replace old state:

```python
summary = self.summarize(dropped).strip()
if not summary:
    raise ValueError("compaction summary must be non-empty")
```

A stronger implementation validates a typed manifest. For example, `goal`, `constraints`, `completed`, `open_tasks`, `artifacts`, `tests`, `unknowns`, and `source_event_range` can each have required schemas.

### Step 6: fingerprint the compacted source

The source messages are serialized using their provider-neutral wire representation and hashed:

```python
source_wire = json.dumps(
    [message.to_wire() for message in dropped],
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
)
source_sha256 = hashlib.sha256(source_wire.encode("utf-8")).hexdigest()
```

The fingerprint lets a reviewer verify which bytes were summarized. It does not measure summary quality and should be paired with source event IDs in a durable implementation.

### Step 7: create an explicit checkpoint message

The compacted projection includes a visible marker:

```python
Message(
    role="assistant",
    content=f"[compacted checkpoint]\n{summary}",
)
```

The marker tells later adapters, UIs, and evaluations that this text is synthesized state, not a verbatim model response. A production provider may use a dedicated internal message type and compile it to an accepted wire role.

### Step 8: emit the decision, not the hidden reasoning

The event includes counts and provenance, not the summarizer's hidden reasoning:

```text
context.compact
  dropped_messages
  original_chars / final_chars
  summary_chars
  source_sha256
```

Whether the summary text itself is safe to record depends on its content and retention policy. The teaching trace records only metadata while the next model request consumes the checkpoint.

---

## Run the compaction path {#run}

Execute:

```bash
python3 -m curriculum.lessons.s08_context_compaction.demo
```

The first turn calls `inspect_artifact`, whose result contains a deliberately verbose preview. Before the second request, visible history crosses 260 characters. The runner compacts three non-system messages into one checkpoint.

Expected event order around the boundary:

```text
tool.request
tool.result
context.compact       original_chars=720, final_chars=232
model.request         roles=[system, assistant]
model.response
session.stop
```

Verify the committed artifact:

```bash
python3 -m curriculum.golden verify s08-context-compaction
```

### Inspect what the model actually receives

The internal model double stores each request:

```python
runner, _ = build_demo()
runner.run("Inspect and compact.")

for message in runner.model.requests[1]:
    print(message.role, message.content)
```

The second request contains the original system prompt and an assistant checkpoint mentioning `artifact://large-report` and the verified test conclusion. It does not contain the 32 repeated preview fragments.

### Compare journal and projection

The trace still contains the original `tool.result`, while the model request uses the checkpoint. This is the central invariant inherited from s07: compaction changes visibility, not historical facts.

---

## Failure modes and safety boundaries {#failure-modes}

| Failure | Observable symptom | Better contract |
| --- | --- | --- |
| Constraint omitted | Agent violates a requirement later | Required constraint field plus retention evaluation |
| Hypothesis promoted to fact | Summary states an unverified conclusion | Preserve epistemic status and evidence/source IDs |
| Tool pair split | Provider rejects history or loses call identity | Compact atomic protocol groups |
| File identities merged | Edit applies to the wrong path | Structured artifact records with stable handles |
| Summary grows beyond trigger | Repeated overflow or immediate re-compaction | Validate final budget and reserve tail space |
| Recursive drift | Each compaction amplifies an earlier error | Compact incremental spans against raw source; evaluate repeated cycles |
| Summarizer fails | Loop loses old state or crashes ambiguously | Keep prior projection, emit error, retry/fallback by policy |
| Secret copied into summary | Redaction boundary is bypassed | Redact source and output, classify storage, test canaries |
| Fingerprint treated as quality score | Bad summary appears “verified” | Hash proves source identity only; quality needs task-based evals |

> Never mark a compaction successful solely because it reduced token count. The checkpoint must support the next task and preserve declared invariants.

---

## Exercises with acceptance criteria {#exercises}

### A. Observe the trigger

Set `trigger_chars` above 1,000. Acceptance: no `context.compact` event appears and the second model request contains the original tool result.

### B. Preserve a recent correction

Set `keep_recent_messages=1` and add a final user correction before compaction. Acceptance: the checkpoint summarizes older messages while the correction remains verbatim after it.

### C. Empty-summary failure

Inject `lambda messages: ""`. Acceptance: compaction raises an explicit error before replacing the current messages.

### D. Structured checkpoint

Return JSON containing goal, constraints, completed work, open tasks, artifacts, tests, and unknowns. Acceptance: schema validation rejects a checkpoint missing `constraints` or `source_range`.

### E. Atomic tool groups

Group assistant tool calls and their tool results before selection. Acceptance: no retained history contains one side without the other.

### F. Repeated-compaction evaluation

Run five incremental compactions with a known set of constraints and file IDs. Acceptance: report exact retention, invented facts, and identity errors after each cycle, not only final compression ratio.

Run the focused check:

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s08_compacts_with_provenance -v
```

---

## Deep dive: evaluating production compaction {#deep-dive}

### Token-aware budgeting

Characters make the lesson deterministic, but production policy must account for provider tokenization, system sections, tool schemas, multimodal inputs, cached prefixes, and reserved output. A safe trigger is earlier than the nominal limit and can differ per model.

### Typed state versus prose summary

Prose is flexible but difficult to validate. Typed state makes missing constraints and invalid file IDs detectable. Many harnesses use both: structured fields for invariants and a concise narrative for context. The reducer can regenerate display prose without losing machine-readable status.

### Summary model isolation

If a model performs compaction, decide which tools, memory, and instructions it can access. A summarizer should not execute side effects. It needs its own timeout, retry policy, cost accounting, and prompt-injection defenses because the history being summarized may contain untrusted tool output.

### Cache consequences

Replacing a long prefix can invalidate provider prompt caches. Some designs compact only at low-frequency boundaries, keep stable system/tool-schema prefixes, or use remote provider compaction. Cache efficiency is a performance concern; it must not silently weaken semantic retention.

### Evaluation dimensions

A useful suite includes:

- **constraint retention:** required and forbidden actions remain explicit;
- **task continuity:** downstream tasks complete at the same rate;
- **artifact identity:** paths, hashes, tool-call IDs, and branches remain correct;
- **epistemic fidelity:** facts, hypotheses, failures, and unknowns stay distinct;
- **unfinished-work recall:** open tasks survive;
- **invention rate:** no unsupported facts appear;
- **multi-cycle drift:** errors do not compound across repeated compaction;
- **cost and latency:** savings justify the additional summarization work.

### Direct real-agent mappings

The linked Codex, Pi, and Reasonix Claims directly describe compaction at pinned source revisions. Their triggers, recent-tail rules, cache behavior, and local/remote choices differ. The lesson supplies a neutral comparison vocabulary, not a claim that implementations are equivalent.

### Compaction versus memory

Compaction preserves enough session state to continue. Durable memory selects facts expected to matter later, possibly across sessions. Automatically writing every summary into memory mixes two trust and retention decisions. s09 separates retrieval and skill loading from the compaction path.

---

## Checkpoint {#checkpoint}

Before continuing, answer:

1. Why must the factual journal survive compaction?
2. What does `source_sha256` prove, and what does it not prove?
3. Why should tool request/result groups be atomic?
4. Where must compaction occur relative to `model.request`?
5. Which fields would you require in a production checkpoint?
6. How would you measure repeated-compaction drift?

s09 moves selected information and full capability instructions outside the resident prompt. Instead of repeatedly summarizing everything, the harness will retrieve a source-attributed memory or load a skill only when the current task needs it.
