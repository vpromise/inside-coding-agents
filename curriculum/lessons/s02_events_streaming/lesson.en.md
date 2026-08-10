# s02 · Streaming and Events

> A transport chunk is “bytes arriving now.” An assistant message is “what the model finally said.” Never confuse the two.

## What you will build {#learn}

s01 established a bounded loop, but its response still looked like one returned string. Real models usually stream: text arrives incrementally, tool-call arguments may be fragmented, and the connection can fail halfway through. This chapter converts transport deltas into stable events while keeping conversation state clean.

By the end, you should be able to:

- Distinguish provider chunks, observable events, and the final assistant message.
- Explain why a UI may update token by token while `messages` is appended only once.
- Design an ordered, correlated, redaction-aware event sequence.
- Use `delta` and `accumulated` to detect missing, duplicated, or out-of-order data.
- Run the deterministic streaming demo and verify that its projections agree.

---

## The problem: streaming creates two timescales {#problem}

A non-streaming request has only “before” and “after.” A streaming request introduces two different clocks:

1. **Transport time**: when chunks arrive, retry, or disconnect.
2. **Conversation time**: which assistant message the completed turn contributes.

Appending one assistant message per chunk would create a history the model never produced:

```text
assistant: "Observe "
assistant: "events, "
assistant: "not hidden state."
```

Those were not three model turns. They were three deliveries for one turn. The correct final state is:

```text
assistant: "Observe events, not hidden state."
```

> Streaming is a transport concern; message history is a conversation concern; the event stream is an observability concern.

---

## Mental model: one fact, three projections {#mental-model}

One model turn appears on three surfaces:

| Surface | Consumer | Incremental? | What remains |
| --- | --- | --- | --- |
| Provider stream | Adapter | Yes | Native chunks or deltas |
| Trace events | UI, eval, audit | Yes | Observable state transitions |
| `messages` | Next model turn | No | One complete assistant message |

The data flow is:

```text
provider chunks
  "Observe " ─┐
  "events, " ─┼─> accumulator ─> "Observe events, not hidden state."
  "not..."   ─┘         │
                         ├─> model.response event × 3
                         └─> assistant message × 1
```

### Events are not hidden-state dumps

A trace records facts the harness actually observes: deltas, accumulated text, tool requests, execution results, and stop reasons. It does not record invisible chain-of-thought, and it should not contain credentials, full environment variables, or unredacted file contents.

### Four properties of a reliable event stream

1. **Ordered**: `sequence` increases strictly within a session.
2. **Correlated**: parent IDs or tool-call IDs connect related work.
3. **Explainable**: actor identifies user, model, harness, or tool.
4. **Publishable**: redaction and provenance state the evidence boundary.

---

## Turn chunks into events step by step {#build}

### Step 1: make the model double return chunks

The demo declares three deterministic deltas:

```python
model = ScriptedModel([
    ModelTurn(chunks=(
        "Observe ",
        "events, ",
        "not hidden state.",
    ), stop=True)
])
```

`ModelTurn.resolved_content` defines final text:

```python
@property
def resolved_content(self) -> str:
    return "".join(self.chunks) if self.chunks else self.content
```

The adapter may consume any provider-native chunk type, but it must present a stable internal representation to the harness.

### Step 2: keep an accumulator for visible progress

`AgentRunner` processes each chunk:

```python
accumulated = ""
for index, chunk in enumerate(turn.chunks):
    accumulated += chunk
    self._emit(
        "model.response",
        actor_kind="model",
        actor_id=self.config.model_id,
        payload={
            "turn": turn_number,
            "delta": chunk,
            "accumulated": accumulated,
            "final": index == len(turn.chunks) - 1,
            "tool_calls": [],
        },
    )
```

`delta` is useful for transport analysis; `accumulated` lets a player display the current complete text. A production store may keep only deltas to save space, but then the player must rebuild the projection reliably.

### Step 3: append one message after the stream

After all events, the loop appends `resolved_content`:

```python
final_text = turn.resolved_content
messages.append(Message(role="assistant", content=final_text))
```

That line is outside the chunk loop. Its position enforces “three response events, one assistant message.”

### Step 4: preserve causality in the trace

`AgentRunner._emit()` uses the previous event as the next parent:

```python
event_id = self.trace.emit(
    event_type,
    parent_event_id=self._parent_event_id,
    **kwargs,
)
self._parent_event_id = event_id
```

The teaching run is a linear chain. Parallel tools create a branching DAG, where “the previous event” is no longer enough.

