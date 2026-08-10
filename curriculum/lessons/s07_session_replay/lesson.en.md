# s07 · Session Event Logs, Replay, and Branching

> A durable session is not a mutable chat object. It is an ordered factual log from which the harness can rebuild views, prove lineage, and start a branch without rewriting history.

## What you will build {#learn}

s01–s06 used Trace 0.1 primarily for observation: events explained what the loop, model, tools, and context policy had done. This chapter makes the next architectural move. The same normalized events become an **append-only session journal**. A deterministic reducer replays the journal into a useful view, and a branch record points at an exact parent sequence.

By the end, you should be able to:

- distinguish a factual event from a derived replay view and from a future command;
- validate sequence, session identity, run identity, parent ordering, and stable event IDs;
- rebuild user messages, final assistant messages, tool results, and stop state;
- explain why streaming deltas need a final-event rule during replay;
- create a branch that records its parent run, fork sequence, inherited event IDs, and fingerprint;
- identify what this teaching journal still lacks for crash-safe production storage.

### Prerequisites

You should understand the event stream from s02 and the full tool roundtrip from s03. s06 introduced the separation between the complete factual record and the model-visible context projection. That separation is essential here: replay reads the factual record; it does not assume that every historical event was visible to the model.

---

## The problem: mutable session state cannot explain itself {#problem}

Suppose a process keeps one Python object containing `messages`, `status`, `files_changed`, and `current_turn`. It works until the process crashes, an upgrade changes the object shape, a user asks to rewind, or an auditor asks why a value exists. Saving the latest object answers “what is present now,” but often loses “which accepted fact produced it.”

A coding-agent session has several competing needs:

| Need | A mutable snapshot alone | An append-only journal |
| --- | --- | --- |
| Resume after a crash | Only if the latest write was complete | Replay all durable events, possibly after a checkpoint |
| Explain a tool result | Final state may hide the request | Request, result, actor, and parent remain visible |
| Branch from an earlier point | Requires copying and editing state | Reference an exact prefix and add a new lineage |
| Migrate a derived view | Hard when old state shape is gone | Run a new reducer over preserved events |
| Detect tampering or drift | Weak without provenance | Fingerprint an exact ordered prefix |

The journal is not automatically correct merely because it is append-only. A malformed stream can skip a sequence, mix two sessions, reference a future parent, duplicate an event ID, or contain an event that was acknowledged before it became durable. The harness must define and test these invariants.

> Event sourcing is not “save every debug log.” Only normalized facts that belong to the session contract should drive replay. Diagnostic noise can live elsewhere.

---

## Mental model: facts, projections, and lineage {#mental-model}

Use three layers instead of one overloaded session object:

```text
FACT LOG                         DERIVED VIEW
evt-000 session.start   ─┐
evt-001 user.message     ├── replay reducer ──> ReplayState
evt-002 model.request    │                      messages / results / stop
evt-003 model.response   │
evt-004 session.stop    ─┘
          │
          └── branch at sequence 2 ──> SessionBranch
                                           parent run + exact prefix
```

- **Facts** say what was observably accepted: a user message arrived, a model response completed, or a tool result returned.
- **Projections** are rebuildable answers to a question: current transcript, changed-file list, cost totals, or UI timeline.
- **Lineage** identifies which factual prefix a new branch inherits.
- **Commands** request future work. A branch record does not pretend that the alternative response has already happened.

### Five journal invariants

1. `sequence` starts at zero and is contiguous inside one run.
2. A journal contains exactly one `session_id` and one provenance `run_id`.
3. Each `parent_event_id`, when present, refers to an earlier event.
4. Replay is deterministic: the same ordered bytes produce the same projection fingerprint.
5. Branch creation never edits, deletes, or renumbers the parent prefix.

The reference implementation enforces the first two in `SessionJournal`. The repository-wide trace validator enforces parent ordering and duplicate IDs. Golden Trace tests cover deterministic output and lineage.

---

## Build the journal and reducer step by step {#build}

### Step 1: keep the input immutable

`SessionJournal` accepts a sequence and immediately stores a tuple:

```python
class SessionJournal:
    def __init__(self, events):
        if not events:
            raise ValueError("a session journal needs at least one event")
        self.events = tuple(events)
```

The tuple does not deeply freeze nested dictionaries, so it is a teaching boundary rather than tamper-proof storage. Production code normally serializes accepted events, computes a content hash, and prevents callers from retaining mutable references.

