# s03 · Tool Registry and Dispatch

> A tool call is not “execute model text.” It is a structured protocol that must be described, validated, executed, correlated, and returned.

## What you will build {#learn}

The first two lessons could only return text. Now the model receives its first capability: `echo`. Echo itself is unimportant; the full roundtrip is the lesson. The model proposes a `ToolCall`, the registry validates its name and arguments, a handler runs, and the harness records and returns a tool message for the next turn.

By the end, you should be able to:

- Explain the separate responsibilities of descriptor, schema, handler, and result.
- Distinguish validation, authorization, and execution.
- Track how `tool_call_id` connects a request, result, and next-turn message.
- Convert unknown tools, bad arguments, and handler exceptions into structured failures.
- Read a trace containing two model turns and one tool execution.

---

## The problem: who owns a requested action? {#problem}

Model output like this is not permission to execute immediately:

```json
{
  "id": "call-001",
  "name": "echo",
  "arguments": {"text": "hello"}
}
```

Before any effect, the harness must ask:

1. Is `echo` registered?
2. Is `text` present and correctly typed?
3. Are undeclared fields present?
4. May this session call the tool?
5. How are success, exception, and timeout encoded?
6. How will the next turn correlate the result?

This lesson implements 1, 2, 3, 5, and 6. Permission policy and OS isolation belong to later layers.

> Schema validation proves that arguments have an expected shape. It does not prove that the action is authorized.

---

## Mental model: the tool roundtrip is a closed loop {#mental-model}

```text
messages + descriptors
        │
        ▼
      MODEL
        │ ToolCall(id, name, arguments)
        ▼
  validate name + schema
        │
        ├─ invalid ─> structured error result
        │
        ▼
   execute handler
        │
        ├─ exception ─> structured error result
        ▼
 append tool message
        │
        └────────────> next model request
```

Four data contracts form the loop:

| Contract | Producer | Consumer | Stable key |
| --- | --- | --- | --- |
| Tool descriptor | Registry | Model adapter | `name` |
| Tool call | Model | Harness | `id` + `name` |
| Tool result event | Harness/tool | Trace consumers | `tool_call_id` |
| Tool message | Harness | Next model turn | `tool_call_id` + `name` |

### The descriptor is the model’s interface

The model sees only name, description, and parameter schema. It should not see the Python handler, credentials, or internal objects. Ambiguous descriptions produce poor tool choice; permissive schemas produce ambiguous execution requests.

### The registry is a capability catalog, not a permission system

Registered means the harness knows how to execute the tool. It does not mean every user, repository, or session may do so. Production systems commonly insert a policy decision point between registry lookup and handler execution.

---

## Build the tool system step by step {#build}

### Step 1: define a Tool

The core type stores the public contract beside the private implementation, while `descriptor()` projects only safe fields:

```python
@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: JsonObject
    handler: Handler

    def descriptor(self) -> JsonObject:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }
```

The lesson registers `echo`:

```python
registry.register(Tool(
    name="echo",
    description="Return the supplied text.",
    parameters={
        "type": "object",
        "additionalProperties": False,
        "required": ["text"],
        "properties": {"text": {"type": "string"}},
    },
    handler=lambda args: {"echo": args["text"]},
))
```

`additionalProperties: False` matters. `{"text": "hello", "command": "..."}` must not pass silently.

### Step 2: reject duplicate names

The registry indexes handlers by name:

```python
def register(self, tool: Tool) -> None:
    if tool.name in self._tools:
        raise ValueError(f"tool already registered: {tool.name}")
    self._tools[tool.name] = tool
```

Silent replacement lets a plugin hijack an existing capability. If overrides are supported, require an explicit namespace or precedence policy.

### Step 3: validate before the handler

`ToolRegistry.execute()` resolves, validates, then invokes:

```python
tool = self._tools.get(name)
if tool is None:
    raise ToolValidationError(f"unknown tool: {name}")

self._validate(tool.parameters, arguments)
return tool.handler(dict(arguments))
```

The teaching validator supports objects, required fields, additional properties, and primitive types. It is not a complete JSON Schema implementation; production code should use a mature validator with a pinned dialect.

### Step 4: script two model turns

The first asks for a tool; the second consumes the result and completes:

```python
model = ScriptedModel([
    ModelTurn(tool_calls=(
        ToolCall(
            id="call-001",
            name="echo",
            arguments={"text": "hello"},
        ),
    )),
    ModelTurn(
        content="The echo tool returned hello.",
        stop=True,
    ),
])
```

The roundtrip is deterministic; it does not depend on a real model happening to choose the right tool.

### Step 5: execute and append a tool message

The loop emits a request event, executes the registry, and appends the encoded result:

```python
value = self.tools.execute(call.name, call.arguments)
encoded = encode_tool_result(value)

messages.append(Message(
    role="tool",
    content=encoded,
    name=call.name,
    tool_call_id=call.id,
))
```

The next request should have these roles:

```text
user → assistant → tool
```

A provider adapter may translate the internal tool role into a native wire shape, but it must preserve `tool_call_id`.

### Step 6: return failures to the model

Unknown names, bad arguments, and handler failures implement `ToolError`. The harness catches them and encodes:

```python
{
    "ok": False,
    "error": str(exc),
    "error_type": type(exc).__name__,
}
```

The failed call still becomes a tool message. The model can repair arguments, choose another tool, or explain the failure. Writing an exception to stderr and losing it breaks the loop.

---

