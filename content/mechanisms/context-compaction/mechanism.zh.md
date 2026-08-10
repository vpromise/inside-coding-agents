# 上下文压缩

长时间运行的 Coding Agent 会积累远超单次模型请求所需的历史。上下文压缩会把超预算的模型可见历史替换成更小的投影，同时尽量保存继续工作所需的状态、来源、约束与近期动作。

因此 compaction 不是“删除旧聊天”，也不只是“让模型总结一下”。它是一个带信息损失、lineage、触发策略与恢复义务的状态转换。

## L0 · 定义与边界 {#definition}

持久 session 与活动模型上下文服务于不同目标：前者是审计和 replay 的事实记录，后者是有界工作投影。Compaction 改变后者，但不能假装前者从未存在。

> 压缩后的上下文是继续工作的 checkpoint，不是替代历史证据的新真相。

```text
append-only session events
          │
          ├── 选择较旧区域 ──► 摘要 / 外置
          │                         │
          └── 保留近期尾部 ─────────┤
                                    ▼
                          下一次模型可见投影
```

| 记录 | 压缩前 | 压缩后 | 持久位置 |
| --- | --- | --- | --- |
| 用户意图 | 完整消息 | 显式约束 | session event log |
| 已验证工具事实 | 冗长结果 | 事实 + artifact handle | tool event/artifact |
| 失败尝试 | 详细步骤 | 简短结果与原因 | trace branch |
| 近期工作 | 完整 recent tail | 完整 recent tail | 两种视图 |
| 压缩决定 | 不存在 | lineage metadata | compaction event |

### 与邻接机制的区别

`context-budget` 检测并分配压力；`tool-output-truncation` 在单个结果支配请求前对它做限制；compaction 重建更广的一段历史；`memory-retrieval` 之后可从即时上下文外重新引入记录。即使一轮内同时触发，它们仍是不同政策。

### 哪些东西必须存活

至少要保留当前用户意图、有效约束、仍生效的审批、带来源 handle 的已验证结论、未完成工作、近期因果上下文，以及对不确定性的明确描述。一个语言流畅却漏掉否定约束的摘要，不是成功压缩。

> 压缩率只是传输指标；不变量是否存活才是正确性指标。

## L1 · 可运行参考 {#reference}

运行确定性课程并验证 Golden Trace：

```bash
python3 -m curriculum.lessons.s08_context_compaction.demo
python3 -m curriculum.golden verify s08-context-compaction
```

课程注册 `inspect_artifact` 工具，返回稳定 artifact handle 和故意放大的 preview。很小的 trigger 会在工具往返后强制 compaction。Summarizer 是确定性的 Python 函数，因此演示内部没有隐藏真实模型调用或网络访问。

```python
ContextCompactor(
    trigger_chars=260,
    keep_recent_messages=0,
    summarize=summarize_history,
)
```

确定性摘要保留三件事：用户的检查意图、`artifact://large-report`、以及“测试仍为绿色”的已验证结论。规模故意很小，读者能逐行检查。

### 压缩结果需要 lineage

实用契约不能只返回 summary 文本：

```python
CompactionResult(
    summary=summary,
    replaced_event_ids=older_ids,
    retained_event_ids=recent_ids,
    artifact_refs=("artifact://large-report",),
    policy_version="reference-v1",
)
```

Reference harness 在继续之前发出 `context.compact`，payload 记录触发原因、替换消息数、保留消息数与摘要大小。原始 Trace 事件仍然存在，只有模型投影发生变化。

### 阅读 Golden Trace

因果链是：

1. 模型请求检查 artifact；
2. 工具结果进入持久 Trace；
3. 上下文越过阈值；
4. `context.compact` 记录替换 metadata；
5. 下一模型 turn 接收压缩投影；
6. turn 用依赖已保存 checkpoint 的结论结束。

Trace 能证明顺序与参考契约。由于 summarizer 是脚本，它并不能证明任意对话的语义忠实度。

