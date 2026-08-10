# s09 · Memory 与按需 Skills

> Context 应该放下一轮真正需要的内容，而不是 Harness 曾经学到的每条事实和每种能力。Durable memory 与完整 skill instructions 留在常驻 prompt 外，只有显式检索或加载后才进入。

## 学完这一章，你会得到什么 {#learn}

s08 把较旧 Session history 压成 checkpoint，但 compaction 的来源仍是同一 Session 已经出现的信息。Coding agent 还需要跨 turn 存活的项目事实，以及不适合每次 request 都携带的大段能力说明。本章增加两个刻意分离的 store：

- `MemoryStore` 保存带稳定 identity、scope 与 source attribution 的精选事实。
- `SkillCatalog` 让轻量 descriptor 常驻，只在选中 skill 后加载完整 instructions。

两者都通过 structured tool 和可见的 `memory.read` / `skill.load` event 进入 loop。Harness 实际取回的数据不会被描述成模型自己“记起来了”。

完成后你应该能够：

- 区分 message history、compacted checkpoint、durable memory、artifact、instruction 与 skill；
- 定义带 provenance 的 memory record 与确定性 retrieval contract；
- 解释为什么 memory write 比 read 需要更严格审核；
- 保持 skill descriptor 精简，并按需加载完整 instructions 与 tool requirement；
- 在不暴露隐藏推理的前提下追踪 retrieval/loading；
- 识别 stale memory、poisoning、prompt injection、capability escalation 与 privacy 风险。

### 先修知识

你需要理解 s03、s05、s06 与 s08 的 context budget、compaction、tool dispatch 和 instruction precedence。这里的 retrieval algorithm 刻意采用 lexical deterministic 方式，教学重点是系统边界，不是最先进 semantic search。

---

## 问题：“全部放进 Prompt”无法扩展 {#problem}

成熟 Agent 可能知道 repository conventions、过往 architecture decision、test command、用户偏好、几十个 skills、数百个 MCP tools 与大量 artifacts。把全部内容注入每次 model request 会产生四类失败：

1. **Budget pressure**：静态能力文字与当前任务竞争窗口。
2. **Attention dilution**：无关 instruction 让真正相关规则更难遵守。
3. **Staleness**：项目变化后，旧 fact 仍静默生效。
4. **Authority confusion**：retrieved data、project policy、tool output 与 model text 看起来同样可信。

相反极端是完全不保留信息，导致重复 discovery，并丢失 durable decision。Harness 需要 selective persistence 与 explicit retrieval。

| 数据类别 | 常见生命周期 | Authority | 如何进入 Context |
| --- | --- | --- | --- |
| Recent messages | 当前 Session | User/model/tool event | Loop state |
| Compacted checkpoint | 当前 Session/branch | Derived from journal | Context policy |
| Project instructions | Directory/version scope | Repository policy | Instruction discovery |
| Artifact | Task 或 durable storage | Tool/environment result | Handle + explicit read |
| Memory record | Turn/session/project/user scope | 带 source 的 curated fact | Retrieval result |
| Skill descriptor | Installation scope | Extension metadata | 小型常驻 catalog |
| Skill instructions | Loaded task scope | Reviewed extension content | Explicit load |

> Memory 不是更大的 system prompt，而是一座需要 selection、provenance、invalidation、trust 与 observability 的数据库。

---

## 心智模型：External Store 与 Context Compiler {#mental-model}

模型每轮看到的是有限 projection：

```text
current user task
      │
      ├── memory_search(query) ──> source-attributed facts
      │                                  │
      ├── skill descriptors ── select ── load_skill(id)
      │                                  │
      └──────────── context compiler ◄───┘
                         │
                         ▼
                  next model.request
```

Memory 与 skill 都是“按需加载”，但语义不同：

- **Memory** 声明关于 project、user 或过去工作的事实，需要 freshness 与 evidence。
- **Skill** 贡献 procedure instructions、tools 或 workflow，需要 installation trust 与 capability review。
- **Artifact** 通常是通过 handle 寻址的大型 immutable/versioned result。
- **Instruction** 有 policy precedence，可能约束某个目录下的所有工作。

把它们混成一袋 text，会让 authority 无法分析。

### Retrieval Contract

有用的 retrieval response 应回答：

1. 使用了什么 query 与 scope？
2. 哪些 record IDs 命中，稳定顺序是什么？
3. 每条 record 的 source 是什么？
4. 何时写入或最后验证？
5. Result 是否 truncated、filtered 或 denied？

课程实现前三项。生产版本还要加入 timestamp、version range、confidence、contradiction state 与 access policy。

---

## 逐步构建 Memory 与 Lazy Skills {#build}

### 第 1 步：给每条 Memory Identity 与 Source

最小 record 很明确：

```python
@dataclass(frozen=True)
class MemoryRecord:
    id: str
    content: str
    scope: str
    source: str
```

只有 `content` 会产生歧义。`scope="workspace"` 说明 fact 在哪里生效；`source="AGENTS.md#testing"` 让用户或 validator 找到支持该 policy 的位置。

