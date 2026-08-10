# OpenCode 源码地图

本分析固定在 OpenCode package `1.18.16`、commit `941e71d`。它描述的是该 revision 的公开 monorepo，不声称每个 installed binary、desktop release 或 hosted service 都使用同一 commit。

```text
client / TUI / desktop / ACP
          │
          ▼
      HTTP server + event bridge
          │
          ▼
      session prompt loop
      ├─ Agent + model adapter
      ├─ permission-filtered tool registry
      ├─ compaction + retry
      ├─ child task sessions
      └─ durable/public events
```

## 1. Loop

Prompt service 拥有重复处理循环。它加载当前消息投影，处理待执行的 subtask 与 compaction，解析 Agent 和模型配置，组装工具，调用 processor，再检查显式完成条件。产生 tool call 的 turn 可以继续，而不会被误当作最终输出。Claim：`opencode-source-agent-loop`。

## 2. Context

Compaction 是一等 session operation，而不是 UI 的文本缩写。Service 对照 model limit 检查压力，建立 summary turn，保留近期 tail，并可清理更早的 tool output。完整 session history 与较小的 model-visible projection 因此被分开。Claim：`opencode-source-context-compaction`。

## 3. Tools

Registry 汇合 built-in tool、custom tool file、plugin contribution 与 MCP definition。解析过程带入 Agent/model context 和 permission visibility；执行过程验证输入，并用 truncation 与 metadata 包装输出。关键 invariant 是 tool identity、permission、handler 和 result 能跨层关联。Claim：`opencode-source-tool-registry`。

## 4. Safety

Permission rule 使用 wildcard matching 与 last-match precedence。未解析的操作默认 `ask`；deny 可立即失败，reply 则区分单次与持续批准。这是语义层 capability decision。被审核的文件无法证明 hostile subprocess 周围存在 kernel enforcement，因此 OS-sandbox 维度仍为 unknown。Claim：`opencode-source-execution-policy`。

## 5. Reliability

Retry module 分类 Provider error、部分 HTTP failure、overload signal 与 retry header。Context overflow 不会被悄悄当作瞬时错误重放，retry delay 也被显式计算。这只映射 policy code，不证明在 fault injection 下恢复成功。Claim：`opencode-source-retry-policy`。

## 6. Extensibility

Plugin、skill、custom tool 与 MCP 是不同 acquisition path，最终都会影响 prompt 或 tool resolution。MCP 支持配置 transport；skill discovery 加载 `SKILL.md`；plugin 可在进程内增加行为。Capability 与 attack surface 会同时扩大。Claim：`opencode-source-extension-runtime`。

## 7. Orchestration

Task tool 遍历 ancestry 以执行 depth boundary，派生 child permission，并创建带 parent link 的 session。前台与后台执行共享显式 task/session identity。Context separation 可从源码确认，但不能据此推断 filesystem 或 process isolation。Claim：`opencode-source-subagent-sessions`。

## 8. Interfaces

HTTP server 是可复用 Harness surface。TUI worker 可提供 embedded fetch path，并通过 RPC 转发 global event，让 UI rendering 与 session ownership 分离。Protocol 与 event compatibility 因而成为产品架构的一部分。Claim：`opencode-source-client-server`。

## 9. Observability

Event bridge 为事件补充 project/directory location 与 aggregate identity，分配 durable sequence/version metadata，再通过 global bus 发布公共事件。消费者仍需要 schema compatibility、resume、redaction 与 retention policy；仅有 sequence 字段并不能解决这些问题。Claim：`opencode-source-event-bridge`。

## 证据边界与下一项实验

九条 claim 都是固定在单一 commit 的静态源码观察。下一步应在 disposable fixture 中预注册只读 Native run，使用官方文档中的 structured JSON output，最小化工具权限并默认禁止发布。只有完成 capture、normalize、redaction、review 和外部复现后，OpenCode 才具备从 Tier B 继续升级的条件。
