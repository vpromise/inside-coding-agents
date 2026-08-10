# Pi coding-agent source map

This page is pinned to package `0.84.1` at commit `936aff0`. The research target is the agent core and coding-agent CLI in the official monorepo, not the behavior of third-party Pi packages.

```text
Agent wrapper
  → agent-loop (model / tools / steering / follow-up)
  → AgentEvent stream
  → AgentSession
      ├─ SessionManager: append-only JSONL tree
      ├─ compaction / branch summary
      ├─ built-in tools
      └─ ExtensionRunner / resources / UI
```

## 1. Loop

The low-level `runLoop` has a clear two-level shape: the inner loop handles tool calls and steering, while the outer loop checks the follow-up queue when the agent would otherwise stop. The `Agent` wrapper stores the transcript, queue modes, model, and tools and forwards events to subscribers. Claim: `pi-source-agent-loop`.

## 2. Context

The coding-agent layer combines provider usage with token estimates, keeps a recent tail, summarizes an older region, and records read/modified files. Compaction changes the model-visible projection while the full session tree remains in JSONL. Claim: `pi-source-context-compaction`.

## 3. Tools

Arguments are validated before a before-hook. A batch runs sequentially or in parallel according to configuration, then passes normalized results through an after-hook and back into context. When a length stop may have truncated tool arguments, the loop fails those calls instead of executing incomplete input. Claim: `pi-source-tool-dispatch`.

## 4. Safety

The key result is negative: Pi core has no built-in permission system or OS sandbox. Project trust controls loading of project-local settings, packages, and extensions; tools still inherit host-process permissions. Isolation must come from a container, VM, micro-VM, or policy sandbox. Claim: `pi-source-execution-boundary`.

## 5. Reliability

The source includes provider retry, auto retry, abort, truncated-call protection, and session migration. This project has not yet produced a shared failure taxonomy or fault-injection runs, so the dimension remains **partial**; retry code does not establish recovery success.

## 6. Extensibility

`ExtensionRunner` is the main product-layer extension boundary. Extensions can add or replace tools, commands, UI, and providers; intercept calls; and change context transformation or compaction. Extensions run with Pi's process permissions, so capability and trust must be evaluated together. Claim: `pi-source-extension-runtime`.

## 7. Orchestration

Pi intentionally avoids prescribing a subagent model in core. Official guidance points to separate Pi processes, tmux, extensions, or packages. This keeps core small but makes the integrator responsible for process ownership, permission inheritance, workspace isolation, and merge policy. Claim: `pi-source-orchestration-boundary`.

## 8. Interfaces

Interactive TUI, print/JSON, and RPC are separate modes. The RPC command/response/event contract has its own server snapshot so process integration is not mixed with interactive UI behavior.

## 9. Observability

Live `AgentEvent` supports UI updates. `SessionManager` persists entries as an append-only JSONL tree with `id/parentId`; branching moves the leaf and later writes form a new path without deleting the old one. Claim: `pi-source-session-events`.

## Design tradeoff

Pi demonstrates a strong minimal-core path: prescribe fewer platform policies and expose more composition points. The benefit is readable mechanism boundaries and low customization friction; the cost is that safety, subagent, and MCP behavior can vary materially with the extension stack. A meaningful Pi comparison must record core version, loaded extensions, and the outer sandbox.
