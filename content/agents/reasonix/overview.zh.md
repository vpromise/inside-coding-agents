# Reasonix

Reasonix 将同一套 Go engine 暴露给 terminal、desktop、browser 与 ACP surface。其源码把 cache-aware context maintenance、approval、OS sandbox、checkpoint、plugin/MCP、subagent 和 append-only session event log 都放在可检查的边界中，因此适合研究“长时运行 harness 如何同时处理性能、安全和恢复”。

- 当前 coverage：Tier B，source-backed；
- 版本边界：release ledger `1.22.0`，commit `6376bd4`；
- Snapshot：CLI engine 与 ACP 分离；
- 研究价值：prefix-cache diagnostics、多阶段 context maintenance、stream recovery、repeat-failure guard、child tool filtering、session authority；
- 仍缺：真实 provider 失败注入、OS sandbox 执行、checkpoint 回滚、ACP editor interoperability 与外部复现。

源码结构丰富不等于实验结论成立。本档案只说明固定 commit 明确实现了哪些机制，不据此声称缓存成本更低、恢复成功率更高或安全边界在所有平台都已生效。
