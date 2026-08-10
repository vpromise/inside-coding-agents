# Grok Build

Grok Build 是一个很强的系统型 Harness 研究对象：公开 Rust repository 包含 Agent runtime、terminal UI、headless entry point、ACP transport、tool registry、workspace layer、permission、sandbox backend、hook、plugin、skill、subagent、retry logic 与 event file。它的边界让我们可以分别比较语义 policy、kernel enforcement、protocol projection 与 durable observability，而不把它们假装成同一个机制。

- 当前覆盖：Tier B，源码支撑。
- 版本边界：CLI crate `1.0.0`，repository commit `75e73f3`。
- 来源边界：该 repository 是公开 source sync；`SOURCE_REV` 记录 monorepo revision `a61c32b…`。
- 研究价值：actor-style session control、typed tool bridge、ACP、独立 child session、plugin/hook gate、可配置 compaction 与显式 sandbox state。
- 关键限制：源码中存在 unsupported/apply-failure 后继续无 sandbox 运行的路径。因此 effective isolation 必须逐次 run 记录，不能仅由 `--sandbox` 请求推断。
- 尚缺：released binary version 校验、经审核的 Native streaming-JSON Trace、平台相关 sandbox 实验、ACP interoperability 复现与外部 reviewer。

Repository 展现的是分层设计，而不是单体循环。Session actor 接收 command 与异步 event；turn 驱动 sampling 和 tool call；ToolBridge 投影 finalised registry；workspace policy 解析 permission；独立 sandbox manager 尝试平台 enforcement；file-event utility 持久化可观察生命周期记录。

这种分离给 Harness 构建者一个非常重要的结论：

```text
permission decision ≠ sandbox requested ≠ sandbox active ≠ effect contained
```

Deny rule 可以在执行前拦截调用。Sandbox profile 可以请求 OS 限制。Active backend 决定这些限制是否真的存在。Tool semantics 与外部 side effect 仍决定哪些影响可能逃逸或不可逆。Grok Build snapshot 会把这四个问题同时展示。

## 可以从 Grok Build 学什么

对入门读者，这个 repository 展示了 production-shaped coding Agent 如何拆分为 turn control、model sampling、tool dispatch、permission、isolation、event projection 与 UI/protocol client。对深入研究者，pure retry decision、tool 前的 hook gate、subagent resume identity、带 schema version 的 JSONL event 与 ACP normalization 更值得追踪。

九项已审核机制映射是源码事实，不是产品认证。本 snapshot 没有进行模型调用，也没有执行 released CLI。只有预注册的 Native run 固化实际 binary、flag、active isolation state、可观察 event stream 与限制后，才有条件从 Tier B 继续升级。
