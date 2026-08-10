# OpenCode source map

This analysis is pinned to OpenCode package `1.18.16` at commit `941e71d`. It describes the public monorepo at that revision. It does not claim that every installed binary, desktop release, or hosted service uses the same commit.

```text
client / TUI / desktop / ACP
          │
          ▼
      HTTP server + event bridge
          │
          ▼
      session prompt loop
      ├─ Agent + model adapter
      ├─ permission-filtered tool registry
      ├─ compaction + retry
      ├─ child task sessions
      └─ durable/public events
```

## 1. Loop

The prompt service owns a repeated processing loop. It loads the current message projection, handles pending subtask and compaction work, resolves Agent and model configuration, assembles tools, invokes the processor, and checks explicit completion conditions. A tool-producing turn can continue instead of being mistaken for final output. Claim: `opencode-source-agent-loop`.

## 2. Context

Compaction is a first-class session operation, not a UI text shortcut. The service checks pressure against model limits, creates a summary turn, keeps a recent tail, and can prune older tool output. This separates full session history from the smaller model-visible projection. Claim: `opencode-source-context-compaction`.

## 3. Tools

The registry converges built-in tools, custom tool files, plugin contributions, and MCP definitions. Resolution applies Agent/model context and permission visibility; execution validates input and wraps output with truncation and metadata. The useful invariant is that tool identity, permission, handler, and result remain correlated across layers. Claim: `opencode-source-tool-registry`.

## 4. Safety

Permission rules use wildcard matching and last-match precedence. An unresolved operation defaults to `ask`; deny can fail immediately, while replies distinguish one-time and persistent approval. This is a semantic capability decision. The reviewed files do not prove kernel enforcement around a hostile subprocess, so the OS-sandbox dimension remains unknown. Claim: `opencode-source-execution-policy`.

## 5. Reliability

The retry module classifies provider errors, selected HTTP failures, overload signals, and retry headers. Context overflow is not silently replayed as a transient error, and retry delay is calculated explicitly. This maps policy code, not successful recovery under injected faults. Claim: `opencode-source-retry-policy`.

## 6. Extensibility

Plugins, skills, custom tools, and MCP are different acquisition paths that eventually affect prompt or tool resolution. MCP supports configured transports; skill discovery loads `SKILL.md` resources; plugins can add behavior in-process. Their presence expands capability and attack surface together. Claim: `opencode-source-extension-runtime`.

## 7. Orchestration

The task tool walks ancestry to enforce a depth boundary, derives child permission, and creates a session linked to its parent. Foreground and background execution share explicit task/session identity. Context separation is visible; filesystem or process isolation is not implied. Claim: `opencode-source-subagent-sessions`.

## 8. Interfaces

The HTTP server is a reusable harness surface. The TUI worker can provide an embedded fetch path and forward global events over RPC, keeping UI rendering separate from session ownership. This makes protocol and event compatibility part of the product architecture. Claim: `opencode-source-client-server`.

## 9. Observability

The event bridge enriches events with project/directory location and aggregate identity, assigns durable sequence/version metadata, and republishes a public event through the global bus. Consumers still need schema compatibility, resume, redaction, and retention policy; a sequence field alone does not solve those. Claim: `opencode-source-event-bridge`.

## Evidence boundary and next experiment

All nine claims are static source observations pinned to one commit. The next safe step is a pre-registered read-only Native run using documented structured JSON output in a disposable fixture, with tool access minimized and publication disabled by default. Until that trace is captured, normalized, redacted, reviewed, and externally reproduced, OpenCode remains Tier B.