### Step 2: reject gaps and mixed identity

The sequence rule is deliberately strict:

```python
sequences = [event.get("sequence") for event in self.events]
if sequences != list(range(len(self.events))):
    raise ValueError("event sequence must be contiguous and start at zero")
```

Then the journal computes the set of session IDs and run IDs. Either set having more than one value is an error. This prevents an attractive but dangerous shortcut: concatenating event files and treating the result as one resumable run.

### Step 3: reduce events by semantic type

`replay()` walks the selected prefix once. The reducer does not copy every payload into state. It chooses fields relevant to this view:

```python
if event_type == "user.message":
    users.append(str(payload.get("content", "")))
elif event_type == "tool.result":
    tool_results.append(dict(payload))
elif event_type == "session.stop":
    stop_reason = str(payload.get("reason", "unknown"))
```

Another reducer could compute elapsed time, permission decisions, or changed paths from the same log. Keeping reducers separate prevents UI concerns from changing the factual schema.

### Step 4: normalize streaming responses during replay

s02 emits one `model.response` per delta. Replaying every delta as a complete assistant message would duplicate text. The reducer therefore accepts a normal response with `content`, or only the streaming event whose `final` field is true:

```python
if "content" in payload:
    assistants.append(str(payload["content"]))
elif payload.get("final") is True:
    assistants.append(str(payload.get("accumulated", "")))
```

This rule belongs to the projection contract. If a provider adapter changes how it marks the final delta, normalization must happen before the event enters the canonical journal.

### Step 5: fingerprint the exact prefix

The teaching implementation serializes selected events with sorted JSON keys and hashes the bytes:

```python
wire = json.dumps(
    events,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
)
fingerprint = hashlib.sha256(wire.encode("utf-8")).hexdigest()
```

This detects projection input drift; it is not a signature and does not establish who wrote the events. Production integrity may require a hash chain, authenticated storage, or signed checkpoints.

### Step 6: model a branch as lineage, not a copied transcript

`branch()` first replays through `fork_sequence`, then records the exact inherited IDs:

```python
return SessionBranch(
    branch_id=branch_id,
    parent_session_id=parent.session_id,
    parent_run_id=parent.run_id,
    fork_sequence=fork_sequence,
    inherited_event_ids=tuple(event["event_id"] for event in selected),
    parent_fingerprint=parent.fingerprint,
)
```

The new branch can later receive its own session/run identity and new events. The record never claims that inherited events were re-executed. This distinction matters for tools with side effects: branching before a file write does not undo the write in the real workspace.

### Step 7: make replay and branch visible

The demo runs an ordinary bounded agent session, creates a journal, and appends two observation events:

```python
session.replay  -> applied_events, stop_reason, fingerprint
session.branch  -> branch_id, parent_run_id, fork_sequence, inherited_events
```

They occur after `session.stop` because they describe post-run journal operations, not another model turn. A production event taxonomy may store lifecycle facts and administrative journal operations in related streams instead.

---

## Run and inspect the Golden Trace {#run}

From the repository root:

```bash
python3 -m curriculum.lessons.s07_session_replay.demo
```

The expected event order is:

```text
session.start → user.message → model.request → model.response
→ session.stop → session.replay → session.branch
```

Verify the committed trace against a fresh execution:

```bash
python3 -m curriculum.golden verify s07-session-replay
```

### Read the replay payload

The `session.replay` payload reports five applied execution events and a completed stop reason. Its fingerprint covers the original prefix through `session.stop`; it does not include the replay event itself.

### Read the branch payload

The branch forks at sequence 2, immediately after the first `model.request`. It inherits event IDs `evt-000` through `evt-002`. The original response and stop event remain in the parent history but are not part of the inherited prefix.

### Prove determinism locally

Run the demo twice and compare the JSONL below the `TRACE:` marker. The teaching recorder uses a fixed clock, deterministic IDs, and a scripted model, so the bytes match. Real sessions use real time and globally unique IDs; their semantic fingerprint usually normalizes volatile fields before comparison.

---

## Failure modes and recovery boundaries {#failure-modes}

