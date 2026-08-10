# s09 · Memory and On-Demand Skills

> Context should contain what the next turn needs, not every fact and capability the harness has ever learned. Durable memory and full skill instructions stay outside the resident prompt until explicit retrieval or loading.

## What you will build {#learn}

s08 compressed older session history into a checkpoint. Compaction still starts from information already in one session. Coding agents also need project facts that outlive a turn, and capability instructions too large to keep in every request. This chapter adds two deliberately separate stores:

- `MemoryStore` holds selected facts with stable identity, scope, and source attribution.
- `SkillCatalog` keeps lightweight descriptors resident and loads full instructions only after a skill is selected.

Both enter the loop through structured tools and visible `memory.read` / `skill.load` events. Nothing is described as the model “remembering” data that the harness actually retrieved.

By the end, you should be able to:

- distinguish message history, compacted checkpoints, durable memory, artifacts, instructions, and skills;
- define a provenance-bearing memory record and deterministic retrieval contract;
- explain why memory writes need stricter review than reads;
- keep skill descriptors small while loading full instructions and tool requirements on demand;
- trace retrieval and loading without exposing hidden reasoning;
- identify stale-memory, poisoning, prompt-injection, capability-escalation, and privacy risks.

### Prerequisites

You should understand context budgets, compaction, tool dispatch, and instruction precedence from s03, s05, s06, and s08. The retrieval algorithm here is intentionally lexical and deterministic. It teaches boundaries, not state-of-the-art semantic search.

---

## The problem: “put everything in the prompt” does not scale {#problem}

A mature agent may know about repository conventions, past architectural decisions, test commands, user preferences, dozens of skills, hundreds of MCP tools, and large artifacts. Injecting everything into every model request creates four failures:

1. **Budget pressure:** static capability text competes with the current task.
2. **Attention dilution:** irrelevant instructions make the relevant rule harder to follow.
3. **Staleness:** an old fact remains silently active after the project changes.
4. **Authority confusion:** retrieved data, project policy, tool output, and model text look equally trusted.

The opposite extreme—never retaining anything—forces repeated discovery and loses durable decisions. The harness needs selective persistence and explicit retrieval.

| Data class | Typical lifetime | Authority | How it enters context |
| --- | --- | --- | --- |
| Recent messages | Current session | User/model/tool event | Loop state |
| Compacted checkpoint | Current session/branch | Derived from journal | Context policy |
| Project instructions | Directory/version scoped | Repository policy | Instruction discovery |
| Artifact | Task or durable storage | Tool/environment result | Handle plus explicit read |
| Memory record | Turn, session, project, or user scope | Curated fact with source | Retrieval result |
| Skill descriptor | Installation scope | Extension metadata | Small resident catalog |
| Skill instructions | Loaded task scope | Reviewed extension content | Explicit load |

> Memory is not a larger system prompt. It is a database with selection, provenance, invalidation, trust, and observability requirements.

---

## Mental model: external stores and a context compiler {#mental-model}

The model sees a finite projection compiled for one turn:

```text
current user task
      │
      ├── memory_search(query) ──> source-attributed facts
      │                                  │
      ├── skill descriptors ── select ── load_skill(id)
      │                                  │
      └──────────── context compiler ◄───┘
                         │
                         ▼
                  next model.request
```

Memory and skills share “load on demand,” but their semantics differ:

- A **memory** claims something about a project, user, or prior work. It needs freshness and evidence.
- A **skill** contributes procedural instructions, tools, or workflow. It needs installation trust and capability review.
- An **artifact** is usually a large immutable or versioned result addressed by a handle.
- An **instruction** has policy precedence and may constrain all work under a directory.

Treating these as one bag of text makes it impossible to reason about authority.

### Retrieval contract

A useful retrieval response answers:

1. Which query and scope were used?
2. Which record IDs matched, in what stable order?
3. What source supports each record?
4. When was it written or last validated?
5. Was the result truncated, filtered, or denied?

The lesson implements the first three. Later production work should add timestamps, version ranges, confidence, contradiction state, and access policy.

---

## Build memory and lazy skills step by step {#build}

### Step 1: give each memory identity and source

The smallest record is explicit:

```python
@dataclass(frozen=True)
class MemoryRecord:
    id: str
    content: str
    scope: str
    source: str
```

`content` alone would be ambiguous. `scope="workspace"` says where the fact applies; `source="AGENTS.md#testing"` lets a user or validator find the policy that supports it.

### Step 2: make writes deliberate

