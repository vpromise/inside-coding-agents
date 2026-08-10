# OpenCode

OpenCode is valuable as a harness study target because its terminal UI, desktop client, headless server, SDK-facing protocol, model adapters, permissions, tools, sessions, and extensions live in one open monorepo. The architecture is not merely “a CLI that calls a model”: clients project one server-owned session system, and the same event and tool boundaries support several surfaces.

- Current coverage: Tier B, source-backed.
- Version boundary: package `1.18.16` at commit `941e71d`.
- Research value: client/server composition, multi-provider adaptation, permission-filtered tools, durable events, child sessions, plugins, skills, and MCP.
- Important safety boundary: the reviewed permission service is semantic authorization. This snapshot does not establish an OS sandbox or universal filesystem, process, and network isolation.
- Missing: an installed-version check, a reviewed Native JSON-event trace, adversarial permission experiments, and external reproduction.

The source shows a recurring design pattern: important behavior is expressed as services around a session rather than hidden inside the terminal UI. A prompt loop reads persisted messages, resolves the active Agent and available tools, invokes a processor, publishes lifecycle events, and repeats until an explicit terminal condition. The TUI and other clients consume this system instead of implementing independent loops.

That separation makes OpenCode especially useful for comparing three contracts that are often blurred together:

1. **Model contract** — provider-specific streaming and tool calls become stable internal messages.
2. **Harness contract** — sessions, permissions, compaction, retries, tools, and child tasks own control flow.
3. **Client contract** — HTTP, event streams, TUI worker RPC, desktop, and ACP surfaces project observable state.

The reviewed snapshot maps nine mechanism categories, but it remains Tier B. Source coverage is not runtime evidence: it does not prove which revision a hosted or installed surface is running, which configuration was active, whether a permission prompt was actually presented, or whether an outer sandbox constrained a tool process.

## What to learn from OpenCode

For newcomers, OpenCode is a concrete example of how a tool call travels from model output through registry resolution, permission evaluation, handler execution, result normalization, event publication, and the next model turn. For experienced readers, the interesting questions are where durable ordering is assigned, how child sessions inherit capability, how multiple extension systems converge on one registry, and which guarantees live outside the repository's semantic policy layer.

The profile therefore presents source facts and unknowns together. “Substantial” means the pinned source exposes enough structure to explain a mechanism; it does not mean the project has certified the product's security or reproduced its behavior end to end.
