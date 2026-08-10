# s01 · The Minimal Agent Loop

## Objective

Understand the smallest harness responsibilities: store messages, call a model, decide whether to continue, and preserve a stop reason.

## Mental model

The model proposes the next step. The harness owns the loop, state, and stop policy. The example keeps a loop even though it receives one response because tool calls make that loop multi-turn in s03.

## Run

`python3 -m curriculum.lessons.s01_agent_loop.demo`

Observe `session.start → user.message → model.request → model.response → session.stop`. Never invent hidden reasoning as trace events.

## Exercise

Set `max_turns` to 1 and make the fake model request a tool. Acceptance: the run stops with `max-turns` instead of looping forever.

## Boundary

There are no tools, permissions, retries, or token budgets yet. This lesson establishes the control skeleton used by later chapters.
