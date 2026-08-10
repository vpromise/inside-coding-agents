# 记忆检索

Agent 不可能在每一次模型请求里都携带所有有用的项目事实。记忆检索把经过选择、带来源的记录存到即时上下文之外，再只取回与当前 turn 相关的候选。真正困难的不是“存下来”，而是判断什么值得记、什么仍然正确，以及取回的文本可以如何影响动作。

`s09-memory-skills` 给出可运行基线，并刻意区分 memory 与 skill：memory 提供项目事实，skill 提供过程指令及声明的工具集合。

## L0 · 定义与边界 {#definition}

记忆检索是一条包含四类决定的流水线：写入、索引、选择、注入。一个名为 `memory.md` 的文件只解决持久化，并没有自动定义这些政策。

> Memory 不是“更多上下文”，而是一个带 provenance 的来源；Harness 可以从中构造上下文。

```text
观测事件 ──► 写入政策 ──► 有 scope 的 memory record
                                  │
当前意图 ──► query/retriever ─────┤
                                  ▼
                              排序候选
                                  │
                              准入政策
                                  ▼
                            模型可见上下文
```

| 层 | 核心问题 | 应保留的证据 |
| --- | --- | --- |
| 写入 | 什么值得持久化？ | 作者、来源、scope、理由 |
| 索引 | 之后如何找到？ | index 版本与可搜索字段 |
| 选择 | 为什么匹配？ | query、score/filter、候选 ID |
| 注入 | 可在何处影响 turn？ | trust label、slot、准入 ID |
| 失效 | 什么让它过期或错误？ | superseding record 或 tombstone |

### Memory 不等于 session history

Session event log 回答“发生过什么”；memory 是为了未来复用而整理的投影。两者分开，可以防止检索优化改写审计历史，也能防止每句偶然陈述都成为持久项目事实。

### Memory 不等于 skill

“完整套件前先跑 focused test”这样的 memory，记录的是带来源的 workspace policy；`test-first` 这样的 skill，包含可复用流程与 capability 声明。两者都能按需加载，但其 authority、lifecycle 与审核规则不同。

> 检索相关性永远不能把不可信记录升级为能够授权副作用的指令。

## L1 · 可运行参考 {#reference}

运行确定性课程与 Golden Trace 检查：

```bash
python3 -m curriculum.lessons.s09_memory_skills.demo
python3 -m curriculum.golden verify s09-memory-skills
```

Demo 创建一个带来源的 `MemoryRecord` 和一个 `SkillDefinition`，二者都没有塞进初始 prompt。Scripted Model 必须显式调用 `memory_search` 与 `load_skill`。

```python
memory.remember(
    MemoryRecord(
        id="project-test-policy",
        content="Run the focused test before the full suite.",
        scope="workspace",
        source="AGENTS.md#testing",
    )
)
```

Skill descriptor 单独注册：

```python
skills.register(
    SkillDefinition(
        id="test-first",
        description="Choose focused checks before broad regression tests.",
        instructions="Run the smallest relevant test, inspect failure, then widen coverage.",
        tool_names=("run_command",),
    )
)
```

这个形态展示 progressive disclosure：最初只暴露小型 descriptor 与显式工具；完整记录在选中后才进入上下文。

### 检索必须发出 provenance

`memory_search` 发出 `memory.read`，包含 query、匹配 record ID 与 source locator；`load_skill` 发出 `skill.load`，包含 skill ID 与声明工具。工具结果也把 source 与 memory content 一起返回。

```python
trace.emit(
    "memory.read",
    payload={
        "query": query,
        "match_ids": [record.id for record in matches],
        "sources": [record.source for record in matches],
    },
)
```

Source 不是装饰。它让读者核验记录，让 Harness 检测 policy 变化，也防止取回句子变成无上下文的“事实”。

### Golden Trace 证明什么