### 修改前先验证

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s08-context-compaction
```

先让基线通过，再修改摘要；否则 Trace 失败时无法区分是你的改动还是环境问题。

## L2 · 工程化 compaction {#engineering}

生产级 compaction 至少有四个可分离决定：**何时**压缩、**选择哪段**替换、**如何**生成投影、以及**如何**验证结果。一个 `summarize(messages)` callback 会把四者全部隐藏。

### 触发策略

触发点可以是请求前 high-water mark、采样后 overflow signal、大型工具结果、session checkpoint，或 cache shape 转换。必须记录准确触发原因，否则“自动压缩过”无法复现。

用 hysteresis 避免在同一阈值附近反复压缩：

```text
开始压缩：预计容量的 85%
目标容量：压缩后回到 55%
输出预留：准入可选内容之前固定
冷却条件：没有实质增长时不再次压缩
```

### 区域与投影策略

不要对任意序列化文本直接摘要。先选择类型化记录：用户需求、助手决定、工具调用/结果、文件变化、审批、错误与 artifact，再生成结构化 checkpoint，最后渲染成模型输入。

```python
checkpoint = {
    "intent": current_intent,
    "constraints": protected_constraints,
    "verified_facts": facts_with_sources,
    "artifacts": stable_handles,
    "open_work": unresolved_items,
    "uncertainty": known_unknowns,
}
```

Recent tail 可以维持局部对话连贯，但“保留 N 条消息”仍不够：一条超大消息可能占满尾部，tool call 也不能与赋予它意义的 result 分开。

### 验证策略

安装压缩投影之前先验证结构不变量：必需字段存在、artifact handle 可解析、受保护约束与源记录一致、投影确实能装入、lineage ID 指向被替换的持久分支。语义验证可由模型辅助，但确定性检查必须优先。

### 失败模式 {#failure-modes}

| 失败 | 后果 | 检测或缓解 |
| --- | --- | --- |
| 流畅但丢信息的摘要 | 约束静默消失 | 类型化 invariant checklist |
| 对摘要再次摘要 | 事实漂移叠加 | 尽可能从持久源压缩 |
| 孤立 tool result | 结果失去因果 call | call/result 作为原子组处理 |
| 过期 artifact handle | 无法回取细节 | 校验 handle 与保留策略 |
| 阈值抖动 | 成本与 cache 损失反复发生 | hysteresis 与 cooldown |
| 覆盖原始历史 | replay 失效 | append compaction event，保留源分支 |
| secret 被复制进摘要 | 绕过脱敏边界 | 投影前后都做 redaction 校验 |

### 安全与可靠性 {#safety}

Approval 不是永久有效的一句话。若 checkpoint 只保留“用户批准了命令”，却丢掉 fingerprint、scope、expiry 或 one-shot 消耗状态，摘要就可能意外扩大权限。应携带类型化审批状态或重新请求决定，不能靠自然语言重建授权。

Trust label 也必须存活。外部指令、工具输出和 workspace policy 不能融合为无差别摘要。模型可以看到三者，但 Harness 在决定哪些内容能授权副作用时，仍然需要其 provenance。

取消与 steering 会产生分支边界。若用户在摘要生成期间改变方向，安装结果前必须验证它仍属于活动 branch。

## L3 · 架构与 Agent 对照 {#comparison}

本机制已经有 Codex、Pi 与 Reasonix 固定 snapshot 的 reviewed source-backed 映射。下方 Claim ledger 才是事实源；正文只解释用于对齐这些记录的比较维度。

经审核记录支持三种不同设计形态：

- 固定版本 Codex loop 在采样前后检查限制，并可经由本地或远端 compaction 后继续同一 turn；
- 固定版本 Pi 使用 reserve threshold，总结较旧分支、保留 recent entries、跟踪文件操作，并在缩减模型上下文之外保存 append-only session；
- 固定版本 Reasonix 把 compaction 当作低频 cache reset，使用多个阈值与 recent-tail budget，并记录 prefix-shape diagnostics。

这些陈述只覆盖下方链接的准确 snapshot 与源码 locator，不自动代表后续 release、所有 surface 或所有配置。

### 比较矩阵应对齐决定

应比较 trigger、选择区域、summary producer、recent-tail 规则、持久历史行为、cache 交互、artifact 保留、用户可见性和恢复方式，而不是比较名字。“compact”“summarize”“context maintenance”可能覆盖完全不同的边界。

### 证据缺口仍是一等状态

Claude Code 与 Reference Harness 如果没有合格映射，会在 Agent grid 中保持 unknown。参考课程演示一种契约，但不会被偷偷升级为厂商 Claim。缺映射只说明证据包不完整，不说明机制不存在。

## L4 · 研究与测量 {#research}

评估 compaction 需要预先知道必须保留哪些不变量。笼统的答案质量评分，无法告诉我们哪个源事实消失，也无法排除模型猜对。

### 建议的不变量存活实验

构造固定 session，其中包含：

- 一条正向要求和一条否定要求；
- 由 artifact handle 支撑的已验证工具事实；
- 一次不得重复的失败尝试；
- 一次文件变化及其当前路径；
- 一个未解决问题；
- 足以跨过固定阈值的无关历史。

压缩后分别发出依赖每个不变量的 probe。安全条件允许时发布 compacted projection，并同时发布 lineage manifest、阈值配置、模型/summarizer 身份与规范化 Trace。

测量 invariant recall、虚构、artifact 可解析性、失败动作重复率、投影大小、压缩次数、cache disruption、延迟，以及确定性结构检查。由模型生成摘要时必须多次重复。

### 练习与验收 {#exercise}

```bash
python3 -m curriculum.lessons.s08_context_compaction.demo
python3 -m curriculum.golden verify s08-context-compaction
python3 -m unittest curriculum.tests.test_course_contract
```

1. 给脚本 session 添加一个受保护的否定约束；
2. 让 `summarize_history` 故意遗漏它，并写一个必然失败的测试；
3. 在 Trace payload 加入 `replaced_event_ids` 与 `retained_event_ids`；
4. 保留一组 recent call/result，验证它们不会被拆开；
5. 创建无效 artifact handle，并让安装过程 fail closed。

当你能 replay 完整持久分支、准确检查 compaction 后模型收到什么，并把每项丢失解释为有意策略结果时，才算理解该机制。

### 研究检查点

> 摘要本身不是保真证据；lineage、不变量检查与下游 probe 才是。

本机制尚未注册正式跨 Agent 实验。课程属于 Controlled reference；三条 Agent 映射属于 source-backed Claim，而不是已复现的 Native trace。
