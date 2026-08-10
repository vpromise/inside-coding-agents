# s03 · Tool Registry and Dispatch

## Objective

Understand the full round trip between tool description, argument validation, execution, result messages, and traces.

## Data flow

The model produces a structured `ToolCall`. The registry checks the name and argument schema before invoking a handler. Success or failure becomes a `tool` message for the next model turn and a request/result pair in the trace.

## Run

`python3 -m curriculum.lessons.s03_tool_dispatch.demo`

## Exercise

Add an undeclared argument to `echo`. Acceptance: the handler does not run, `tool.result.ok` is `false`, and the next turn receives a structured error.

## Security boundary

Schema validation is not authorization. File reads, command execution, and network access need separate policy and sandbox layers.