它证明显式检索发生在第二次模型 turn 之前；record 和 skill loading 是不同事件；source metadata 穿过规范化；最终脚本响应使用了测试规则。它不证明语义排序质量，也不证明跨进程持久存储。

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s09-memory-skills
```

## L2 · 工程化 memory {#engineering}

生产 memory 需要生命周期，而不只是 CRUD。Record 应从经审核 observation 创建，绑定 identity scope，在声明的策略下取回，并在来源变化后失效。

### 使用类型化 record envelope

```python
MemoryRecord(
    id=stable_id,
    content=normalized_fact,
    scope="workspace",
    source="AGENTS.md#testing",
    source_revision=commit_or_hash,
    created_at=timestamp,
    trust="project-policy",
    expires_at=None,
    supersedes=older_id,
)
```

Content 与 metadata 要分离。Search 可使用 content 和 tag；授权与 freshness 决定则依赖 scope、trust、source revision 与 invalidation state。

### 先定义写入政策

自动“记住一切”会存入 secret、瞬时失败、模型猜测与已矛盾事实。应 allowlist record kind，在持久化前脱敏，并让耐久 preference 或 policy 的写入对用户可见。模型提出“记住它”只产生候选，必须由政策接纳。

### 检索是两阶段决定

Candidate generation 可以用 exact match、lexical search、embedding、graph link 或 hybrid ranking；admission 再应用 scope、trust、freshness、privacy 与 budget。拆成两阶段后，才能判断相关记录是根本没找到，还是找到后被有意拒绝。

```text
candidate recall 指标  ≠  context admission 指标
```

### 失效与矛盾

来源绑定的 record 在 source revision 改变后应变 stale。新记录可以 supersede 旧记录，而不必抹掉历史。互相矛盾的记录不能静默求平均；应暴露冲突，根据 policy 选择权威且当前的 scope，并在 decision trace 中保存双方 ID。

### 失败模式 {#failure-modes}

| 失败 | 结果 | 控制手段 |
| --- | --- | --- |
| Memory 没有来源 | 无法验证的“事实” | durable record 强制 provenance |
| Workspace scope 错误 | 跨项目泄漏 | 绑定 canonical workspace identity |
| 取回旧 policy | 使用过期命令/约定 | revision check 与 invalidation |
| 相似但不相关的 hit | 污染上下文 | 分开 candidate/admission trace |
| 保存模型猜测 | 错误事实持久化 | reviewed write policy |
| Secret 被持久化 | 长期泄露 | 脱敏与 record-kind allowlist |
| 取回文本变成 authority | prompt injection 持久化 | 注入后仍保留 trust label |

### 安全与可靠性 {#safety}

Memory 穿越时间，通常也穿越 session，因此 blast radius 可能比单次工具结果更大。所有 store 与 query 都应绑定 canonical user/workspace/project identity。不能把模型提供的路径字符串当作 identity 边界。

取回记录默认是 data；只有更高层 instruction compiler 识别其来源和类型后，才可能作为指令。昨天记住的外部网页，今天仍是 external content。相关性分数不能决定 permission、tool access、approval 或 trust。

删除也需要显式语义。“Forget”可能表示停止检索、写 tombstone、删除加密存储，或向远端服务发出删除请求。产品应说明实际执行哪种操作，以及 backup/trace 中还剩什么。

## L3 · 架构与 Agent 对照 {#comparison}

当前本机制没有 Agent 实现满足 Atlas 的 `Snapshot + Claim` 门槛，因此下方 Agent matrix 会有意展示五个 unknown。产品 memory 功能、instruction file、chat history 与 skill 不能在没有源码或复现实证时当成同一机制。

### 每个 snapshot 的研究维度

需要分别映射：

1. 存储位置与所有权；
2. workspace、user、organization、global scope；
3. 写入 authority 与用户可见性；
4. source attribution 与 revision pinning；
5. retrieval algorithm 与 query producer；
6. ranking 与最终 admission policy；
7. 注入后的 context slot 与 trust label；
8. invalidation、export 与 deletion；
9. telemetry 与远端数据处理。

不要从名为“memory”的命令推断实现。它可能是平面 instruction file、服务端 profile、向量检索、session summary，或完全不同的边界。

### Reference harness 证据边界

课程展示内存 store 上的精确搜索与显式 skill loading。它的价值在于每条 record 和 event 都可检查；它没有实现 embedding、持久加密、多用户隔离、跨 session 保存或任何厂商行为。这些遗漏是教学边界，不是隐藏能力。

## L4 · 研究与测量 {#research}

Memory 实验应分开衡量 write precision、candidate recall、admission precision、freshness 与下游任务影响。一个“Agent 记住了吗”分数混合了太多失败点。

### 建议的 freshness 与 isolation 场景

准备两个词汇相似但测试 policy 冲突的 workspace identity。在 A 中保存 source-pinned policy，随后更新来源使其被 supersede，并在失效前后查询。在 B 中问同一问题，验证任何 A record 都不会出现。

发布：

- 用确定性 fixture 替换敏感内容后的 record envelope；
- write、query、candidate、admission、invalidation event；
- index/retriever 版本；
- workspace identity 推导方式；
- 预期相关与禁止出现的 record ID；
- 准确的模型可见注入 block。

测量 relevant-record recall、irrelevant admission、stale admission、cross-scope leakage、provenance survival，以及 exact fixture 的确定性。若模型生成 query 或判断 memory，应多次运行并单独报告方差。

### 练习与验收 {#exercise}

```bash
python3 -m curriculum.lessons.s09_memory_skills.demo
python3 -m curriculum.golden verify s09-memory-skills
python3 -m unittest curriculum.tests.test_course_contract
```

1. 添加词语相似但 scope 不同的第二条 record；
2. 让 `MemoryStore.search` 只返回 candidate，再增加独立 scope admission；
3. 绑定 source revision，并在模拟变更后把第一条标为 stale；
4. Trace 同时保存 candidate ID 和 admitted ID；
5. 证明 skill 的 `tool_names` 声明本身不会授予 permission。

当你能解释谁写入记录、为何匹配、为何准入、进入哪次请求，以及它如何过期或消失时，才算理解该机制。

### 研究检查点

> 没有 scope、source 与 invalidation 的 memory 只是持久文本；持久错误比临时错误更难调试。

本机制还没有注册正式实验。在实验经过审核之前，练习只建立确定性 reference contract。
