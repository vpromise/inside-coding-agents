# s01 · The Minimal Agent Loop

> The model proposes the next step. The harness owns the loop, state, boundaries, and stop conditions.

## What you will build {#learn}

This chapter starts with an ordinary model call and turns it into an agent loop that is **bounded, observable, and testable**. Tools are intentionally postponed: first make the control skeleton obvious, then connect the tool roundtrip to the same loop in s03.

By the end, you should be able to:

- Explain the difference between a Model, a Harness, and an Agent Product.
- Describe why `messages` is controlled loop state rather than an informal chat transcript.
- Identify three run exits: normal completion, `max_turns`, and failure.
- Reconstruct user input → model request → model response → session stop from a trace.
- Run and modify the offline example without a network connection or API key.

### Prerequisites

You only need basic Python: functions, lists, `for` loops, and dataclasses. `ScriptedModel` is a deterministic model double. It does not imitate model intelligence; it makes harness behavior repeatable enough to test.

---

## The problem: one model call is not an agent {#problem}

A regular LLM request goes in one direction: send messages, receive one output, end the program. If the model writes “next I need to read a file,” no file is read. If it notices that work remains, it cannot request another turn by itself.

A working agent product needs at least two distinct roles:

| Role | What it decides | What it must not silently decide |
| --- | --- | --- |
| Model | Proposes text or structured actions from visible context | Whether a file was really changed or a command was authorized |
| Harness | Stores state, calls the model, executes approved effects, and stops | Hidden model reasoning or conclusions the model never produced |

The smallest bridge between those roles is a loop. Without the loop, model output is advice. With the loop, the result of one turn can become input to the next.

> An agent loop is not a spell that makes a model “think more.” It is an explicit control contract: when to call, what to store, why to continue, and why to stop.

---

## Mental model: a state machine, not a `while True` incantation {#mental-model}

Treat one run as a bounded state machine:

```text
START
  │
  ├─ append user message
  │
  ├─ request model ──> append assistant message
  │                         │
  │                         ├─ needs action ──> continue
  │                         └─ no action ─────> COMPLETE
  │
  └─ turn budget exhausted ──────────────────> MAX_TURNS
```

The loop owns four kinds of state:

| State | Representation here | Why it matters |
| --- | --- | --- |
| Conversation | `messages` | What the model can see next |
| Iteration | `turn_number` | Where execution is in the run |
| Configuration | `AgentConfig.max_turns` | Prevents unbounded execution |
| Observation | `TraceRecorder.events` | Makes past behavior inspectable |

### Three invariants that must always hold

1. Every `model.request` message sequence is explainable from harness state.
2. Each assistant turn is appended exactly once; streaming chunks never become separate assistant messages.
3. Every run ends with an explicit `session.stop`; it never disappears silently.

These invariants survive the tool, context, and permission layers added later.

---

## Build the loop step by step {#build}

### Step 1: represent a turn with provider-neutral types

The project does not leak vendor SDK objects into the core loop. The model boundary accepts `Message` values and returns a `ModelTurn`:

```python
@dataclass(frozen=True)
class Message:
    role: Role
    content: str

@dataclass(frozen=True)
class ModelTurn:
    content: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    chunks: tuple[str, ...] = ()
    stop: bool = False
```

The important benefit is isolation. An OpenAI, Anthropic, or local-model adapter can translate at the edge while the loop keeps one internal protocol.

### Step 2: create the initial message state

`AgentRunner.run()` appends an optional system prompt, then the user input:

```python
messages: list[Message] = []
if self.system_prompt:
    messages.append(Message(role="system", content=self.system_prompt))
messages.append(Message(role="user", content=user_input))
```

Order is state. System constraints come first and the current user intent follows. In s02, response chunks arrive incrementally, but they will still produce only one final assistant message.

### Step 3: give the loop a hard bound

The teaching implementation uses a bounded `for`, not a naked `while True`:

```python
for turn_number in range(1, self.config.max_turns + 1):
    turn = self.model.respond(messages, self.tools.descriptors())
    final_text = turn.resolved_content
    messages.append(Message(role="assistant", content=final_text))

    if not turn.tool_calls:
        return completed_result(...)
```

No tool calls is the reference harness’s completion signal. Once tools arrive in s03, a non-empty `tool_calls` tuple tells the harness to execute actions, append their results, and enter another turn.

### Step 4: make budget exhaustion explicit

When all turns are consumed, the loop must not pretend it succeeded:

```python
self._emit(
    "error",
    actor_kind="harness",
    actor_id=self.config.agent_id,
    payload={"kind": "max-turns", "max_turns": self.config.max_turns},
)
self._emit(
    "session.stop",
    actor_kind="harness",
    actor_id=self.config.agent_id,
    payload={"reason": "max-turns"},
)
```

The caller receives `RunResult.stop_reason == "max-turns"`, not an ambiguous empty string. Reliable systems are not systems that never fail; they are systems that preserve machine-readable state when they do.

### Step 5: freeze behavior with a deterministic model double

The demo declares one response:

