# 官方文档观察

这个 snapshot 只回答“Codex CLI 官方承诺用户可以做什么”，不回答内部 Rust core 如何实现。文档把 CLI 描述为留在 terminal 内的连续 coding loop：检查 repository、规划与修改、运行本地工具、在执行中 steering，并在同一 session 中继续 follow-up。

## 可确认

- product surface 是 CLI；
- loop 对用户呈现为连续 session，而非一次性补全；
- permission 与 sandbox 可以配置；
- 用户可以在活动 turn 中 steering。

## 不可由此确认

- exact loop state machine、retry count 与 termination enum；
- tool registry、approval cache 和 OS sandbox 的源码结构；
- desktop、IDE 或 cloud 是否运行相同 binary 与 commit；
- 性能、安全效果或故障恢复能力。

后续 source snapshot 提供实现地图，但两种证据不会合并成一个 Claim：官方产品行为与公开源码实现可能有不同发布节奏。