### 第 2 步：让 Write 成为审慎动作

`remember()` 拒绝 duplicate ID 与空 content/source：

```python
def remember(self, record):
    if record.id in self._records:
        raise ValueError(f"memory already exists: {record.id}")
    if not record.content.strip() or not record.source.strip():
        raise ValueError("memory content and source must be non-empty")
    self._records[record.id] = record
```

Demo 预加载一条已审核 record，不允许 model 写 memory。生产 write path 应要求 schema、scope、source evidence、secret scan、contradiction check，并经常需要 user 或 policy approval。

### 第 3 步：先用确定性 Retrieval，再谈 Semantic Ranking

教学 search 把 query term 转小写，计算 term matches，然后按 score 降序、stable ID 升序排列：

```python
terms = {term for term in query.lower().split() if term}
score = sum(term in haystack for term in terms)
ranked.sort(key=lambda item: (-item[0], item[1]))
```

它不复杂，却可重复、易测试。Vector search 会引入 embedding version、distance threshold、index freshness 与 nondeterministic tie，需要独立 experiment contract。

### 第 4 步：把 Retrieval 暴露为 Bounded Tool

模型通过 structured query 请求 `memory_search`，handler 只返回 matching records：

```python
{
  "matches": [
    {
      "id": "project-test-policy",
      "content": "Run the focused test before the full suite.",
      "source": "AGENTS.md#testing"
    }
  ]
}
```

Tool result 按 s03 同一 roundtrip contract 进入 message history。Retrieval 不会绕过 tool validation 或 context budget。

### 第 5 步：记录 `memory.read`

Handler 在 `tool.request` 和 `tool.result` 中间发出观察事件：

```python
trace.emit(
    "memory.read",
    actor_kind="harness",
    actor_id="workspace-memory",
    payload={
        "query": query,
        "match_ids": [...],
        "sources": [...],
    },
)
```

Event 记录 selection 与 provenance，不记录模型隐藏推理。敏感 memory content 可以从公开 Trace 删除，同时保留 ID 与 redaction status。

### 第 6 步：让 Skill Descriptor 常驻

`SkillCatalog.descriptors()` 只返回 identity 和短 description：

```python
{"id": "test-first", "description": "Choose focused checks before broad regression tests."}
```

假如 50 个 skills 各有一千 tokens instructions，descriptor 允许 Harness 或模型先选择一个，而不是耗尽 context。Descriptor quality 本身就是 retrieval problem：既要足够具体，又不能把整个 skill 全塞进去。

### 第 7 步：显式加载完整 Instructions

选中后，`load_skill` 返回 instructions 与 tool requirements：

```python
{
  "id": "test-first",
  "instructions": "Run the smallest relevant test, inspect failure, then widen coverage.",
  "tool_names": ["run_command"]
}
```

加载 instructions 不会自动授予声明的 tools。s10 与 s11 会把 approval/sandbox policy 和 capability description 分离。

### 第 8 步：记录 `skill.load`

Trace event 包含 stable skill ID 和 declared tool names。生产 event 还可以加入 package version、content digest、signer/trust source、load reason 与 instruction size。

### 第 9 步：继续使用普通 Loop

第一轮 scripted model 同时请求两个 tools。Runner 按顺序执行，追加两条 tool message，然后进入第二次 model request。不需要 memory-specific control loop；memory 与 skills 只是现有 tool/event protocol 的扩展。

---

## 运行 Retrieval Path {#run}

执行：

```bash
python3 -m curriculum.lessons.s09_memory_skills.demo
```

核心事件序列是：

```text
tool.request memory_search
memory.read
tool.result memory_search
tool.request load_skill
skill.load
tool.result load_skill
model.request
```

验证全部 13 条提交事件：

```bash
python3 -m curriculum.golden verify s09-memory-skills
```

### 检查 Evidence Path

`memory.read` 指出 `project-test-policy` 与 `AGENTS.md#testing`，紧随其后的 tool result 包含 content。UI 可以链接 source；公开 Trace 也可以 redacted content 而保留 record identity。

### 检查 Capability Path

`skill.load` 指出 `test-first` 与 `run_command`。这个 declaration 只是信息；Demo 没注册 `run_command`，因此 skill 不能静默执行。Capability grant 仍是独立 Harness decision。

### 检查第二次 Request

`runner.model.requests[1]` 有四条 messages：user、assistant、memory tool result 与 skill tool result。Retrieval boundary 清楚地出现在普通 model history 中。

---

## 失败模式与 Trust Boundary {#failure-modes}