`remember()` rejects duplicate IDs and empty content/source:

```python
def remember(self, record):
    if record.id in self._records:
        raise ValueError(f"memory already exists: {record.id}")
    if not record.content.strip() or not record.source.strip():
        raise ValueError("memory content and source must be non-empty")
    self._records[record.id] = record
```

The demo preloads one reviewed record. It does not let the model write memory. A production write path should require a schema, scope, source evidence, secret scan, contradiction check, and often user or policy approval.

### Step 3: use deterministic retrieval before semantic ranking

The teaching search lowercases query terms, counts term matches, and sorts by descending score then stable ID:

```python
terms = {term for term in query.lower().split() if term}
score = sum(term in haystack for term in terms)
ranked.sort(key=lambda item: (-item[0], item[1]))
```

This is not sophisticated, but it is reproducible and easy to test. Vector search introduces embedding versions, distance thresholds, index freshness, and nondeterministic ties that need their own experiment contract.

### Step 4: expose retrieval as a bounded tool

The model requests `memory_search` with a structured query. The handler returns only matching records:

```python
{
  "matches": [
    {
      "id": "project-test-policy",
      "content": "Run the focused test before the full suite.",
      "source": "AGENTS.md#testing"
    }
  ]
}
```

The tool result enters message history using the same roundtrip contract as s03. Retrieval does not bypass tool validation or context budgets.

### Step 5: record `memory.read`

The handler emits an observation between `tool.request` and `tool.result`:

```python
trace.emit(
    "memory.read",
    actor_kind="harness",
    actor_id="workspace-memory",
    payload={
        "query": query,
        "match_ids": [...],
        "sources": [...],
    },
)
```

The event records selection and provenance, not hidden model reasoning. Sensitive memory content may be omitted from public traces while IDs and redaction status remain.

### Step 6: keep skill descriptors resident

`SkillCatalog.descriptors()` returns only identity and a short description:

```python
{"id": "test-first", "description": "Choose focused checks before broad regression tests."}
```

If fifty skills each contain a thousand tokens of instructions, descriptors let the harness or model choose one without spending the entire context budget. Descriptor quality becomes a retrieval problem: it must be specific enough to select correctly without embedding the whole skill.

### Step 7: load full instructions explicitly

After selection, `load_skill` returns instructions and tool requirements:

```python
{
  "id": "test-first",
  "instructions": "Run the smallest relevant test, inspect failure, then widen coverage.",
  "tool_names": ["run_command"]
}
```

Loading instructions does not automatically grant the named tools. s10 and s11 separate approval and sandbox policy from capability description.

### Step 8: record `skill.load`

The trace event includes the stable skill ID and declared tool names. A production event may also include package version, content digest, signer/trust source, load reason, and instruction size.

### Step 9: continue through the ordinary loop

The first scripted model turn requests both tools. The runner executes them in order, appends two tool messages, and makes the second model request. No memory-specific control loop is required; memory and skills are extensions of the existing tool/event protocol.

---

## Run the retrieval path {#run}

Execute:

```bash
python3 -m curriculum.lessons.s09_memory_skills.demo
```

The central event sequence is:

```text
tool.request memory_search
memory.read
tool.result memory_search
tool.request load_skill
skill.load
tool.result load_skill
model.request
```

Verify all 13 committed events:

```bash
python3 -m curriculum.golden verify s09-memory-skills
```

### Inspect the evidence path

The `memory.read` event names `project-test-policy` and `AGENTS.md#testing`. The following tool result includes the content. A UI can link the source; a public trace can redact content while retaining the record identity.

### Inspect the capability path

The `skill.load` event names `test-first` and `run_command`. That declaration is informational. The demo does not register `run_command`, so the loaded skill cannot silently execute it. Capability grant remains a separate harness decision.

### Inspect the second request

`runner.model.requests[1]` has four messages: user, assistant, memory tool result, and skill tool result. This makes the retrieval boundary visible in ordinary model history.

---

## Failure modes and trust boundaries {#failure-modes}

