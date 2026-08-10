# Claude Code clean-room 文档快照

这个 snapshot 的强项是产品契约，弱项是内部实现可见性。所有结论来自官方文档，观察日期为 2026-08-10；公开 distribution tag `v2.1.226` 只用于版本对齐，不能被当作 product core 源码。

## 1. Loop — unknown

官方材料确认 Claude Code 是 agentic terminal workflow，但本 snapshot 不声明内部 sampling loop、tool-result continuation、termination enum 或 retry scheduler。后续只能用官方 structured output 或授权黑盒实验描述外部行为。

## 2. Context — partial

subagent 文档确认 child 使用独立 context window，并描述 auto-compaction、resume 与 startup loading。它不公开主 context reducer 的算法、摘要 prompt 或持久化格式，因此这些保持 unknown。

## 3. Tools — partial

文档公开 tool permission rule syntax、subagent tool allow/deny 与 MCP scope。它支持 capability contract，却不能证明内部 registry、validator 或 dispatcher 的代码结构。

## 4. Safety — documented product contract

permissions 决定 tool/file/domain 是否可访问；sandbox 为 Bash 与 child processes 提供 OS-level filesystem/network enforcement。官方建议同时使用，两者不是替代关系。deny、ask、managed precedence 与 sandbox boundary 的细节必须绑定文档日期。对应 Claim：`claude-code-doc-execution-policy`。

## 5. Reliability — unknown

文档包含错误与 troubleshooting 页面，但本项目还没有版本固定的 retry、partial tool call、crash recovery 或 resume 实验，不能断言内部策略。

## 6. Extensibility — documented product contract

hooks 覆盖 PreToolUse、PostToolUse、PermissionRequest、SessionStart/End、Stop 等 lifecycle。PreToolUse deny 可以在 permission-mode check 前阻止调用，而 allow 不能越过更严格的 deny rule。hook 并发与 merge precedence 是需要实验的失败面。对应 Claim：`claude-code-doc-hooks`。

## 7. Orchestration — documented product contract

subagent 有独立 context、prompt、tools、model、permission mode、hooks、skills、max turns/depth 与可选 worktree isolation。文档还区分 foreground/background、resume 与 teams，但本 snapshot 不推断 scheduler 实现。对应 Claim：`claude-code-doc-subagents`。

## 8. Interfaces — partial

已知 surface 包括 CLI/TUI、IDE integration 与 Agent SDK。尚未建立版本固定的 protocol Claim，因此不会把 UI 行为写成稳定 wire contract。

## 9. Observability — unknown

transcript、hook JSON 与 programmatic output 能提供可观察事件，但本项目尚未采集 Native trace，也不知道内部 authoritative event store。页面只展示 evidence ledger，不模拟内部 event bus。

## Tier B 的完成方式

闭源研究不是等待源码，而是把证据边界做得更严格：每个 Claim 绑定官方页面与抓取日期；动态文档变化触发 stale；实验只记录公开输出；不提取隐藏 prompt、chain-of-thought 或私人 telemetry；任何关于“内部为何如此”的解释都标记 inference。