## Run the complete roundtrip {#run}

Execute:

```bash
python3 -m curriculum.lessons.s03_tool_dispatch.demo
```

Expected event order:

```text
session.start
user.message
model.request       # turn 1: descriptors include echo
model.response      # contains call-001
tool.request        # echo({"text": "hello"})
tool.result         # {"echo": "hello"}
model.request       # turn 2: includes the tool message
model.response      # final explanation
session.stop
```

### Inspect what the second turn saw

```python
runner, trace = build_demo()
result = runner.run("Use the echo tool, then report its result.")

second_request = runner.model.requests[1]
assert [message.role for message in second_request] == [
    "user", "assistant", "tool"
]
assert second_request[-1].tool_call_id == "call-001"
```

### Pair requests and results

```python
requests = [e for e in result.events if e["type"] == "tool.request"]
results = [e for e in result.events if e["type"] == "tool.result"]

assert requests[0]["payload"]["tool_call_id"] == \
       results[0]["payload"]["tool_call_id"]
assert results[0]["payload"]["ok"] is True
```

This is more meaningful than checking final prose alone. A model can generate a plausible sentence even when the tool never ran correctly.

---

## Validation, authorization, and execution boundaries {#code-reading}

These concepts are often collapsed incorrectly:

| Layer | Question | Example |
| --- | --- | --- |
| Validation | Is the input structurally valid? | Is `path` a string? Are fields unknown? |
| Authorization | May this principal do it now? | Is the repo trusted? Does writing need approval? |
| Execution | How is the effect isolated? | cwd, env, timeout, sandbox, resource limits |

The usual order is validate → authorize → execute, but TOCTOU still matters: a path or file checked at authorization time may change before execution. s04 adds a workspace boundary while stating clearly that it is not an OS sandbox.

### Why encode results as JSON?

Tools may return mappings, lists, numbers, or booleans. Stable JSON lets adapters, traces, and tests share one representation. `sort_keys=True` also improves deterministic tests and fingerprints.

### Why classify errors?

- `ToolValidationError` describes input the model may repair.
- `ToolExecutionError` means the handler started and failed.
- Policy denial should be separate because invalid shape and missing permission require different recovery.

---

## Common mistakes and attack surfaces {#failure-modes}

| Problem | Consequence | Protection |
| --- | --- | --- |
| `eval` model output | Arbitrary code execution | Dispatch registered handlers only |
| Permissive extra fields | Hidden arguments pass through | Reject undeclared fields by default |
| Descriptor/handler drift | Model selects or uses tools incorrectly | Version contracts and handlers together |
| Lost `tool_call_id` | Concurrent results cannot be paired | Preserve ID in call, event, result, and message |
| Uncaught handler exception | Session disappears | Classify and encode failure results |
| Unlimited result | Context and UI are flooded | Apply s06 output budgets |
| Retried non-idempotent write | Duplicate mutation or charge | Idempotency key, transaction, or approval |
| Prompt injection in output | Untrusted text steers the next turn | Mark provenance, minimize exposure, isolate policy |

---

## Exercises {#exercises}

### A. Reject an extra argument

Change arguments to `{"text": "hello", "extra": true}`. Acceptance: the handler does not execute, `tool.result.payload.ok` is false, and `error_type` is `ToolValidationError`.

### B. Recover from an unknown tool

Rename the call to `missing_tool` while keeping a second model turn. Observe the error tool message. Then make the next scripted turn request the correct `echo` and verify recovery.

### C. Add a structured tool

Register `add` with two number arguments and return `{"sum": ...}`. Acceptance: do not modify `AgentRunner.run()`; add only a Tool definition and scripted turns.

### D. Concurrency design

Suppose one turn requests `read_file A`, `read_file B`, and `write_file C`. Add `concurrency` metadata and specify which calls may overlap, which must serialize, and how results remain correlated.

### E. Fuzz validation

Generate missing fields, wrong types, booleans masquerading as integers, deep objects, and huge strings. Acceptance: invalid input fails before the handler and every error remains serializable.

---

## Deep dive: a production tool runtime {#deep-dive}

A mature harness expands the registry into a runtime with:

- **Discovery** across built-ins, plugins, MCP servers, and dynamic capabilities.
- **Namespacing** when providers expose colliding names.
- **Policy metadata** such as read, write, network, and destructive risk.
- **Approval** bound to exact arguments before side effects.
- **Isolation** for subprocesses, filesystems, networks, and resources.
- **Cancellation** propagated into handlers and child processes.
- **Observability** for duration, exit status, truncation, redaction, and provenance.
- **Idempotency** so retries do not repeat irreversible effects.

Tool descriptions are also part of the prompt surface. Too many overlapping capabilities consume tokens and reduce selection quality, so production systems may choose descriptors dynamically instead of broadcasting every tool on every turn.

> Tool-use quality has two halves: the model chooses an appropriate action, and the harness executes it safely, accurately, and recoverably. Optimizing only one half is insufficient.

---

## Checkpoint {#checkpoint}

Before s04, make sure you can answer:

1. Why must a descriptor omit handlers and credentials?
2. Why is schema-valid not the same as authorized?
3. At which four points must `tool_call_id` survive?
4. Why should a failed handler still produce a tool message?
5. Why should adding a tool leave the core loop unchanged?

The next chapter replaces the abstract handler with File, Shell, and Edit tools and establishes a first side-effect boundary through workspace paths, an executable allowlist, and exact replacement.
