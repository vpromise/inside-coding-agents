# OpenCode

OpenCode 很适合作为 Harness 研究对象，因为它把终端 UI、桌面客户端、headless server、面向 SDK 的协议、模型 adapter、权限、工具、session 与扩展放在同一个开放 monorepo 中。它并不是简单的“CLI 调一次模型”：多个 client 投影同一套由 server 拥有的 session 系统，event 与 tool boundary 也被不同产品表面复用。

- 当前覆盖：Tier B，源码支撑。
- 版本边界：package `1.18.16`，commit `941e71d`。
- 研究价值：client/server 组合、多 Provider 适配、permission-filtered tool、durable event、child session、plugin、skill 与 MCP。
- 关键安全边界：本 snapshot 审核的是语义层授权服务；它不能证明存在 OS sandbox，也不能证明 filesystem、process 与 network 被普遍隔离。
- 尚缺：installed version 校验、经审核的 Native JSON event Trace、对抗性 permission 实验与外部复现。

源码反复体现一种设计：关键行为由围绕 session 的 service 表达，而不是藏在 TUI 内。Prompt loop 读取持久消息、解析当前 Agent 和可见工具、调用 processor、发布生命周期事件，并在显式终止条件满足前持续运行。TUI 与其他 client 消费这套系统，而不是分别实现自己的循环。

这层分离让 OpenCode 很适合用来比较三类常被混淆的合同：

1. **模型合同**——把 Provider-specific streaming 与 tool call 变成稳定内部消息。
2. **Harness 合同**——由 session、permission、compaction、retry、tool 与 child task 拥有控制流。
3. **Client 合同**——HTTP、event stream、TUI worker RPC、desktop 与 ACP 投影可观察状态。

本次 snapshot 映射了九类机制，但仍保持 Tier B。源码覆盖不等于运行时证据：它不能证明 hosted 或 installed surface 正在运行哪个 revision，不能证明当时启用了什么配置，也不能证明 permission prompt 真的出现，或外层 sandbox 确实限制了 tool process。

## 可以从 OpenCode 学什么

对入门读者，OpenCode 提供了一条清晰的 tool-call 路径：模型输出经过 registry resolution、permission evaluation、handler execution、result normalization、event publication，再进入下一轮模型请求。对深入研究者，更值得追问的是 durable ordering 在哪一层分配、child session 如何继承 capability、多种扩展系统怎样汇入一个 registry，以及哪些保证实际上位于语义 policy 之外。

因此这个 profile 会同时展示源码事实与 unknown。“Substantial”只表示固定版本源码足以解释该机制，不表示本项目已经认证产品安全性，或完成端到端行为复现。
