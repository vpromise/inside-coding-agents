# Grok Build source map

This analysis is pinned to public repository commit `75e73f3`, whose `SOURCE_REV` points to monorepo revision `a61c32b…`. The released CLI was not executed. Repository sync, package version, installed binary, and hosted service are separate version identities and must not be silently equated.

```text
TUI / headless / ACP
        │
        ▼
   session actor + turn
   ├─ Agent / sampler / retry
   ├─ ToolBridge + permission
   ├─ sandbox manager + workspace
   ├─ child sessions + hooks
   └─ ACP updates + JSONL events
```

## 1. Loop

The session run loop multiplexes commands, turn events, cancellation, and child work. A turn emits a start record, drives sampler output, dispatches tool calls, and projects terminal outcomes. This actor boundary prevents the TUI from becoming the authoritative state machine. Claim: `grok-build-source-agent-loop`.

## 2. Context

`CompactionPolicy` exposes context threshold, optional compaction model, memory flush, wall-clock limit, and optional two-pass behavior. The Agent checks measured context pressure before auto-compacting. These knobs make budget policy explicit, but source alone cannot establish summary quality or loss under real tasks. Claim: `grok-build-source-context-compaction`.

## 3. Tools

`ToolBridge` owns a finalized registry and presents tool definitions to the Agent. Built-in and MCP-backed tools enter a common dispatch boundary, reducing the risk that each client invents its own execution path. Typed registration does not replace permission, sandbox, timeout, or result redaction. Claim: `grok-build-source-tool-bridge`.

## 4. Safety

Semantic permission resolution and OS sandbox activation are separate. Deny precedence can prevent a request, while sandbox profiles attempt platform enforcement. The reviewed manager records requested versus active state, but its unsupported and application-failure paths warn and continue without sandboxing. Therefore “sandbox requested” must never be reported as “sandbox active.” Claim: `grok-build-source-execution-policy`.

## 5. Reliability

The sampler's retry module returns explicit decisions instead of scattering sleeps across call sites. It can honor retry-after, apply exponential jitter, strip problematic image input, rebuild a client, or stop on context/fatal errors. This is inspectable policy, not proof that replay is semantically safe for side-effecting turns. Claim: `grok-build-source-retry-policy`.

## 6. Extensibility

Plugins, skills, MCP tools, and hooks cover different extension layers. Hook events include session and tool lifecycle points; pre-tool dispatch can gate or modify work before execution. Because extensions can influence capability and policy, a run manifest must record the loaded extension set rather than identifying only the base binary. Claim: `grok-build-source-extension-runtime`.

## 7. Orchestration

Subagent resolution separates definitions, context, overrides, and resume identity. The task extension creates child session identity and carries isolation/worktree metadata. This is stronger than an inline prompt convention, but metadata still needs enforcement evidence: a named worktree or isolation mode is not proof by itself. Claim: `grok-build-source-subagent-runtime`.

## 8. Interfaces

The ACP library supplies line-oriented JSON-RPC channels, message types, and normalization. The shell projects session activity into ACP updates for external clients. A stable protocol surface enables editor integration and independent clients, while also creating compatibility, cancellation, ordering, and backpressure obligations. Claim: `grok-build-source-acp-interface`.

## 9. Observability

File-event utilities append versioned JSONL records, and the tracker emits turn, tool, permission, and terminal lifecycle events. This supports replay and audit tooling, but append-oriented source code does not establish retention, crash durability, access control, or public-safe redaction in every deployment. Claim: `grok-build-source-event-log`.

## Evidence boundary and next experiment

The next safe experiment is a pre-registered, read-only headless run against a disposable fixture using streaming JSON, explicit tool deny/allow controls, disabled subagents and memory, a turn cap, and a requested strict sandbox. Capture must separately record whether the sandbox became active. Raw output stays private; only a reviewed redacted normalization can become evidence. Until then, all nine mappings remain Tier B source evidence.
