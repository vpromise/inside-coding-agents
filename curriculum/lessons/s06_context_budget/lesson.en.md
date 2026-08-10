# s06 · Context Budgets and Truncation

## Objective

Make context pruning and tool-output truncation explicit, testable, observable harness policies.

## Run

`python3 -m curriculum.lessons.s06_context_budget.demo`

The example first bounds one tool result and then trims messages before the next model call. The two actions appear separately as `tool.result.truncated` and `context.prune`.

## Exercise

Lower `max_input_chars` to 120. Acceptance: the newest tool result retains an identifiable preview and the trace reports before/after character counts.

## Limitation

Characters are a deterministic teaching proxy, not a provider tokenizer. Production adapters should count real tokens and reserve separate budgets for system, user, tool schemas, and output.
