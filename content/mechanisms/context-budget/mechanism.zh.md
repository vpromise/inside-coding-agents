# 上下文预算

Coding Agent 并不是把“整段对话”原封不动交给模型。每一轮开始前，Harness 都要从系统指令、用户消息、助手历史、工具结果、检索记忆中构造一个有限投影，还要给下一次输出预留空间。上下文预算，就是决定这些稀缺空间如何分配的策略。

本页严格对应可运行的 `s06-context-budget`：先解释它已经实现并能由 Golden Trace 证明的部分，再明确标出生产环境与跨 Agent 研究尚未回答的问题。

## L0 · 定义与边界 {#definition}

上下文预算负责模型可见输入的资源分配。它回答的是：**下一次请求允许放入什么、以什么形态放入、还要为输出留下多少空间？** 它不等于记忆、不等于压缩，也不等于模型厂商公布的最大上下文窗口。

> 大窗口只是容量上限；预算是 Harness 在这个上限之下主动做出的取舍。

最简单的心智模型是一张装箱单：

```text
请求容量
├── 固定系统指令
├── 当前用户意图
├── 最近对话
├── 按需检索的记忆或 Skill
├── 规范化后的工具结果
└── 为模型输出保留的空间
```

至少要区分三个数字：模型/供应商容量、Harness 的输入上限、输出预留。把它们混成一个“最大 token”数字，会导致请求在最后一刻被供应商拒绝，或者出现无法解释的截断。

| 问题 | 负责组件 | 必须可观察的证据 |
| --- | --- | --- |
| 模型上下文容量 | 模型/供应商契约 | 固定的模型与 tokenizer 假设 |
| Harness 输入上限 | context assembler | 纳入、排除、转换了哪些记录 |
| 工具输出上限 | tool-result normalizer | 原始大小、保留大小、artifact handle |
| 输出预留 | request planner | 预留量与耗尽原因 |

### 不属于本机制的工作

预算负责限制与准入；`context-compaction` 负责用更小的历史投影替换旧历史；`memory-retrieval` 负责从上下文外选择记录；`tool-output-truncation` 负责转换单个过大的工具结果。它们会协作，但如果全部塞进一个“缩短 prompt”函数，信息损失将无法审计。

### 最重要的不变量

每一次变换都必须留下理由。无论内容被丢弃、摘要、截断，还是替换成 artifact 引用，Trace 都应保存策略决定；被丢弃的原文可以因为隐私或体积不保留，但决定本身不能消失。

> 在确认 Harness 真正发送了什么之前，不要轻易归因于“模型忽略了它”。

## L1 · 可运行参考 {#reference}

在仓库根目录直接运行课程实现：

```bash
python3 -m curriculum.lessons.s06_context_budget.demo
python3 -m curriculum.golden verify s06-context-budget
```

Demo 故意设置极小的字符预算，因此不用调用任何真实模型也能观察行为。Scripted Model 请求 `large_result`，工具返回超大合成 payload，`ContextBudget` 同时约束组装输入与规范化后的工具结果。

```python
AgentRunner(
    model=ScriptedModel(turns),
    tools=registry,
    trace=trace,
    system_prompt="Keep tool output bounded. " * 8,
    budget=ContextBudget(
        max_input_chars=300,
        max_tool_output_chars=180,
    ),
)
```

这里按字符计数，是为了得到确定、易懂、无需外部依赖的教学结果；它**不等价于**任意真实模型的 tokenizer。生产 adapter 必须使用固定模型的请求契约，或显式说明误差范围的保守估算器。

### 准入是投影，不是篡改历史

持久 session 记录与模型可见请求是两种视图。预算组件应构造请求投影，而不是悄悄改写底层事件日志：

```python
projection = assemble(
    durable_events=session.events,
    input_limit=budget.max_input_chars,
    output_reserve=budget.output_reserve,
)
model.send(projection.messages)
trace.emit("context.assemble", projection.manifest)
```

教学 Harness 把契约压缩到最小：`context.assemble` 记录大小和截断信息。Golden Trace 才是可执行规范，本页文字只是对该事实源的解释。

### 按因果顺序阅读 Trace

在课程 Trace Player 中依次寻找：

1. turn 以受限请求开始；
2. Scripted Model 发出工具调用；
3. 工具返回超过工具结果上限的内容；
4. Harness 记录受限后的表示；
5. 下一次请求由这个表示组装；
6. loop 用明确 stop reason 结束。

重点不是某个字符数，而是边界在下一次模型请求之前被确定地执行，并且能从事件中解释。

### 最小验收检查

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s06-context-budget
```

这些检查证明 reference harness 的行为与 Trace 契约，不证明它与厂商 tokenizer 或某个真实 Agent 实现等价。

## L2 · 工程化预算 {#engineering}

生产级预算一定是多维的。Token 只是其中一轴；延迟、缓存形状、工具结果字节数、附件数量、请求协议限制、预计输出长度，都可能更早成为瓶颈。

### 明确资源池与优先级

实用的 planner 会先保护不可丢项目，再把淘汰顺序写成政策：

```text
保护：系统安全规则、当前用户请求、仍有效的审批
优先：最近已验证结果、活动计划、当前文件片段
淘汰：重复叙述、过期预览、已被替代的观察
外置：大型 artifact，保留稳定 handle 与 provenance
```

“只保留最新消息”并不可靠。一个刚产生的冗长工具输出可能挤掉较老但仍生效的约束；反过来，把所有指令永久固定也可能让真正需要的证据无处进入。

### 序列化之后再计数

应计算真正要发送的请求：role、tool schema、结构化参数、协议包装、图片与供应商开销都在其中。只计算 message 文本，会系统性低估输入。

如果只能近似估算，就公开误差：

```python
estimate = counter.estimate(serialized_request)
if estimate.upper_bound > input_limit:
    projection = planner.reduce(projection)
