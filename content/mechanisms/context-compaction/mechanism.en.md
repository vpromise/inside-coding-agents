# Context Compaction

Long-running coding sessions accumulate more history than a model request should carry. Context compaction replaces an over-budget model-visible history with a smaller projection while preserving enough state, provenance, constraints, and recent work to continue safely.

Compaction is therefore not “delete old chat” and not merely “ask the model for a summary.” It is a state transition with information loss, lineage, trigger policy, and recovery obligations.

## L0 · Definition and boundary {#definition}

The durable session and the active model context serve different purposes. The durable session is the audit and replay record; active context is a bounded working projection. Compaction changes the latter without pretending that the former never existed.

> A compacted context is a checkpoint for continuation, not a replacement for history as evidence.

```text
append-only session events
          │
          ├── select older region ──► summarize / externalize
          │                                  │
          └── keep recent tail ──────────────┤
                                             ▼
                                next model-visible projection
```

| Record | Before compaction | After compaction | Durable location |
| --- | --- | --- | --- |
| User intent | full message | explicit constraint | session event log |
| Verified tool fact | verbose result | fact + artifact handle | tool event/artifact |
| Failed attempt | detailed steps | short outcome and reason | trace branch |
| Recent work | full recent tail | full recent tail | both views |
| Compaction decision | absent | lineage metadata | compaction event |

### Compaction versus neighboring mechanisms

`context-budget` detects and allocates pressure. `tool-output-truncation` bounds one result before it dominates a request. Compaction rebuilds a broader slice of history. `memory-retrieval` later reintroduces selected facts from outside immediate context. These are separate policies even when one turn invokes all of them.

### What must survive

At minimum, preserve current user intent, active constraints, approvals that are still valid, verified conclusions with source handles, unresolved work, recent causal context, and an explicit description of uncertainty. A summary that sounds fluent but drops one negative constraint is not successful compaction.

> Compression ratio is a transport metric; invariant survival is the correctness metric.

## L1 · Runnable reference {#reference}

Run the deterministic lesson and verify its Golden Trace:

```bash
python3 -m curriculum.lessons.s08_context_compaction.demo
python3 -m curriculum.golden verify s08-context-compaction
```

The lesson registers an `inspect_artifact` tool that returns a stable artifact handle and a deliberately verbose preview. A small trigger forces compaction after the tool round trip. The summarizer is a deterministic Python function, so no model call or network access is hidden inside the demonstration.

```python
ContextCompactor(
    trigger_chars=260,
    keep_recent_messages=0,
    summarize=summarize_history,
)
```

The deterministic summary preserves three things: the user's inspection intent, `artifact://large-report`, and the verified conclusion that tests remain green. This is intentionally small enough to inspect line by line.

### A compaction result needs lineage

A useful contract returns more than summary text:

```python
CompactionResult(
    summary=summary,
    replaced_event_ids=older_ids,
    retained_event_ids=recent_ids,
    artifact_refs=("artifact://large-report",),
    policy_version="reference-v1",
)
```

The reference harness emits `context.compact` before continuing. Its payload records the trigger, the number of replaced messages, retained messages, and summary size. The original Trace events remain available; only the model projection changes.

### Read the Golden Trace

The causal path is:

1. model requests artifact inspection;
2. the tool result enters the durable trace;
3. the context threshold is crossed;
4. `context.compact` records replacement metadata;
5. the next model turn receives the compacted projection;
6. the turn stops with a conclusion that depends on the preserved checkpoint.

The trace proves the order and the reference contract. Because the summarizer is scripted, it does not prove semantic faithfulness for arbitrary conversations.

