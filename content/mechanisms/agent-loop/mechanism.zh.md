# Agent Loop

## L0 · 直觉

模型不是 Agent。模型只回答“下一步做什么”，Harness 负责把回答变成动作、把动作结果放回上下文，并决定继续还是停止。

```text
用户意图 → 模型响应 → 工具请求 → 策略判断 → 工具结果
    ↑                                           │
    └──────────── 更新上下文并继续 ─────────────┘
```

一个可信的 loop 必须能回答三件事：现在是什么状态、为什么继续、为什么停止。

## L1 · 可运行参考

运行 `python3 -m curriculum.lessons.s03_tool_dispatch.demo`。Fake Model 先请求 `echo`，Registry 验证并执行，结果作为 tool message 回到第二次模型调用。整个过程输出 Trace 0.1 JSONL。

## L2 · 工程约束

- 为总轮数、wall time、token 和工具调用设置独立预算；
- tool validation、authorization、execution 和 result normalization 分层；
- stream 中断、模型错误与工具错误使用不同恢复策略；
- cancellation 和 steering 必须成为 loop 状态，而不是 UI 特例；
- stop reason 进入 Trace，不能只存在于日志字符串。

## L3 · Agent 映射

截至 2026-08-10 的官方文档把 Codex CLI 描述为一个终端内的连续工作循环，支持探索、规划、编辑、运行本地工具、steering 和同 session follow-up。当前 Claim 只证明产品表面行为；源码映射、请求协议、重试和终止逻辑仍标记为未知。

## L4 · 研究入口

合成 Controlled trace 证明本项目的事件和工具往返契约可以运行，但不能替代真实 Agent 的 Native trace。下一步实验需要固定 Agent 版本、模型、权限、sandbox、fixture 和不可见字段。