### Step 5: mark the final delta explicitly

The last event carries `final: true`. Consumers do not need an inactivity timeout or a socket close to guess whether business-level completion occurred.

---

## Run it and compare the projections {#run}

Execute:

```bash
python3 -m curriculum.lessons.s02_events_streaming.demo
```

Inspect the three `model.response` events:

| Number | `delta` | `accumulated` | `final` |
| --- | --- | --- | --- |
| 1 | `Observe ` | `Observe ` | false |
| 2 | `events, ` | `Observe events, ` | false |
| 3 | `not hidden state.` | `Observe events, not hidden state.` | true |

Then verify the final run state:

```python
runner, trace = build_demo()
result = runner.run("Stream one observability rule.")

assert result.final_text == "Observe events, not hidden state."
assert result.messages[-1].role == "assistant"
assert result.messages[-1].content == result.final_text
```

### Check projection consistency

The final message, last `accumulated` field, and `result.final_text` must match:

```python
responses = [
    event for event in result.events
    if event["type"] == "model.response"
]
assert responses[-1]["payload"]["accumulated"] == result.final_text
```

A failed assertion means transport and conversation state have diverged.

---

## From events to a player {#code-reading}

A trace player does not need to understand the model SDK. It consumes normalized events and maintains a cursor:

```text
cursor = 0
visible = events[:cursor + 1]
current = visible[-1]
```

That enables:

- **Pause** at any observable state.
- **Replay** the user-visible sequence.
- **Compare** event types, results, and stop reasons across runs.

Do not treat timestamps as perfect causality. Distributed clocks drift; sequence, parent relationships, and correlation IDs are stronger evidence.

---

## Common streaming failure modes {#failure-modes}

| Failure | Risk | Required policy |
| --- | --- | --- |
| Duplicate chunk | Repeated text or corrupted arguments | Provider event-ID dedupe or idempotent accumulation |
| Out-of-order chunk | Invalid JSON or a regressing UI | Sequence validation, rejection, or buffering |
| Disconnect | Partial text mistaken for completion | Separate interrupted/error terminal state |
| Empty chunk | Consumer assumes no progress | Permit empty deltas while preserving sequence |
| Fragmented tool JSON | Incomplete arguments execute early | Wait for content-block completion before validation |
| Slow consumer | Memory grows without bound | Bounded queues, backpressure, sampling, or persistence |
| Sensitive text in traces | Published data leaks secrets | Field-level redaction before storage |

---

## Exercises {#exercises}

### A. Empty delta

Make the second chunk an empty string. Acceptance: sequence remains continuous, final text has no duplication, and the final response still has `final: true`.

### B. Projection property test

For any tuple of chunks, assert:

1. Response-event count equals chunk count.
2. Every `accumulated` value is a prefix of the next one.
3. The final `accumulated` equals `"".join(chunks)`.
4. Only one new assistant message appears.

### C. Interruption contract

Design a teaching `stream_error` field on `ModelTurn`; do not overload `stop=True`. Acceptance: traces distinguish normal completion from transport interruption, and you document whether partial text enters messages.

### D. Tool-call assembler

Design an accumulator for `{"path"`, `: "README`, and `.md"}`. Dispatch to s03 only after valid JSON and a content-block end signal both exist.

---

## Deep dive: production event-bus choices {#deep-dive}

The teaching implementation keeps events in an in-memory list. A production system must also answer:

- Persist first or push to the UI first?
- Resume a reconnect from event ID, sequence, or timestamp?
- Retain every token delta or aggregate high-frequency events?
- Represent parent relationships as a DAG when tools run concurrently?
- Redact in the adapter, event bus, or storage layer?
- Let an old player read a newer event schema?

A useful layering is: provider adapter parses protocol, harness emits semantics, transport delivers, storage retains, and UI projects. No layer should reverse-engineer meaning that its upstream layer failed to declare.

> A good event system does not “record everything.” It records enough observable fact under a stable contract and clearly states what was never recorded.

---

## Checkpoint {#checkpoint}

Before s03, make sure you can answer:

1. Why can’t three chunks become three assistant messages?
2. Which consumers need `delta` and which need `accumulated`?
3. Why is socket close not business completion?
4. Why does a linear parent chain fail with parallel tools?
5. Should trace redaction happen before or after publication?

The next chapter lets the model produce structured `ToolCall` values. The harness must validate names and arguments, execute handlers, record results, and feed them into the next turn.
