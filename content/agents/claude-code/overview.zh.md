# Claude Code

Claude Code 的 product core 未在其公开 distribution repository 中提供，因此本项目采用 Tier B clean-room 边界：只整理官方文档、正式 changelog、公开 examples/plugins 与授权环境中的可观察行为，不猜测内部文件、隐藏 prompt 或状态机。

- 当前 coverage：Tier B，official-doc；
- 文档观察边界：2026-08-10，公开 distribution tag `v2.1.226`；
- 已结构化：permissions + sandbox、lifecycle hooks、subagent capability/isolation，以及实验性 Agent Teams coordination contract；
- 明确 unknown：内部 loop、context reducer、tool dispatcher、retry scheduler、event storage 和隐藏 protocol；
- 仍缺：脱敏 Native trace、版本固定的黑盒实验与 docs change monitor。

Tier B 不是“低质量”标签，而是证据类型不同：公开行为可以被精确描述，但不能从界面或文档倒推出闭源实现。

Agent Teams 与普通 subagent 被分开记录。官方文档描述了拥有独立 context window、共享 task list 并可直接互发消息的 teammate，同时明确 teammate 不会自动获得 worktree 隔离。这些是产品合同事实；scheduler 内部实现与实际 workspace isolation 仍为 unknown。