| 失败 | 后果 | 更安全设计 |
| --- | --- | --- |
| Stale memory | Agent 遵循过时 command 或 architecture | Version scope、validation date、invalidation 与 contradiction state |
| Memory poisoning | 不可信 tool output 变成 durable authority | Restricted write path、source allowlist、review 与 provenance |
| Secret retention | Credential 跨 Session 存活 | Classification、secret scan、encryption、retention 与 deletion |
| Over-broad scope | 一个项目规则影响另一个 | 显式 workspace/user/session namespace |
| Retrieval flood | 无关 records 占满 context | Limit、threshold、diversity、size budget 与 no-match result |
| Descriptor ambiguity | 加载错误 skill | 具体 description、examples、conflict tests 与 explicit selection |
| Skill prompt injection | Loaded instructions 覆盖更高 policy | Trust tier、instruction delimiter 与 precedence compiler |
| Capability escalation | Skill 声明危险 tool 并获得权限 | Tool grant 继续受 policy 控制；声明不等于授权 |
| Package drift | 同一 skill ID 指向新 content | Version pin 与 content digest 写入 load event |
| Silent no-match fallback | 模型编造“记得”的事实 | 显式 empty result 与 visible uncertainty |

> Retrieved text 是带 provenance 的 data，不自动成为 trusted instruction。Authority 取决于 type、scope、source 与 policy。

---

## 动手练习与验收条件 {#exercises}

### A. No-match Behavior

搜索 `deployment region`。验收：返回 empty tuple，并发出 match IDs 为空的 `memory.read`；模型不会收到 invented default。

### B. Stable Ranking

增加两条相同 score record。验收：按 stable ID 排序，重复运行得到相同 Golden Trace。

### C. Contradictory Memory

增加一条更新、但与 `project-test-policy` 冲突的 record。设计 `supersedes`、`valid_from` 与 `status`。验收：retrieval 不会把两者作为同等 current fact 返回。

### D. Memory Write Gate

增加不能直接 commit 的 `memory_write` proposal。验收：缺 source、secret-like content 或 workspace mismatch 都被拒绝；批准后只发出带 redacted metadata 的 `memory.write`。

### E. Skill Digest

对 canonical skill content 计算 SHA-256，加入 `skill.load`。验收：修改 instructions 却不更新 digest 时 validation 失败。

### F. Capability Separation

加载声明 `run_command` 的 skill，但 Tool Registry 不注册它。验收：skill text 可见，请求缺失 tool 时得到 unknown-tool error，而不是自动获得能力。

运行聚焦合同：

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s09_retrieves_memory_and_loads_skill -v
```

---

## 深入：生产级 Retrieval Architecture {#deep-dive}

### Memory Lifecycle

Durable record 需要 creation、validation、retrieval、update、contradiction、expiration 与 deletion state。Append-only history 可以记录变化，current projection 选择 active version。对安全关键 constraint，last-write-wins 通常不够。

### Scope 与 Identity

有用 scope 包括 turn、branch、session、workspace、repository revision、user 与 organization。Memory 应绑定 stable project identity，而不只是本地 absolute path。Forked repository 与 renamed workspace 需要明确 lineage rule。

### Retrieval Evaluation

评测 necessary fact recall、returned fact precision、stale-record rate、contradiction handling、context cost、latency 与 downstream task success。Semantic similarity 高并不够，如果 fact 对应错误版本或 authority，结果仍然危险。

### Prompt Injection 与 Data/Instruction 分离

Tool output 或文档可能包含命令式文本。Memory reducer 不应把“ignore previous instructions”自动变成 durable policy。保存 data 时要带 type/source，通过另一套 precedence system 编译 trusted instruction，并用清晰 delimiter 暴露 untrusted text。

### Skill Supply Chain

Skills 是 executable-adjacent content。生产 catalog 需要 package origin、version、digest/signature、allowed tools、network expectations、lifecycle hooks 与 update policy。即使不执行代码，加载 skill 也会改变 Agent behavior，所以 review 与 provenance 重要。

### Lazy Tools 与 Schema Stability

一些系统保持 placeholder descriptor 稳定，只在选中时启动 MCP server 或 reconcile live schema。这改善 startup 与 cache，却会把 load failure 推迟到任务中间。Events 应区分 selection、process startup、schema reconciliation 与 final availability。

### Real-agent Evidence Boundary

链接 Claim 覆盖 Codex skills/plugins、Pi extensions、Reasonix lazy plugin/MCP 行为与 Claude Code hooks，支持 adjacent extension-runtime comparison。它们并没有建立跨产品统一 durable-memory implementation。

### 从 Context 走向 Safety

Memory 与 skill 会影响动作，但不能拥有 authorization。Remembered preference 不能覆盖 fresh denial，要求 shell access 的 skill 也不能给自己授权。s10 将进入 Safety track，在 model request 与真实 effect 之间插入显式 approval policy。

---

## 本章检查点 {#checkpoint}

进入 Safety 前，请回答：

1. Durable memory 与 compacted checkpoint 有何区别？
2. 为什么每条 memory record 都必须有 scope 与 source？
3. 为什么 memory write 比 read 风险更高？
4. Skill descriptor 应保留什么，什么应延迟加载？
5. 为什么 skill 的 tool declaration 不等于 authorization？
6. 哪些 events 让 retrieval 与 loading 可审计？

至此 Context track 完整连接起来：确定性 instructions、hard budgets、replayable facts、semantic compaction 与 on-demand retrieval。下一章会在任何副作用发生前，明确判断请求动作是否被允许。
