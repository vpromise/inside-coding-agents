# Grok Build 源码地图

本分析固定在公开 repository commit `75e73f3`，其中 `SOURCE_REV` 指向 monorepo revision `a61c32b…`。我们没有执行 released CLI。Repository sync、package version、installed binary 与 hosted service 是不同版本身份，不能被静默等同。

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

Session run loop 复用 command、turn event、cancellation 与 child work。Turn 发出 start record，驱动 sampler output、分派 tool call，并投影 terminal outcome。这层 actor boundary 避免 TUI 成为权威状态机。Claim：`grok-build-source-agent-loop`。

## 2. Context

`CompactionPolicy` 暴露 context threshold、可选 compaction model、memory flush、wall-clock limit 与可选 two-pass behavior。Agent 会在 auto-compaction 前检查实测 context 压力。配置是显式的，但源码无法证明真实任务中的 summary quality 或信息损失。Claim：`grok-build-source-context-compaction`。

## 3. Tools

`ToolBridge` 持有 finalised registry，并向 Agent 提供 tool definition。Built-in 与 MCP-backed tool 进入共同 dispatch boundary，降低每个 client 自建执行路径的风险。Typed registration 不能替代 permission、sandbox、timeout 与 result redaction。Claim：`grok-build-source-tool-bridge`。

## 4. Safety

语义 permission resolution 与 OS sandbox activation 是两套机制。Deny precedence 可阻止请求，sandbox profile 则尝试平台 enforcement。被审核的 manager 记录 requested 与 active 状态，但其 unsupported 和 application-failure path 会警告后继续无 sandbox 运行。因此绝不能把“sandbox requested”写成“sandbox active”。Claim：`grok-build-source-execution-policy`。

## 5. Reliability

Sampler retry module 返回显式 decision，而不是把 sleep 分散在 call site。它可以遵守 retry-after、使用指数 jitter、移除有问题的 image input、重建 client，或在 context/fatal error 时停止。这是可检查 policy，不证明对带 side effect 的 turn 进行 replay 在语义上安全。Claim：`grok-build-source-retry-policy`。

## 6. Extensibility

Plugin、skill、MCP tool 与 hook 覆盖不同扩展层。Hook event 包括 session 和 tool lifecycle point；pre-tool dispatch 可在执行前 gate 或修改工作。扩展会同时影响 capability 与 policy，因此 run manifest 应记录 loaded extension set，不能只记录 base binary。Claim：`grok-build-source-extension-runtime`。

## 7. Orchestration

Subagent resolution 分离 definition、context、override 与 resume identity。Task extension 创建 child session identity，并携带 isolation/worktree metadata。这比 inline prompt convention 更强，但 metadata 仍需要 enforcement evidence：名字里有 worktree 或 isolation 并不能自行证明隔离有效。Claim：`grok-build-source-subagent-runtime`。

## 8. Interfaces

ACP library 提供 line-oriented JSON-RPC channel、message type 与 normalization。Shell 把 session activity 投影为面向外部 client 的 ACP update。稳定协议支持 editor integration 与独立 client，同时也带来 compatibility、cancellation、ordering 与 backpressure 义务。Claim：`grok-build-source-acp-interface`。

## 9. Observability

File-event utility append 带版本的 JSONL record，tracker 发出 turn、tool、permission 与 terminal lifecycle event。这能支持 replay 与 audit tooling，但 append-oriented 源码无法证明每个 deployment 的 retention、crash durability、access control 或 public-safe redaction。Claim：`grok-build-source-event-log`。

## 证据边界与下一项实验

下一项安全实验应在 disposable fixture 中预注册只读 headless run：使用 streaming JSON、显式 tool deny/allow、关闭 subagent 与 memory、限制 turn，并请求 strict sandbox。Capture 必须另行记录 sandbox 是否真正 active。Raw output 保持私有，只有经审核与脱敏的 normalization 才可能成为证据。在此之前，九项映射都保持 Tier B 源码证据。
