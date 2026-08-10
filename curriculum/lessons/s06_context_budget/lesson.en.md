# s06 · Context Budgets and Truncation

> Context is not an infinite transcript. It is a budgeted input projection compiled by the harness for the next model call.

## What you will build {#learn}

By s05, the harness keeps accumulating system text, project instructions, user messages, assistant turns, tool results, and tool descriptors. Every finite context window eventually fills. Waiting for the provider to return “context length exceeded” is too late.

This chapter adds two independent budgets: truncate a tool result before it enters messages, then prune the message list before every model request. For offline deterministic teaching, characters stand in for tokens, and every policy action becomes a trace event.

By the end, you should be able to:

- Model how system text, messages, tools, and output reservation compete for a window.
- Distinguish tool-output truncation, history pruning, and semantic compaction.
- Explain why individual results are bounded before global history is fitted.
- Read the “keep system, prefer recent messages” reverse-selection algorithm.
- Identify limitations around token counting, message pairing, and oversized system prompts.

---

## The problem: context runs out at the worst time {#problem}

A model window usually contains:

```text
system + project instructions + tool schemas
+ conversation history + tool results
+ reserved output tokens
<= provider context window
```

If the harness only appends, two things happen:

1. Cost and latency grow with history.
2. Eventually the provider rejects a request and the agent stops mid-task.

Tool output is particularly dangerous. One test log, search result, or dependency tree can exceed the entire conversation so far. Pruning old chat without bounding an individual result lets one tool message monopolize the window.

> Context management does not preserve the most text. It preserves enough state for the next step within budget and makes information loss visible.

---

## Mental model: two fuses {#mental-model}

The lesson uses two policy levels:

```text
raw tool result
      │
      ├─ Level 1: max_tool_output_chars
      │       └─ bounded result + truncated metadata
      ▼
append tool message
      │
      ├─ Level 2: max_input_chars before next model call
      │       └─ keep system + recent messages
      ▼
model request
```

| Policy | Target | Timing | Semantic understanding? |
| --- | --- | --- | --- |
| Truncation | One tool result | Before it enters messages | No |
| Pruning | Message list | Before every request | No |
| Compaction | A history span | Before overflow or on policy trigger | Yes, creates a summary/state projection |

The teaching harness implements the first two. Compaction creates a new semantic projection and needs stronger provenance, failure handling, and evaluation; it should not be disguised as substring slicing.

### Budget decisions are harness policy

The model may suggest that history is unimportant, but the harness decides what enters the request, what is removed, and what output space is reserved. Otherwise the same session cannot be replayed reliably.

---

## Implement the two-level budget step by step {#build}

### Step 1: declare independent limits

```python
@dataclass(frozen=True)
class ContextBudget:
    max_input_chars: int = 8_000
    max_tool_output_chars: int = 2_000
```

Separate limits distinguish one abnormal tool from normal long-session growth. Production configuration also reserves tokens separately for system sections, tool schemas, and output.

### Step 2: measure the serialized result

```python
encoded = json.dumps(value, ensure_ascii=False, sort_keys=True)
if len(encoded) <= self.max_tool_output_chars:
    return value, False
```

Measure the representation that will enter the message, not the number of Python objects. Key sorting stabilizes length and fingerprints in deterministic tests.

### Step 3: return a metadata-bearing preview

```python
preview_size = max(0, self.max_tool_output_chars - 96)
return {
    "truncated": True,
    "original_chars": len(encoded),
    "preview": encoded[:preview_size],
}, True
```

Do not silently chop the tail. `truncated` tells the model and UI that content is incomplete, `original_chars` describes loss, and `preview` preserves an identifiable sample.

The constant 96 is a teaching approximation for JSON wrapper overhead. It does not guarantee a final wire size exactly equal to the limit; production code should measure the final representation again.

### Step 4: call `fit` before every model request

```python
if self.budget is not None:
    report = self.budget.fit(messages)
    if report.removed_count or report.final_chars < report.original_chars:
        messages = list(report.messages)
        self._emit(
            "context.prune",
            actor_kind="harness",
            actor_id=self.config.agent_id,
            payload={
                "removed_messages": report.removed_count,
                "original_chars": report.original_chars,
                "final_chars": report.final_chars,
            },
        )
```

Budgeting belongs before the request. Pruning after a response can protect the next turn but cannot rescue the already oversized call.

### Step 5: pin system and select recent history backward

```python
system = [message for message in messages[:1] if message.role == "system"]
remaining = list(messages[len(system):])
kept_reversed = []
used = sum(len(message.content) for message in system)

for message in reversed(remaining):
    if kept_reversed and used + len(message.content) > self.max_input_chars:
        continue
    kept_reversed.append(message)
    used += len(message.content)
```

Recent user intent, assistant action, and tool output are usually most relevant to the next step. Reverse the selected list again to restore chronological order.

### Step 6: retain at least the newest message tail

```python
if not kept_reversed and used + len(message.content) > self.max_input_chars:
    room = max(0, self.max_input_chars - used)
    message = Message(
        role=message.role,
        content=message.content[-room:] if room else "",
        name=message.name,
        tool_call_id=message.tool_call_id,
    )
```

This prevents a tiny budget from deleting all dynamic history. Keeping the tail is only a deterministic teaching choice: source files may need their beginning, logs may need both ends, and tool-call/result pairs must not be split.

---

## Run the oversized-result example {#run}

The lesson registers a deliberately large result:

```python
handler=lambda args: {"content": "context-data-" * 80}
```

The runner uses:

```python
ContextBudget(
    max_input_chars=300,
    max_tool_output_chars=180,
)
```

