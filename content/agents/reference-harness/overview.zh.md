# Reference Harness

Reference Harness 是本项目为教学和受控实验提供的最小基线，不是要与 Codex、Claude Code 或其他生产级 Agent 竞争的产品。它把模型替身、agent loop、工具注册、workspace 路径边界和 Trace recorder 保持在一个无外部依赖的 Python 实现中。

- 当前 coverage：Tier C，项目内受控基线；
- 研究用途：隔离并验证 Registry、Experiment、Result、Trace 与网页回放之间的契约；
- 模型边界：Scripted Model 只返回预先声明的 turn，不代表真实模型能力；
- 安全边界：Workspace 只限制路径解析，不是操作系统 sandbox；
- 可复现性：固定 prompt、fixture digest、运行时间、两次 repetition 与规范化 trace fingerprint。

它首先回答“实验基础设施本身是否工作”。在这个基线通过后，Native adapter 才能把真实 Agent 的公开行为接入同一套证据链。