### Verify before modifying

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s08-context-compaction
```

Change the summary only after the baseline passes; otherwise a failing trace cannot distinguish your change from an unrelated setup issue.

## L2 · Engineering compaction {#engineering}

Production compaction has four separable decisions: **when** to compact, **which region** to replace, **how** to project it, and **how** to validate the result. A single `summarize(messages)` callback hides all four.

### Trigger policy

Useful triggers can include a pre-request high-water mark, a post-sampling overflow signal, a large tool result, a session checkpoint, or a cache-shape transition. Record the exact trigger. Otherwise “automatic compaction happened” cannot be reproduced.

Hysteresis prevents repeated compaction near one threshold:

```text
start compaction at:  85% projected capacity
target after compact: 55% projected capacity
reserve for output:   fixed before admission
cooldown:             no new compact until meaningful growth
```

### Region and projection policy

Do not summarize arbitrary serialized text. Select typed records: user requirements, assistant decisions, tool calls and results, file mutations, approvals, errors, and artifacts. Then produce a structured checkpoint before rendering it as model input.

```python
checkpoint = {
    "intent": current_intent,
    "constraints": protected_constraints,
    "verified_facts": facts_with_sources,
    "artifacts": stable_handles,
    "open_work": unresolved_items,
    "uncertainty": known_unknowns,
}
```

A recent tail can preserve local conversational coherence, but “keep N messages” is not enough: one huge message may consume the entire tail, and a tool call must not be separated from the result that gives it meaning.

### Validation policy

Validate structural invariants before accepting a compacted projection. Required keys must exist; artifact handles must resolve; protected constraints must match source records; the projection must actually fit; and lineage IDs must refer to the durable branch being replaced. Semantic checks can be model-assisted, but deterministic checks should run first.

### Failure modes {#failure-modes}

| Failure | Consequence | Detection or mitigation |
| --- | --- | --- |
| Fluent but lossy summary | constraint silently disappears | typed invariant checklist |
| Summary of a summary | factual drift compounds | compact from durable sources when possible |
| Orphaned tool result | result loses its causal call | compact call/result groups atomically |
| Stale artifact handle | model cannot recover detail | validate handle and retention policy |
| Threshold thrashing | repeated cost and cache loss | hysteresis and cooldown |
| History overwritten | replay becomes impossible | append compaction event; retain source branch |
| Secret copied into summary | redaction boundary bypassed | redact before and validate after projection |

### Safety and reliability {#safety}

Approval is not a timeless sentence. If a compacted checkpoint retains “user approved command” but drops its fingerprint, scope, expiry, or one-shot consumption state, the summary can accidentally broaden authority. Carry typed approval state or require a fresh decision; do not let prose reconstruct permissions.

Trust labels must also survive. External instructions, tool output, and workspace policy cannot be merged into one undifferentiated summary. The model may see all three, but the harness still needs their provenance when deciding what can authorize effects.

Cancellation and steering create branch boundaries. If the user changes direction while a summary is being produced, verify that the result still targets the active branch before installing it.

## L3 · Architecture and Agent comparison {#comparison}

This mechanism has reviewed source-backed mappings for pinned Codex, Pi, and Reasonix snapshots. The Claim ledger below is the fact source; this article only explains the dimensions that make those mappings comparable.

The reviewed records support three distinct design shapes:

- the pinned Codex loop checks limits around sampling and may route through local or remote compaction before resuming a turn;
- the pinned Pi source uses a reserve threshold, summarizes an older branch, keeps recent entries, tracks file operations, and preserves an append-only session outside reduced model context;
- the pinned Reasonix source treats compaction as a low-frequency cache reset, uses multiple thresholds and a recent-tail budget, and records prefix-shape diagnostics.

Those statements are scoped to the exact snapshots and source locators linked below. They do not establish current behavior for later releases, every surface, or every configuration.

### A comparison matrix should align decisions

Compare trigger, selected region, summary producer, recent-tail rule, durable-history behavior, cache interaction, artifact preservation, user visibility, and recovery. Do not compare names alone: “compact,” “summarize,” and “context maintenance” may cover different boundaries.

### Evidence gaps remain first-class

Claude Code and the Reference Harness entries without qualifying mappings stay visible as unknown in the Agent grid. The reference lesson demonstrates one contract but is not silently promoted into a vendor claim. A missing mapping means the evidence package is incomplete, not that a mechanism is absent.

## L4 · Research and measurement {#research}

Compaction evaluation needs tasks whose required invariants are known in advance. Generic answer-quality judging cannot reveal which source facts disappeared or whether a model guessed.

### Proposed invariant-survival experiment

Build a fixed session containing:

- one positive requirement and one negative requirement;
- a verified tool fact backed by an artifact handle;
- a failed attempt that must not be repeated;
- a file mutation and its current path;
- one unresolved question;
- enough irrelevant history to cross a pinned threshold.

After compaction, issue probes that require each invariant independently. Publish the compacted projection when safe, the lineage manifest, threshold configuration, model/summarizer identity, and normalized trace.

Measure invariant recall, false invention, artifact resolvability, repeated failed actions, projection size, number of compactions, cache disruption, latency, and deterministic structural checks. Run multiple repetitions when a model produces the summary.

### Exercise and acceptance {#exercise}

```bash
python3 -m curriculum.lessons.s08_context_compaction.demo
python3 -m curriculum.golden verify s08-context-compaction
python3 -m unittest curriculum.tests.test_course_contract
```

1. add a protected negative constraint to the scripted session;
2. make `summarize_history` omit it and write a test that fails;
3. add `replaced_event_ids` and `retained_event_ids` to the trace payload;
4. retain one recent call/result pair and verify it remains atomic;
5. create an invalid artifact handle and make installation fail closed.

You understand the mechanism when you can replay the full durable branch, inspect exactly what the model received after compaction, and explain every lost detail as an intentional policy outcome.

### Research checkpoint

> A summary is not evidence of preservation. The lineage, invariant checks, and downstream probes are.

No formal cross-Agent experiment is registered for this mechanism yet. The lesson is a controlled reference; the three Agent mappings are source-backed Claims, not reproduced Native traces.
