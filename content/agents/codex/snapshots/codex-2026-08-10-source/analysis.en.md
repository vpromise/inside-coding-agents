# Codex CLI core source map

This page is pinned to commit `89a335e`. It describes the published Rust core; it does not prove that a hosted surface runs this commit and is not a substitute for a native experiment.

```text
Turn input
  → context / skills / plugins / hooks
  → model sampling
  → assistant item or tool calls
  → ToolRouter → ToolRegistry → approval → sandbox → runtime
  → tool results + pending steering
  → follow-up sample / compaction / stop
```

## 1. Loop

`run_turn` owns the core loop for one user turn, while `RegularTask::run` checks the input queue after it returns. Sampling continues for tool follow-up, user steering, or mailbox delivery; otherwise stop hooks run and the turn ends. Claim: `codex-source-agent-loop`.

## 2. Context

Before the first sample, the core captures step context, records world state, and injects skills/plugins. It recomputes token state after sampling and can choose local or remote compaction before resuming a turn that still has work. Compaction replaces history and must not be described as lossless memory. Claim: `codex-source-auto-compaction`.

## 3. Tools

`ToolRouter` owns model-visible specifications; `ToolRegistry` owns runtimes and exposure. Reserved external names and collisions have explicit handling before a parsed call is resolved to a runtime. This creates two review points: what the model sees and what the host can execute. Claim: `codex-source-tool-router`.

## 4. Safety

Approval and sandboxing are separate layers. The approval path can forbid, ask, or skip; the sandbox path transforms and executes an attempt. The existence of this source boundary does not prove that an OS sandbox was active in an observed run, so the environment remains `source-mapped`. Claim: `codex-source-execution-policy`.

## 5. Reliability

The turn code includes cancellation, error events, token-limit rollover, and reuse of a turn-scoped client session across retries. These have not yet been isolated into fault-injection experiments and reviewed claims. Status: **partial / experiment missing**.

## 6. Extensibility

Turn assembly can inject skills and plugins. The hook runtime exposes typed boundaries around session start, pre/post tool use, permission requests, stop, compaction, and session end. Because extensions can affect control flow, they are also part of the trust boundary. Claim: `codex-source-extension-runtime`.

## 7. Orchestration

Multi-agent tools and agent control are separated: tool handlers receive model requests while the control layer owns child spawn and lifecycle. Concurrency, isolation, and cancellation behavior remain untested. Claim: `codex-source-subagent-routing`.

## 8. Interfaces

The CLI core and App Server are different surfaces. JSON-RPC and transport claims live in a separate snapshot so server protocol is not mistaken for CLI user behavior.

## 9. Observability

The protocol defines typed events for turns, items, tools, approvals, hooks, compaction, and collaboration, and the turn sends events through the session boundary. No publishable native trace exists yet, so replay fidelity remains unknown. Claim: `codex-source-event-stream`.

## Result and gaps

This snapshot is sufficient for comparing source organization and control boundaries, but remains Tier B. Tier A requires at least a version-pinned native run, a redacted trace, a formal experiment, reviewed coverage across the nine dimensions, and external reproduction.
