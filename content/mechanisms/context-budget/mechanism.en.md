# Context Budget

A coding agent does not send “the conversation” to a model. On every turn, its harness constructs a finite projection from instructions, user messages, assistant turns, tool results, retrieved memory, and space reserved for the next answer. Context budgeting is the policy that decides what earns those scarce bytes or tokens.

This dossier follows the runnable implementation in `s06-context-budget`. It explains that implementation precisely, then marks the production and cross-Agent questions it does **not** answer.

## L0 · Definition and boundary {#definition}

Context budget is resource allocation for the model-visible input. It answers: **what may enter the next request, in what form, and how much room remains for the response?** It is not the same as memory, compaction, or a provider's maximum context window.

> A large model window is a capacity ceiling. A context budget is a harness decision made below that ceiling.

The simplest mental model is a packing plan:

```text
request capacity
├── fixed instructions
├── current user intent
├── recent conversation
├── selected memory or skills
├── normalized tool results
└── reserved output space
```

The budget must distinguish at least three quantities: provider capacity, the harness input ceiling, and the output reserve. Treating all three as one number creates late provider rejections and unpredictable truncation.

| Concern | Owned by | Must remain observable |
| --- | --- | --- |
| Model context capacity | model/provider contract | pinned model and tokenizer assumption |
| Harness input ceiling | context assembler | admitted, omitted, and transformed items |
| Tool-output ceiling | tool-result normalizer | original size, retained size, artifact handle |
| Output reserve | request planner | reserved amount and exhaustion reason |

### What belongs outside this mechanism

Budgeting chooses limits and admissions. `context-compaction` creates a smaller replacement for history; `memory-retrieval` selects off-context records; `tool-output-truncation` transforms a single oversized result. Those mechanisms cooperate, but collapsing them into one “shorten prompt” function makes loss impossible to audit.

### The invariant to remember

Every transformation needs a visible reason. If an item is dropped, summarized, truncated, or replaced by an artifact reference, the trace should preserve the policy decision even when the discarded bytes are intentionally unavailable.

> Never infer “the model ignored it” until you know whether the harness sent it.

## L1 · Runnable reference {#reference}

Run the exact lesson implementation from the repository root:

```bash
python3 -m curriculum.lessons.s06_context_budget.demo
python3 -m curriculum.golden verify s06-context-budget
```

The demo sets a deliberately tiny character budget so the behavior is visible without calling a model. A scripted model requests `large_result`; the tool returns a synthetic oversized payload; `ContextBudget` bounds both the assembled input and the normalized tool result.

```python
AgentRunner(
    model=ScriptedModel(turns),
    tools=registry,
    trace=trace,
    system_prompt="Keep tool output bounded. " * 8,
    budget=ContextBudget(
        max_input_chars=300,
        max_tool_output_chars=180,
    ),
)
```

Characters are used here for deterministic teaching. They are **not** presented as tokenizer-equivalent accounting. A production adapter must use the pinned model's request contract or a documented conservative estimator.

### Admission is a projection, not mutation

The durable session record and model-visible request are different views. Budgeting should construct a request projection without silently rewriting the underlying event log:

```python
projection = assemble(
    durable_events=session.events,
    input_limit=budget.max_input_chars,
    output_reserve=budget.output_reserve,
)
model.send(projection.messages)
trace.emit("context.assemble", projection.manifest)
```

The teaching harness keeps this contract small: it records a `context.assemble` event with size and truncation metadata. The Golden Trace is the executable specification; the prose is an explanation of that artifact.

### Read the trace in causal order

Look for the following transitions in the lesson Trace Player:

1. the turn starts with a bounded request;
2. the scripted model emits a tool call;
3. the tool returns more content than the tool-result ceiling;
4. the harness records the bounded representation;
5. the next request is assembled from that representation;
6. the loop stops with an explicit reason.

The important fact is not the exact character count. It is that the boundary is deterministic, recorded, and applied before the next model request.

### Minimal acceptance checks

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s06-context-budget
```

The checks prove the reference behavior and trace contract. They do not prove equivalence to a vendor tokenizer or a real Agent implementation.

## L2 · Engineering the budget {#engineering}

A production budget is multi-dimensional. Token count is only one axis; latency, cache shape, tool-result bytes, attachment count, request limits, and expected response length can all bind first.

### Use explicit pools and priorities

A useful planner starts with protected pools and makes eviction order a policy:

```text
protect: system safety rules, current user request, active approvals
prefer:  recent verified results, active plan, current file excerpts
evict:   duplicated narration, stale previews, superseded observations
externalize: large artifacts with stable handles and provenance
```

“Newest wins” is insufficient. A recent verbose tool result can displace an older constraint that still governs the task. Conversely, pinning every instruction forever can starve the evidence needed to finish.

### Count after serialization

Budget the request that will actually be sent: roles, tool schemas, structured arguments, protocol wrappers, images, and provider-specific overhead. Counting raw message text before serialization systematically underestimates real input.

For approximate counters, expose the uncertainty:

```python
estimate = counter.estimate(serialized_request)
if estimate.upper_bound > input_limit:
    projection = planner.reduce(projection)