Execute:

```bash
python3 -m curriculum.lessons.s06_context_budget.demo
```

The trace should show, in order:

```text
tool.result             payload.truncated = true
context.prune           original_chars > final_chars
model.request           receives the bounded projection
```

Verify it:

```python
runner, trace = build_demo()
result = runner.run("Fetch the large result, then explain the budget behavior.")

tool_result = next(e for e in result.events if e["type"] == "tool.result")
assert tool_result["payload"]["truncated"] is True

prune = next(e for e in result.events if e["type"] == "context.prune")
assert prune["payload"]["final_chars"] < \
       prune["payload"]["original_chars"]
```

### Inspect the actual second request

```python
second_request = runner.model.requests[1]
for message in second_request:
    print(message.role, len(message.content), message.content[:60])
```

Do not inspect only `result.messages`, which is end-of-run internal state. `model.requests[1]` is the projection the model actually received.

---

## Understand the algorithm and its limits {#code-reading}

### Characters are not tokens

Chinese, English, code, and JSON have different token-to-character ratios, and tokenizers differ. Character counts are deterministic teaching proxies. A provider adapter should use a real tokenizer or server count with safety margin.

### The system prompt may exceed the budget alone

The teaching algorithm always keeps the first system message. If it exceeds `max_input_chars`, final input still exceeds the limit. Production systems budget prompt sections or reject impossible configuration at startup.

### Messages are not always independently removable

An assistant tool call and its tool result form a protocol pair. Keeping only one side may make provider history invalid. Stronger algorithms prune atomic turns or groups rather than arbitrary messages.

### Pruning permanently loses information

Deletion cannot recover old goals, constraints, or unfinished work. Semantic compaction projects history into a summary, todo state, file changes, and unresolved questions—but summaries can distort facts and need provenance and quality evaluation.

### Preview selection needs semantics

A prefix helps some files but may lose the end of a stack trace. Tools can expose pagination, head+tail, match windows, or artifact handles so the model retrieves more on demand.

---

## Common failure modes {#failure-modes}

| Mistake | Consequence | Better strategy |
| --- | --- | --- |
| Wait for provider overflow | Hard failure mid-task | Estimate before request with margin |
| Limit only total history | One tool result owns the window | Per-result and global limits |
| Silent truncation | Model treats a fragment as complete | Expose truncation, size, and retrieval path |
| Split half a tool pair | Invalid protocol or broken meaning | Prune atomic turns/groups |
| Always retain all system text | Configuration itself overflows | Section budgets and startup validation |
| Replace source transcript with summary | Summary errors cannot be audited | Store raw facts externally; project context |
| Resummarize everything every turn | Cost and drift compound | Incremental compaction with checkpoints |
| No prune event | Forgetting is inexplicable | Trace policy, before/after size, and range |

---

## Exercises {#exercises}

### A. Lower the input budget

Set `max_input_chars` to 120. Acceptance: the newest tool result retains an identifiable preview, the trace reports before/after characters, and the run has an explicit stop reason.

### B. Oversized system prompt

Create a 500-character system prompt with a 100-character budget. Explain why current `final_chars` may remain over budget, then design startup validation that rejects the configuration.

### C. Atomic-turn pruning

Group messages into system, user turn, and assistant+tool bundles. Retain groups from newest backward without splitting tool pairs. Define a policy for one group that exceeds the budget alone.

### D. Head-and-tail output

Modify `truncate_tool_result` to retain 60% from the head and 40% from the tail with omission metadata. Acceptance: final JSON has a stable limit and includes the end of an error log.

### E. Token adapter

Inject `measure(text) -> int` into `ContextBudget` and test a character counter plus a fake tokenizer. The core selection algorithm should remain provider-neutral.

### F. Compaction manifest

Design a summary object containing goal, completed work, open tasks, changed files, constraints, and source event range. Explain how every field traces back to raw events.

---

## Deep dive: from budget to long-term memory {#deep-dive}

A production context manager often combines four layers:

1. **Immediate window**: recent turns and current tool results in original form.
2. **Compacted history**: structured summaries and checkpoints for older work.
3. **External artifacts**: large files, logs, and searches stored outside the window and read through handles.
4. **Durable memory**: selected project facts that remain useful across sessions.

The key is not storage location but projection selection for each call. A mature budgeter may calculate:

```text
available_input
= context_window
- reserved_output
- system_sections
- tool_descriptors
- safety_margin
```

It then allocates space to current task, recent turns, tool results, retrieved memory, and compacted state. Every class needs priority, minimum guarantee, and maximum cap.

### How should compaction be evaluated?

Compression ratio is insufficient. Measure:

- Downstream task completion.
- Retention of critical constraints.
- Preservation of unfinished work.
- Correct file and tool-call identity.
- Facts invented by the summary.
- Error accumulation across repeated compactions.

> The context window is model working memory, not the system’s only database. A reliable harness preserves the complete record and compiles a finite projection for each turn.

---

## Checkpoint {#checkpoint}

To complete Foundations, make sure you can answer:

1. Why do one tool result and global history need separate budgets?
2. Why are character counts only suitable for teaching?
3. Why should tool call and result form an atomic group?
4. How do pruning and semantic compaction lose information differently?
5. Why must `context.prune` be a trace event?

You now have a runnable reference-harness vertical slice: bounded loop, streaming events, structured tools, workspace boundaries, layered instructions, and context budgets. The next step is not blind feature growth; it is using Mechanisms, Agent Snapshots, Claims, Experiments, and Traces to compare how real coding agents solve the same problems.
