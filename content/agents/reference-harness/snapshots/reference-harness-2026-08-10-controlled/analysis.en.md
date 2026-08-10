# Reference Harness 0.1 controlled snapshot

## Loop

`AgentRunner` records session start, requests turns from Scripted Model, executes tool calls, appends tool results to the next request, and stops when a turn has no tool calls.

## Context

This experiment has fixed system, user, assistant, and tool messages. It performs no compaction and records no hidden reasoning in Trace.

## Tools

Arguments are checked against the declared tool schema before the read-only `read_file` handler runs. The fixture is copied into a temporary workspace, so the canonical input is not mutated.

## Safety

No shell, write, or network tool is exposed. The path boundary rejects absolute paths and workspace escape, but it is not operating-system isolation.

## Reliability

Both repetitions must pass event-order, tool-result, final-answer, fixture-integrity, and deterministic-replay metrics.

## Extensibility

Model and ToolRegistry are deliberately small interfaces. A native adapter can replace the input boundary, but this controlled result cannot be relabeled as native evidence.

## Orchestration

This snapshot has no subagent support. The dimension remains unknown.

## Interfaces

The public entry point is `python3 labs/runner.py reference-tool-roundtrip-v1`; `--check` rebuilds and compares artifacts without writing them.

## Observability

Each run emits Trace 0.1 JSONL, a structured Result, and a readable report. The site projects those canonical artifacts into an experiment page and per-event replay.
