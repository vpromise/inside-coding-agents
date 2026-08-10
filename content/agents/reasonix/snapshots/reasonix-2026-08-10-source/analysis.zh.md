# Reasonix CLI engine 源码地图

本页固定到 release ledger `1.22.0`、commit `6376bd4`。只做源码观察；没有启动 binary、provider、sandbox backend 或 plugin process。

```text
user turn
  → delivery / permission / context state
  → frozen sampling request + cache-shape capture
  → bounded stream recovery
  → clean response commit
  → batch scheduler → per-call gate → tool
  → native event log / checkpoint / next round
```

## 1. Loop

`runToolLoop` 把每个 round 分成 sampling、commit、final/tool dispatch。provider attempt 只有 clean terminal result 才进入 session，避免失败的 speculative attempt 先污染 history。max steps、grace round、steer 与 final readiness 是 host-owned state。对应 Claim：`reasonix-source-agent-loop`。

## 2. Context

context maintenance 使用 soft、snip、compact、force 等阈值，并为 recent tail 设置固定预算。`PrefixShape` 对 system prompt、tool schemas 与 provider-visible rewrite 做 hash/原因记录，目的是解释 cache hit/miss，而不是用缓存指标替代正确性。对应 Claim：`reasonix-source-context-maintenance`。

## 3. Tools

batch scheduler 与 single-call executor 分离。前者决定并行/串行与 batch lifecycle；后者建立 per-call context、检查 capability/policy、调用 tool、规范化结果并记录 failure。对应 Claim：`reasonix-source-tool-dispatch`。

## 4. Safety

permission policy、runtime approval posture 与 OS sandbox 是不同层。Ask/Auto/DontAsk/Yolo 仍受显式 deny、fresh human decision 与 headless gate 约束；shell sandbox 在 macOS/Linux 有后端，在要求 enforce 但不可用时 fail closed。Windows 的 Bash OS sandbox 在该 commit 明确不可用。对应 Claim：`reasonix-source-execution-policy`。

## 5. Reliability

sampling recovery 在同一个冻结 request 上做有限重试，只有最终采用的 clean attempt 会提交。另一个 guard 对语义相同的 write-like failure 建 signature，达到阈值后中断；部分 stale-state failure 可以先做无副作用复查。对应 Claim：`reasonix-source-retry-recovery`。

checkpoint、snapshot conflict、tail repair 与 delivery evidence 还有大量源码，但未完成端到端实验，不能在本 snapshot 宣布已验证。

## 6. Extensibility

plugin manifest 可以贡献 hooks、MCP servers 等资源。lazy MCP tool 通过 cached schema 或 connect stub 保持 provider-visible prefix 尽量稳定，再在需要时启动 process、对账 live safety metadata。对应 Claim：`reasonix-source-extension-runtime`。

## 7. Orchestration

child agent 有独立 session temp、过滤后的 tool registry、read-only profile 与 depth cap；parent-only job/orchestration tools 会隐藏，direct MCP schema 改由稳定 capability proxy 暴露。对应 Claim：`reasonix-source-subagents`。

## 8. Interfaces

同一 engine 被多个 frontend 使用，但本 snapshot 只绑定 CLI。ACP 的 NDJSON JSON-RPC、event projection 与 permission request 在独立 snapshot 中审核；desktop/web 尚无本项目 Claim。

## 9. Observability

append-only `.events.jsonl` 是 transcript authority；model-visible context、event/display indexes、conflict log、checkpoints 与 jobs 是不同 sidecars。这种 separation 让 authoritative events 与可重建 projection 不必混为一份大 JSON。对应 Claim：`reasonix-source-event-log`。

## 结论与实验要求

Reasonix 在一个 repo 中展示了很多 production-oriented 机制，但源码数量不是成熟度评分。Tier A 仍需要至少完成：真实 stream interruption、repeat failure、compaction/cache、sandbox deny、checkpoint restore 与 Native trace normalization 中的一条端到端链路，并由外部贡献者复现。
