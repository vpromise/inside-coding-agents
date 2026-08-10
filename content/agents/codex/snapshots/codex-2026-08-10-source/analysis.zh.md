# Codex CLI core 源码地图

本页固定到 commit `89a335e`。它说明公开 Rust core 的结构，不证明某个托管 surface 正在运行该 commit，也不等价于 Native experiment。

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

`run_turn` 是单个用户 turn 的核心循环；`RegularTask::run` 在 turn 结束后继续检查 input queue。模型需要 tool follow-up、用户 steering 或 mailbox delivery 时继续采样；没有 follow-up 时进入 stop hooks 并结束。对应 Claim：`codex-source-agent-loop`。

## 2. Context

第一次采样前会捕获 step context、记录 world state，并注入 skills/plugins。token 状态在采样后重新计算；达到限制且仍需继续时，可选择 local 或 remote compaction，再恢复当前 turn。compaction 是 history replacement，不应被描述为无损 memory。对应 Claim：`codex-source-auto-compaction`。

## 3. Tools

`ToolRouter` 持有模型可见 spec，`ToolRegistry` 持有 runtime 与 exposure。外部工具的保留名和冲突有显式处理，解析后的 tool call 再映射到 runtime。这个分层使“模型看见什么”和“host 能执行什么”成为两个检查点。对应 Claim：`codex-source-tool-router`。

## 4. Safety

approval 与 sandbox 是两层机制。approval path 决定 forbid、ask、skip 等结果；sandbox path 决定如何转换并执行 attempt。源码存在这些边界不代表某次运行启用了 OS sandbox，因此 environment 仍写为 `source-mapped`。对应 Claim：`codex-source-execution-policy`。

## 5. Reliability

turn 代码包含 cancellation、错误事件、token-limit rollover 与 retry session reuse，但本项目尚未把它们拆成通过故障注入验证的独立 Claims。当前状态是 **partial / experiment missing**。

## 6. Extensibility

turn assembly 可以注入 skills 与 plugins；hook runtime 在 session start、pre/post tool use、permission request、stop、compaction 和 session end 等边界运行类型化 hook。扩展点可以影响控制流，因此也属于 trust boundary。对应 Claim：`codex-source-extension-runtime`。

## 7. Orchestration

multi-agent tools 与 agent control 分层：工具处理模型请求，control 层负责 child spawn 与生命周期。当前只建立 source map，没有并发负载、隔离或取消实验。对应 Claim：`codex-source-subagent-routing`。

## 8. Interfaces

CLI core 与 App Server 属于不同 surface。App Server 的 JSON-RPC/transport 结论放在独立 snapshot，防止把 server protocol 当成 CLI 用户行为。

## 9. Observability

protocol 定义 turn、item、tool、approval、hook、compaction 与 collaboration 等 typed events，turn 通过 session 边界发送事件。但项目还没有可公开的 Native trace，因此“事件可重放到何种程度”保持 unknown。对应 Claim：`codex-source-event-stream`。

## 结论与缺口

这个 snapshot 已足以比较控制边界和源码组织，但仍是 Tier B。升级 Tier A 至少需要：固定 binary/version 的 Native run、脱敏 trace、一个正式 Experiment、九维关键结论审核，以及外部复现。
