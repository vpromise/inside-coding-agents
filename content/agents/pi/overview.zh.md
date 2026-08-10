# Pi

Pi 的代表性不在于“功能最多”，而在于它把最小 agent core 与 coding-agent 产品层拆得很清楚：底层包负责模型循环、事件和工具调用，上层负责 session tree、compaction、TUI、RPC、资源加载与 extensions。

- 当前 coverage：Tier B，source-backed；
- 版本边界：coding-agent `0.84.1`，commit `936aff0`；
- 研究价值：minimal core、extension-first、append-only session tree、明确的安全非目标；
- 关键安全边界：project trust 只保护项目级配置与 extension 的加载，不是 sandbox；默认工具继承启动 Pi 的用户与进程权限；
- 仍缺：Native trace、隔离环境内的安全实验、RPC 跨语言复现与外部 reviewer。

Pi 很适合回答一个基础问题：哪些能力必须进入 harness core，哪些可以留给 extension 或操作系统。它的“没有内建 subagents / MCP / permission popups”是有意的产品边界，不应误写成实现遗漏，也不应误解为生态中无法增加这些能力。