```python
model = ScriptedModel([
    ModelTurn(
        content="A harness keeps calling the model until work stops.",
        stop=True,
    )
])
```

`ScriptedModel` returns declared turns in order and records the requests it received. Tests can therefore inspect both the final text and the exact messages visible to the model on every turn.

---

## Run it and observe it {#run}

From the repository root:

```bash
python3 -m curriculum.lessons.s01_agent_loop.demo
```

The program prints the final text followed by Trace 0.1 JSONL. You should see these event families:

```text
session.start
user.message
model.request
model.response
session.stop
```

Inspect the result carefully:

1. `sequence` begins at 0 and increases without gaps.
2. `model.request.payload.roles` contains `user`; this lesson has no system prompt.
3. The `model.response` actor is the model, not the harness.
4. `session.stop.payload.reason` is `completed`.
5. No payload contains `chain_of_thought`.

### Why is a trace different from a log?

Logs are optimized for human debugging and their text may change at any time. A trace is a stable data contract: events have identity, order, actors, provenance, and redaction status, so the player, experiment runner, and validator can consume the same record.

Filter the emitted event types:

```bash
python3 -m curriculum.lessons.s01_agent_loop.demo \
  | rg '"type"'
```

The demo does not modify the workspace, access the network, or read environment variables, so it is safe to repeat.

---

## What to notice in the implementation {#code-reading}

### Why does `turn.stop` not directly control the loop?

The core uses the presence of `tool_calls` to decide whether harness work remains. A structured action is the thing the harness must service, while one stop field may arrive late or differ across provider streaming protocols. `stop` remains useful to adapters and diagnostics, but it is not the only truth.

### Why append the assistant message before deciding?

Text and tool requests belong to one assistant turn. Even when that turn asks for a tool, it must enter history; otherwise the next request cannot see why the action happened.

### Why return both messages and events?

They answer different questions:

- `messages` is **model-visible state** used for the next inference.
- `events` is **observer-visible fact** used for replay, audit, and evaluation.

Do not inject every internal event back into model context, and do not infer an exact execution timeline from messages alone.

---

## Common mistakes and failure modes {#failure-modes}

| Mistake | Symptom | Better contract |
| --- | --- | --- |
| Unbounded `while True` | Repeated action requests never terminate | Enforce `max_turns` and return a stop reason |
| One message per chunk | Duplicate history corrupts the next turn | Accumulate chunks, append once after the stream |
| Treating errors as completion | UI reports success without a final answer | Separate completed, max-turns, cancelled, and error |
| Tracing hidden reasoning | Unverifiable or sensitive data appears as fact | Record observable inputs, outputs, actions, and policy decisions |
| Vendor objects in the loop | A provider change rewrites control flow | Translate into internal types at the adapter boundary |

---

## Exercises: beginner to researcher {#exercises}

### A. Warm-up: inspect the request

Print `runner.model.requests` after `main()` runs. Acceptance: the first request contains exactly one user message whose content matches the supplied prompt.

### B. Engineering: trigger `max-turns`

Change the first model turn to contain a fictional `ToolCall` and set `AgentConfig.max_turns` to 1. Acceptance: the final `stop_reason` is `max-turns`, and the last two events are `error` then `session.stop`.

### C. Design: add cancellation on paper

Do not start with threads or signal handlers. Specify the `cancelled` contract first: who requests it, where it is checked, whether an in-flight tool may finish, and what enters the trace. Write the answer as a transition table.

### D. Research: build a provider adapter

Implement the `Model` protocol around an SDK you know and translate its response into `ModelTurn`. The acceptance criterion is not merely “the API call works”; `AgentRunner` must remain unaware of the provider name.

Run the complete curriculum test suite after every change:

```bash
python3 -m unittest discover -s curriculum/tests -v
```

---

## Deep dive: protections around a production loop {#deep-dive}

The teaching loop deliberately exposes only the control skeleton. A production coding agent typically adds:

- **Cancellation propagation** across the model stream, tool process, and child work.
- **Timeouts and retries** that distinguish transient network errors, context overflow, and permanent validation failures.
- **Permission decisions** because schema-valid arguments are not automatically authorized.
- **Context budgeting** before each model request.
- **Concurrency discipline** between parallel-safe reads and serialized writes.
- **Durable sessions** with stable turn, message, and tool-call identities for recovery.
- **Cost boundaries** for turns, tokens, wall time, and money.

Those protections can grow a loop from dozens to thousands of lines, but they do not change the core relationship: the model proposes actions; the harness owns state and effects.

> When reading a complex agent loop, temporarily fold away the protections and find the invariant data flow: request → response → effect → result → next request.

---

## Checkpoint {#checkpoint}

You are ready for s02 if you can answer all five questions:

1. Why must the harness own a bounded stop condition?
2. Why should `messages` and `events` remain separate collections?
3. Why can’t every streaming chunk become an assistant message?
4. What structured information should a caller receive at `max_turns`?
5. Why does a provider adapter belong at the boundary rather than inside the loop?

The next chapter preserves this loop and changes only how model output reaches it: streaming deltas become stable, replayable events while the final assistant state remains one message.