```

保守上界比伪精确数字更安全。Trace 应记录 counter 版本、模型假设、输入上限和采取的缩减动作，这样切换 snapshot 后才能解释行为为何变化。

### 失败模式 {#failure-modes}

| 失败 | 可观察症状 | 更好的边界 |
| --- | --- | --- |
| 盲目删除最旧消息 | 早期需求消失 | 保护类型化约束并记录淘汰 |
| 完整复制工具输出 | 单次命令挤满上下文 | 有界预览 + artifact handle |
| 没有输出预留 | 请求被拒或回答被截断 | 纳入可选内容前先预留 |
| 隐藏 token 估算 | 换模型后行为突变 | 在 Trace 固定 counter/模型假设 |
| 覆盖持久历史 | replay 无法重建损失 | 保留不可变事件，只构造投影 |
| 反复摘要摘要 | 事实漂移累积 | 保存 lineage，优先回源检索 |

### 安全与可靠性 {#safety}

预算压力也是安全边界，因为它可能移除权限、拒绝理由、信任标签或用户约束。应把这些内容建模成受保护的类型化记录，而不是依赖它们在自然语言中的位置。若必要记录确实放不下，应明确失败或切换到更小的操作模式，不能带着残缺安全包络继续执行。

工具输出属于不可信数据。截断后，原本被引用的指令不能变成看似系统规则；检索也不能把外部文本提升到高权限 instruction slot。来源与 trust label 必须穿过每一次转换。

### 缓存效率不等于语义正确

稳定前缀可能降低延迟与成本，但只有在语义与新鲜度保持时才成立。至少分别衡量两类结果：

- 语义结果：哪些事实、约束得以保留；
- 传输结果：token 数、cache reuse、延迟与成本。

只优化第二类指标，会把语义退化包装成节省。

## L3 · 架构与 Agent 对照 {#comparison}

Atlas 把“支持大上下文窗口”“会自动 compaction”“预算可配置”视为不同 Claim。产品页面或相似界面不足以推断 Harness 如何在内部配置上下文。

当前 `context-budget` 还没有任何 Agent 实现通过本项目的 `Snapshot + Claim` 门槛，因此下方五 Agent 矩阵会明确显示证据缺口。这表示**尚未按要求研究**，绝不等于“该 Agent 没有预算”。

### 源码地图应该回答什么

对每个固定版本的 Agent snapshot，研究至少要分别定位：

1. 请求构造与 role 顺序；
2. tokenizer 或估算器的选择；
3. tool schema 和附件如何计数；
4. 输出空间如何预留；
5. truncation/compaction 的触发点；
6. 哪些 Trace 事件能解释决定；
7. 受保护上下文无法装入时如何失败。

未来 Claim 应只描述一个小而明确的架构事实，并链接稳定源码定位、官方文档或经审核复现。“智能上下文管理”这样的宽泛标签不是证据。

### 与邻接机制的关系

`agent-loop` 决定何时再调用一次模型；context budget 决定这一轮模型看到什么；`tool-output-truncation` 约束单个结果；`context-compaction` 在普通准入已不够时改变历史形态；`memory-retrieval` 添加按需外部记录。把节点拆开，才能进行有意义的跨 Agent 比较。

## L4 · 研究与测量 {#research}

有效的预算实验必须固定模型、tokenizer 假设、tool schema、prompt、fixture 与输出预留，并且每次只改变一个压力源。实验应发布准确请求投影，或发布经过隐私处理但足以审计的 manifest。

### 建议的 Controlled 场景

构造一个 fixture：一条持久约束、若干普通消息、一个大型工具结果，以及一个必须同时使用该约束和工具结果末尾事实才能回答的问题。按固定步长逐渐增加压力。

测量：

- 受保护约束是否仍存在；
- 必要事实能否通过 preview 或 artifact retrieval 获得；
- 纳入和排除的 record ID；
- 固定 counter 下的请求大小；
- 实际可用的输出预留；
- 确定性 projection fingerprint；
- 无法构造合法投影时的停止或恢复行为。

不要只评分最终答案。模型可能偶然答对，从而掩盖错误投影；另一个模型也可能在同样的信息损失上失败。

### 练习与验收 {#exercise}

从课程开始，每次只改一个变量：

```bash
python3 -m curriculum.lessons.s06_context_budget.demo
python3 -m curriculum.golden verify s06-context-budget
python3 -m unittest curriculum.tests.test_course_contract
```

1. 调低 `max_tool_output_chars`，运行前先预测 Trace 变化；
2. 把完整合成输出保存到 artifact handle 后面；
3. 添加断言，禁止受保护 instruction 被静默省略；
4. 在 `context.assemble` 记录预算策略版本；
5. 解释为什么字符计数始终只是 Controlled 教学限制。

当你能清楚区分持久记录、模型可见投影、供应商容量上限及连接它们的证据时，才算真正理解本机制。

### 研究检查点

> 在比较 Agent 之前，先固定 snapshot，并追问现有证据究竟支持哪一个预算决定。

Registry 中的正式实验槽位仍为空。在场景完成注册并由人工审核 Trace 之前，可运行课程只证明 **reference harness**。
