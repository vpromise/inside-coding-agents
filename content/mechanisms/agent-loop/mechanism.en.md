# Agent Loop

## L0 · Intuition

A model is not an agent. The model answers “what next”; the harness turns that answer into effects, adds results to context, and decides whether to continue or stop.

```text
User intent → Model response → Tool request → Policy → Tool result
     ↑                                             │
     └────────── Update context and continue ──────┘
```

A trustworthy loop can answer three questions: what state it is in, why it continues, and why it stops.

## L1 · Runnable reference

Run `python3 -m curriculum.lessons.s03_tool_dispatch.demo`. The fake model requests `echo`, the registry validates and executes it, and the result becomes a tool message for the second model call. The run prints Trace 0.1 JSONL.

## L2 · Engineering constraints

- Bound turns, wall time, tokens, and tool calls independently.
- Separate validation, authorization, execution, and result normalization.
- Give stream failures, model failures, and tool failures different recovery paths.
- Treat cancellation and steering as loop state, not UI exceptions.
- Put the stop reason in the trace, not only in an incidental log string.

## L3 · Agent mapping

Official documentation observed on 2026-08-10 presents Codex CLI as one terminal loop for exploration, planning, editing, local tools, steering, and same-session follow-up. The current claim supports product-surface behavior only; source mapping, request protocol, retry behavior, and termination logic remain unknown.

## L4 · Research entry

The synthetic controlled trace proves this project's event and tool round-trip contract runs, but it cannot substitute for a native Agent trace. The next experiment must pin Agent version, model, permissions, sandbox, fixture, and visibility gaps.