| Failure | Why it is dangerous | Required response |
| --- | --- | --- |
| Missing sequence | A fact may have been lost or only partially written | Stop replay or recover from durable storage; never silently renumber |
| Duplicate delivery | A retry can apply a tool result twice | Use stable event IDs and idempotent append semantics |
| Mixed run IDs | Two causal histories become one false transcript | Partition by session/run before replay |
| Future parent | Causality points to an event not yet accepted | Reject the event as invalid or incomplete |
| Delta replayed as message | Assistant text is duplicated | Reduce only final accumulated streaming state |
| Branch assumed to undo effects | Files or processes remain changed | Pair logical lineage with workspace checkpoint/rollback in s13 |
| Mutable payload changed later | Fingerprints and audits disagree | Serialize or deep-freeze at the append boundary |
| New reducer cannot read old event | Upgrade breaks resume | Version schemas and migrate projections, not historical facts in place |

> Replay makes behavior reproducible only to the degree captured by the log. It cannot recreate hidden model state, external network changes, or an unrecorded filesystem mutation.

---

## Exercises with acceptance criteria {#exercises}

### A. Reject a sequence gap

Copy the first three events, change the last sequence from `2` to `4`, and construct `SessionJournal`. Acceptance: it raises `ValueError` before any replay view is returned.

### B. Partial replay

Replay through sequence 2. Acceptance: the projection contains the user message, no assistant message, no stop reason, and exactly three applied sequences.

### C. Streaming reducer

Use the s02 trace as input. Acceptance: the projection contains one assistant message equal to the final accumulated text, not three delta messages.

### D. Stable branch identity

Create two branches at the same sequence with different branch IDs. Acceptance: parent fingerprint and inherited event IDs match, while branch IDs differ.

### E. Duplicate-delivery policy

Design `append(event)` with a stable event ID. Decide whether an identical retry is ignored and a conflicting duplicate is rejected. Write a table covering both cases and the durable acknowledgement point.

### F. Snapshot acceleration

Add a checkpoint containing reducer version, source sequence, source fingerprint, and serialized projection. Acceptance: replay from the checkpoint plus tail equals replay from event zero.

Run the focused contract:

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s07_replays_and_branches -v
```

---

## Deep dive: production session architecture {#deep-dive}

### Durability and acknowledgement

The critical ordering is “durable append before success acknowledgement.” If the UI displays a tool result before the event is durable, a crash can leave the user believing a fact that replay cannot recover. Storage can be a transactional database, an fsynced segment, or a remote log, but the contract must name the durable point.

### Idempotency and exactly-once illusions

Networks retry. Most systems cannot guarantee exactly-once delivery across model providers, tools, storage, and UI. They approximate safe behavior with stable call IDs, deduplicated event IDs, idempotent handlers, and explicit reconciliation. A journal records what the harness accepted; it does not magically make a non-idempotent shell command safe.

### Checkpoints without deleting facts

Long logs make replay expensive. A checkpoint can cache a projection at sequence N and replay only N+1 onward. It must record reducer/schema version and source fingerprint. Deleting the source events turns an acceleration structure into an irreversible authority and weakens auditability.

### Schema evolution

Additive event fields are usually easier than changing meaning. Reducers should tolerate unknown optional fields but reject an unknown event type if ignoring it would change state. Migrations can produce a new projection version while retaining original wire events and provenance.

### Branches and real workspaces

A logical branch selects conversation history. A coding agent also acts on files, Git state, processes, services, and remote systems. Safe branching therefore needs an artifact policy: immutable artifact handles may be shared; mutable workspaces may need Git commits, copy-on-write directories, containers, or worktrees. s13 connects lineage to checkpoints and rollback.

### Privacy and deletion

Append-only is a reliability property, not permission to retain secrets forever. Redaction should happen before publication, and private storage needs retention, encryption, access control, and deletion procedures. Some compliance deletions may require tombstones or encrypted-key destruction rather than pretending the historical event never existed.

### What real-agent mappings prove

The linked Codex, Pi, and Reasonix Claims establish source-backed event or session logging mechanisms at pinned revisions. They do not prove that those products use this `SessionJournal`, fingerprint format, or branch record. The relationship is intentionally marked **adjacent**.

---

## Checkpoint {#checkpoint}

Before moving to semantic compaction, make sure you can answer:

1. Why is a replay projection not the source of truth?
2. Which event should produce an assistant message for a streamed response?
3. What exact information makes a branch's parent lineage auditable?
4. Why does branching a session not roll back filesystem effects?
5. What must be durable before the harness acknowledges an event?
6. How can a checkpoint accelerate replay without replacing the factual log?

s08 will use this complete, replayable journal as the safety net beneath lossy context compaction. The model may see a smaller checkpoint, while the harness keeps the source events needed to audit or rebuild it.