```

An upper bound is safer than a false exact value. The trace should identify the counter version, model assumption, input limit, and chosen reductions so a later snapshot can explain changed behavior.

### Failure modes {#failure-modes}

| Failure | Observable symptom | Better boundary |
| --- | --- | --- |
| Blind oldest-first deletion | old requirements vanish | protect typed constraints and record eviction |
| Tool result copied in full | one command crowds out the task | bounded preview plus artifact handle |
| No output reserve | provider rejects or clips answer | reserve before admitting optional context |
| Hidden token estimate | behavior changes after model switch | pin counter/model assumption in trace |
| Durable log overwritten | replay cannot reconstruct loss | keep immutable events; build a projection |
| Repeated summaries | factual drift compounds | record lineage and prefer source retrieval |

### Safety and reliability {#safety}

Budget pressure is a safety boundary because it can remove permissions, denial reasons, trust labels, or user constraints. Mark these as protected typed records instead of trusting their position in prose. When a required protected item cannot fit, fail explicitly or choose a smaller operating mode; do not proceed with an incomplete safety envelope.

Tool outputs are untrusted data. Truncation must not accidentally turn a quoted instruction into an apparent system rule, nor should retrieval move external text into a privileged instruction slot. Preserve source and trust labels through every transformation.

### Cache efficiency is not semantic correctness

Stable prefixes can reduce latency and cost, but a cache-friendly ordering is only valid if it preserves the request's meaning and freshness. Track two outcomes separately:

- semantic outcome: which facts and constraints survived;
- transport outcome: token count, cache reuse, latency, and cost.

Optimizing only the second makes regressions look like savings.

## L3 · Architecture and Agent comparison {#comparison}

The Atlas treats “supports a large context window,” “automatically compacts,” and “has a configurable budget” as different claims. A product page or similar UI is not enough to infer how a harness allocates context internally.

This mechanism currently has no Agent implementation that clears the project's `Snapshot + Claim` gate. The five-Agent matrix below therefore shows explicit evidence gaps. That state means **not researched to the required standard**, not “the Agent has no budget.”

### Questions for a source map

For each pinned Agent snapshot, research should locate and distinguish:

1. request construction and role ordering;
2. tokenizer or estimator selection;
3. tool-schema and attachment accounting;
4. output reservation;
5. truncation or compaction trigger;
6. trace events that reveal the decision;
7. behavior when protected context cannot fit.

A future Claim should state one small architectural fact and link to a stable source locator, official documentation, or reviewed reproduction. Broad labels such as “smart context management” are not evidence.

### Relationship to neighboring mechanisms

`agent-loop` asks when another model turn occurs. Context budget determines the request supplied to that turn. `tool-output-truncation` bounds one incoming result. `context-compaction` changes history shape when ordinary admission is no longer enough. `memory-retrieval` adds selected external records. Keeping these nodes separate enables meaningful cross-Agent comparison.

## L4 · Research and measurement {#research}

A useful budget experiment must control the model, tokenizer assumption, tool schemas, prompt, fixture, and output reserve. It should vary one pressure source at a time and publish the exact request projection or a privacy-safe manifest of it.

### Proposed controlled scenario

Create a fixture with one durable constraint, several ordinary messages, a large tool result, and a final question that requires both the constraint and one fact near the end of the tool result. Increase pressure in fixed increments.

Measure:

- whether the protected constraint remains present;
- whether the required fact is available through preview or artifact retrieval;
- admitted and omitted record IDs;
- request size under the pinned counter;
- output reserve actually available;
- deterministic projection fingerprint;
- stop or recovery behavior when no valid projection fits.

Do not score answer quality alone. A lucky final answer can hide an invalid projection, while a different model may fail on the same hidden loss.

### Exercise and acceptance {#exercise}

Start with the lesson and make one change at a time:

```bash
python3 -m curriculum.lessons.s06_context_budget.demo
python3 -m curriculum.golden verify s06-context-budget
python3 -m unittest curriculum.tests.test_course_contract
```

1. lower `max_tool_output_chars` and predict the trace change before running;
2. preserve the full synthetic output behind an artifact handle;
3. add an assertion that protected instructions are never silently omitted;
4. record the budget policy version in `context.assemble`;
5. explain why the character counter remains a controlled teaching limitation.

The mechanism is understood when you can distinguish the durable record, the model-visible projection, the provider ceiling, and the evidence that connects them.

### Research checkpoint

> Before comparing Agents, freeze the snapshot and ask exactly which budget decision the available evidence supports.

The formal experiment slot remains open in the Registry. Until a scenario is registered and its trace reviewed, the runnable lesson is evidence for the **reference harness only**.
