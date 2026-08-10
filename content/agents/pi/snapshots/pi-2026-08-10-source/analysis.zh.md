# Pi coding-agent 源码地图

本页固定到 package `0.84.1`、commit `936aff0`。研究对象是官方 monorepo 中的 agent core 与 coding-agent CLI，不包含第三方 Pi packages 的行为。

```text
Agent wrapper
  → agent-loop (model / tools / steering / follow-up)
  → AgentEvent stream
  → AgentSession
      ├─ SessionManager: append-only JSONL tree
      ├─ compaction / branch summary
      ├─ built-in tools
      └─ ExtensionRunner / resources / UI
```

## 1. Loop

底层 `runLoop` 有清晰的双层结构：内层处理 tool calls 与 steering，外层在 Agent 本来要停止时检查 follow-up queue。`Agent` wrapper 保存 transcript、queue mode、model 与 tools，并把事件交给订阅者。对应 Claim：`pi-source-agent-loop`。

## 2. Context

coding-agent 根据 provider usage 与估算 token 计算阈值，保留 recent tail，把较老区域压成 summary，并记录 read/modified files。compaction 改变模型可见 projection，但完整 session tree 仍在 JSONL 中。对应 Claim：`pi-source-context-compaction`。

## 3. Tools

工具参数先验证，再经过 before hook；batch 可按配置并行或串行，完成后经过 after hook，并将 normalized result 放回 context。对因 length stop 而可能被截断的参数，loop 选择失败这些 calls，而不是执行不完整输入。对应 Claim：`pi-source-tool-dispatch`。

## 4. Safety

这里最重要的是一个负结论：Pi core 没有内建 permission system 或 OS sandbox。project trust 只决定是否加载 project-local settings、packages 与 extensions；工具仍继承 host process 权限。真正隔离必须放在 container、VM、micro-VM 或 policy sandbox。对应 Claim：`pi-source-execution-boundary`。

## 5. Reliability

源码包含 provider retry、auto retry、abort、截断 tool-call 防护与 session migration，但本项目尚未完成统一 failure taxonomy 和故障注入。因此该维度仍为 **partial**，不能从存在 retry 代码推导恢复成功率。

## 6. Extensibility

ExtensionRunner 是产品层的主要扩展边界。extensions 可以添加/替换 tools、commands、UI、providers，拦截 tool calls，改变 context transform 与 compaction。扩展与 Pi 同权限运行，因此 capability 与 trust 必须一起评估。对应 Claim：`pi-source-extension-runtime`。

## 7. Orchestration

Pi 有意不在 core 中规定 subagent 模型。官方建议用独立 Pi 进程、tmux、extension 或 package 组合自己的方案。这是架构选择：core 更小，但进程所有权、权限继承、workspace isolation 与 merge policy 由集成者承担。对应 Claim：`pi-source-orchestration-boundary`。

## 8. Interfaces

交互式 TUI、print/JSON 与 RPC 是不同模式。RPC 的 command/response/event contract 放在独立 server snapshot，避免把 process integration 与交互 UI 混写。

## 9. Observability

live `AgentEvent` 支持 UI 更新；`SessionManager` 把 entry 作为带 `id/parentId` 的 append-only JSONL tree 保存。branch 只移动 leaf，新写入形成新分支，不删除旧路径。对应 Claim：`pi-source-session-events`。

## 设计取舍

Pi 展示了一种强烈的 minimal-core 路线：少做平台政策，多暴露组合点。优点是机制边界易读、定制成本低；代价是安全、subagent 与 MCP 等行为可能因 extension stack 不同而显著变化。比较 Pi 时必须同时记录“core version + loaded extensions + outer sandbox”。