| Failure | Consequence | Safer design |
| --- | --- | --- |
| Stale memory | Agent follows an obsolete command or architecture | Version scope, validation date, invalidation and contradiction state |
| Memory poisoning | Untrusted tool output becomes durable authority | Restricted write path, source allowlist, review and provenance |
| Secret retention | Credential survives across sessions | Classification, secret scan, encryption, retention and deletion |
| Over-broad scope | One project's rule affects another | Explicit workspace/user/session namespace |
| Retrieval flood | Irrelevant records consume context | Limit, threshold, diversity, size budget and “no match” result |
| Descriptor ambiguity | Wrong skill is loaded | Specific descriptions, examples, conflict tests and explicit selection |
| Skill prompt injection | Loaded instructions override higher policy | Trust tiers, instruction delimiters and precedence compiler |
| Capability escalation | Skill declares a dangerous tool and gains it | Tool grants remain policy-controlled; declaration is not authorization |
| Package drift | Same skill ID resolves to new content | Version pin and content digest in load event |
| Silent no-match fallback | Model invents a “remembered” fact | Explicit empty result and visible uncertainty |

> Retrieved text is data with provenance, not automatically a trusted instruction. Its authority depends on type, scope, source, and policy.

---

## Exercises with acceptance criteria {#exercises}

### A. No-match behavior

Search for `deployment region`. Acceptance: return an empty tuple and emit `memory.read` with no match IDs; the model must not receive an invented default.

### B. Stable ranking

Add two records with the same score. Acceptance: results are ordered by stable ID, so repeated runs produce the same Golden Trace.

### C. Contradictory memory

Add a newer record contradicting `project-test-policy`. Design fields for `supersedes`, `valid_from`, and `status`. Acceptance: retrieval never returns both as equally current facts.

### D. Memory write gate

Add a `memory_write` proposal that cannot commit directly. Acceptance: missing source, secret-like content, or workspace mismatch is rejected; an approved write emits `memory.write` with redacted metadata.

### E. Skill digest

Calculate SHA-256 over canonical skill content and include it in `skill.load`. Acceptance: changing instructions without changing the digest fails validation.

### F. Capability separation

Load a skill that declares `run_command` while the tool registry lacks it. Acceptance: the skill text is available, but any request for the absent tool receives an unknown-tool error.

Run the focused contract:

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s09_retrieves_memory_and_loads_skill -v
```

---

## Deep dive: production retrieval architecture {#deep-dive}

### Memory lifecycle

A durable record needs creation, validation, retrieval, update, contradiction, expiration, and deletion states. Append-only history can record changes while a current projection selects the active version. “Last write wins” is rarely adequate for safety-critical constraints.

### Scope and identity

Useful scopes include turn, branch, session, workspace, repository revision, user, and organization. A memory should bind to stable project identity, not only a local absolute path. Forked repositories and renamed workspaces require explicit lineage rules.

### Retrieval evaluation

Measure recall of necessary facts, precision of returned facts, stale-record rate, contradiction handling, context cost, latency, and downstream task success. A high semantic-similarity score is not enough if the retrieved fact has the wrong version or authority.

### Prompt injection and data/instruction separation

Tool output or documentation can contain imperative text. A memory reducer should not automatically transform “ignore previous instructions” into durable policy. Store data with type and source, compile trusted instructions through a separate precedence system, and expose untrusted text with clear delimiters.

### Skill supply chain

Skills are executable-adjacent content. Production catalogs need package origin, version, digest/signature, allowed tools, network expectations, lifecycle hooks, and update policy. Loading a skill can change agent behavior even without code execution, so review and provenance matter.

### Lazy tools and schema stability

Some systems keep placeholder descriptors stable and start MCP servers or reconcile live schemas only when selected. This improves startup and cache behavior but introduces load failures mid-task. Events should distinguish selection, process startup, schema reconciliation, and final availability.

### Real-agent evidence boundary

The linked source/documentation claims cover Codex skills/plugins, Pi extensions, Reasonix lazy plugin/MCP behavior, and Claude Code hooks. They support an adjacent extension-runtime comparison. They do not establish a shared durable-memory implementation across products.

### From context to safety

Memory and skills can influence actions, but they must not own authorization. A remembered preference cannot override a fresh denial, and a skill requiring shell access cannot grant itself that access. s10 begins the safety track by inserting explicit approval policy between model request and effect.

---

## Checkpoint {#checkpoint}

Before entering safety, answer:

1. How does durable memory differ from a compacted checkpoint?
2. Why must every memory record carry scope and source?
3. Why are memory writes riskier than memory reads?
4. What should stay in a skill descriptor, and what should load later?
5. Why does a skill's tool declaration not authorize the tool?
6. Which events make retrieval and loading auditable?

You now have the full context track: deterministic instructions, hard budgets, replayable facts, semantic compaction, and on-demand retrieval. The next chapter will decide whether a requested action is permitted before any side effect occurs.
