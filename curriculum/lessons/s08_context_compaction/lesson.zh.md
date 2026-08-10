# s08 · Context Compaction 与 Checkpoint

> Compaction 是有损编译步骤：Harness 用更小的 checkpoint 替换过长的模型可见历史，同时保留 source events、provenance 和足够继续任务的状态。

## 学完这一章，你会得到什么 {#learn}

s06 用确定性 truncation 与 pruning 给 context 加上硬边界，但这些策略不理解文字语义。s07 又建立了 append-only journal，使事实 run 不会因为模型可见 projection 改变而消失。本章把两者组合起来：当历史超过 trigger 时，可注入 summarizer 把旧 messages 编译成 semantic checkpoint，记录它总结的精确来源，然后在同一 loop 中继续。

完成后你应该能够：

- 区分 pruning、truncation、semantic compaction、replay checkpoint 与 durable memory；
- 把 compaction 放在下一次 model request 之前，而不是等 overflow 后补救；
- 注入 summarizer，又不让核心 loop 绑定 provider；
- 记录 source size、output size、dropped-message count 与 source SHA-256；
- 解释 summary 为什么是可能出错的 projection，而不是 authoritative history；
- 为 constraint retention、unfinished work、file identity 与 repeated-compaction drift 设计评测。

### 先修知识

你需要理解 s06 的 `ContextBudget`，以及 s07 中 immutable factual log 与 rebuildable projection 的区别。Demo 仍然离线：`summarize_history` 是确定性函数，不是模型调用。生产系统可以使用 model summarizer、structured reducer 或混合方案。

---

## 问题：可预测删除仍然不够 {#problem}

Recent-first pruning 能把 request 压进硬上限，却不知道 goal、constraint、unfinished work、test result 或 artifact identity。设想一段长 coding session：

```text
user goal
project instructions
design decision
tool call: 读取 2,000 行 log
tool result
file edit
focused test passes
new user correction
```

纯位置策略可能保留最后的 correction，却丢掉 edit 的原因或哪项 test 已通过。保留所有文字不可能，盲目删除便宜但语义脆弱。Compaction 会有意识地为旧区间创建更小表示。

| 操作 | 输入 | 输出 | 是否理解语义 | Source 是否另行保留 |
| --- | --- | --- | --- | --- |
| Tool truncation | 单个 oversized result | preview 与 omission metadata | 否 | 应通过 artifact handle 保留 |
| Message pruning | message sequence | 选中的 messages | 否 | 是，位于 journal |
| Context compaction | 较旧 history span | summary/checkpoint | 是 | 审计与恢复必须保留 |
| Replay checkpoint | event prefix + reducer | cached derived state | 确定性 | 是 |
| Durable memory | 经过选择的 fact | 跨 turn/session record | 是，主动策展 | 必须保存 source attribution |

Compaction 的失败比 overflow 隐蔽。它可能漏掉否定约束、混淆两个文件名、把 hypothesis 变成 fact、丢掉 unresolved question，或反复总结早期错误。因此 Harness 必须让 compaction 可见、可评测。

> Prompt 变短不是 context manager 变好的证据。真正的问题是后续工作是否仍正确、连续并可追踪。

---

## 心智模型：Compiler、Source Map 与 Checkpoint {#mental-model}

把 compaction 看成把 source 编译为更小 intermediate representation：

```text
append-only SessionJournal（事实）
             │
             ├── 选择 source message range
             │
             ├── summarize / structure / validate
             │          └── source_sha256 + policy version
             ▼
model-visible checkpoint + optional recent tail
             │
             └── next model.request
```

Journal 类似 source code，checkpoint 是 artifact。Compiler output 可以再生成、版本化、测试和拒绝，但不应该删除输入。

### 四份合同

1. **Trigger contract**：何时触发——token threshold、turn boundary、tool result、latency budget 还是显式请求？
2. **Selection contract**：哪些 message 进入旧 span，哪些 verbatim 保留，哪些 protocol group 必须 atomic？
3. **Summary contract**：哪些字段必须存活——goal、constraints、completed、open tasks、artifacts、tests 与 unknowns？
4. **Provenance contract**：哪个 source range、algorithm/model、configuration、hash 与时间产生 checkpoint？

教学代码实现 character trigger、injected callable、recent-message count 和 source fingerprint；模型质量与 token accounting 刻意留在 core 外面。

---

## 逐步构建 Semantic Compaction {#build}

### 第 1 步：定义结构化 Report

`CompactionReport` 同时返回下一轮 messages 与审计 metadata：

```python
@dataclass(frozen=True)
class CompactionReport:
    messages: tuple[Message, ...]
    summary: str
    dropped_count: int
    original_chars: int
    final_chars: int
    source_sha256: str
```

字段叫 `dropped_count` 是有意为之：messages 离开了 model-visible projection，即使 source events 仍然 durable。明确写出 loss，可以避免“summary”听起来像无损转换。

### 第 2 步：注入 Summarizer

Policy 接收 `summarize: Callable[[Sequence[Message]], str]`：

```python
ContextCompactor(
    trigger_chars=260,
    keep_recent_messages=0,
    summarize=summarize_history,
)
```

Core loop 不需要知道 callable 使用 deterministic rules、local model、remote provider 还是人工 checkpoint。Provider credentials、retry 与成本留在 adapter boundary。

### 第 3 步：在 Request 前触发

每个 turn 开始、`model.request` 之前，runner 检查 visible size：

```python
if self.compactor is not None and self.compactor.should_compact(messages):
    report = self.compactor.compact(messages)
    messages = list(report.messages)
    self._emit("context.compact", ...)
```

等 provider 拒绝 oversized request 后才运行属于 recovery，不是 prevention。生产 trigger 还要预留 output tokens、tool descriptors、system sections 与 safety margin。

### 第 4 步：固定 System Message 并选择旧 Span

本章保留第一条 system message，把其余内容分成 `dropped` 与 `recent`：

```python
system = tuple(messages[:1]) if messages[:1] and messages[0].role == "system" else ()
remaining = tuple(messages[len(system):])
keep_count = min(max(0, keep_recent_messages), len(remaining))
dropped = remaining if keep_count == 0 else remaining[:-keep_count]
recent = () if keep_count == 0 else remaining[-keep_count:]
```

按 message count 划分只是教学简化。生产实现应把 user turn、assistant tool call、tool result、approval 与 file patch 组成 atomic group。把 tool request 和 result 分开可能产生 provider 无法接受的 history。

### 第 5 步：拒绝空 Summary

空 checkpoint 不能静默取代旧状态：

```python
summary = self.summarize(dropped).strip()
if not summary:
    raise ValueError("compaction summary must be non-empty")
```

更强实现会验证 typed manifest。例如 `goal`、`constraints`、`completed`、`open_tasks`、`artifacts`、`tests`、`unknowns` 与 `source_event_range` 可以分别拥有 required schema。

### 第 6 步：给被压缩 Source 计算 Fingerprint

Source messages 使用 provider-neutral wire representation 序列化并哈希：

```python
source_wire = json.dumps(
    [message.to_wire() for message in dropped],
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
)
source_sha256 = hashlib.sha256(source_wire.encode("utf-8")).hexdigest()
```

Fingerprint 让 reviewer 核对哪一组 bytes 被总结。它不度量 summary quality；durable implementation 还应该绑定 source event IDs。

### 第 7 步：创建显式 Checkpoint Message

Compacted projection 带有可见 marker：

```python
Message(
    role="assistant",
    content=f"[compacted checkpoint]\n{summary}",
)
```

Marker 告诉 adapter、UI 与 eval：这段文字是 synthesized state，不是 verbatim model response。生产 provider 可以使用专用内部 message type，再编译为合法 wire role。

### 第 8 步：记录 Decision，不记录隐藏推理

事件包含 count 与 provenance，而不是 summarizer 的隐藏思考：

```text
context.compact
  dropped_messages
  original_chars / final_chars
  summary_chars
  source_sha256
```

Summary 正文是否适合记录，取决于内容与 retention policy。教学 Trace 只放 metadata，下一次 model request 则消费 checkpoint。

---

## 运行 Compaction Path {#run}

执行：

```bash
python3 -m curriculum.lessons.s08_context_compaction.demo
```

第一轮调用 `inspect_artifact`，返回刻意冗长的 preview。第二次 request 前，visible history 超过 260 characters，runner 把三条 non-system message 压成一个 checkpoint。

边界附近的事件顺序应当是：

```text
tool.request
tool.result
context.compact       original_chars=720, final_chars=232
model.request         roles=[system, assistant]
model.response
session.stop
```

验证提交产物：

```bash
python3 -m curriculum.golden verify s08-context-compaction
```

### 检查模型实际收到什么

内部 model double 保存每个 request：

```python
runner, _ = build_demo()
runner.run("Inspect and compact.")

for message in runner.model.requests[1]:
    print(message.role, message.content)
```

第二个 request 有原 system prompt，以及提到 `artifact://large-report` 和已验证测试结论的 assistant checkpoint；它不再包含重复 32 次的 preview fragment。

### 对比 Journal 与 Projection

Trace 仍有原始 `tool.result`，model request 使用 checkpoint。这就是从 s07 继承的核心不变量：compaction 改变 visibility，不改变历史事实。

---

## 失败模式与安全边界 {#failure-modes}

| 失败 | 可观察表现 | 更好的合同 |
| --- | --- | --- |
| 约束被遗漏 | Agent 后续违反 requirement | Required constraint field 与 retention eval |
| Hypothesis 被升级为 fact | Summary 声称未验证结论 | 保存 epistemic status 与 evidence/source IDs |
| Tool pair 被拆分 | Provider 拒绝 history 或 call identity 丢失 | Compact atomic protocol groups |
| File identity 合并 | Edit 应用到错误 path | 带 stable handle 的 structured artifact record |
| Summary 仍超过 trigger | 立刻 overflow 或再次 compaction | 验证 final budget 并为 tail 预留空间 |
| Recursive drift | 每轮放大早期错误 | 针对 raw source 增量压缩，并评测多周期 |
| Summarizer 失败 | Loop 丢状态或模糊崩溃 | 保持旧 projection，记录 error，按 policy retry/fallback |
| Secret 被复制到 summary | 绕过 redaction boundary | Source/output 双向脱敏、分级存储、canary test |
| Fingerprint 被当质量分 | 坏 summary 看似“verified” | Hash 只证明 source identity；质量依赖 task eval |

> 不要只因为 token count 下降就宣布 compaction 成功。Checkpoint 必须支持下一步任务，并保留声明的不变量。

---

## 动手练习与验收条件 {#exercises}

### A. 观察 Trigger

把 `trigger_chars` 设到 1,000 以上。验收：没有 `context.compact`，第二次 model request 仍包含原 tool result。

### B. 保留近期 Correction

设 `keep_recent_messages=1`，并在 compaction 前增加最后一条 user correction。验收：checkpoint 总结旧消息，correction 在它之后 verbatim 保留。

### C. Empty-summary Failure

注入 `lambda messages: ""`。验收：compaction 在替换当前 messages 前抛出明确错误。

### D. Structured Checkpoint

返回包含 goal、constraints、completed work、open tasks、artifacts、tests 与 unknowns 的 JSON。验收：缺少 `constraints` 或 `source_range` 时 schema validation 失败。

### E. Atomic Tool Groups

选择前先把 assistant tool call 与对应 tool result 分组。验收：保留 history 中不会出现只有一边的 pair。

### F. Repeated-compaction Evaluation

用已知 constraint 与 file ID 做五轮增量 compaction。验收：逐轮报告精确保留率、invented facts 与 identity error，而不是只给最终 compression ratio。

运行聚焦检查：

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s08_compacts_with_provenance -v
```

---

## 深入：如何评测生产级 Compaction {#deep-dive}

### Token-aware Budgeting

Characters 让课程确定性，但生产 policy 必须考虑 provider tokenizer、system sections、tool schemas、multimodal inputs、cached prefixes 与 reserved output。安全 trigger 要早于名义 limit，而且可随 model 不同。

### Typed State 与 Prose Summary

Prose 灵活但难验证；typed state 能检测 missing constraint 与 invalid file ID。很多 Harness 会组合两者：structured fields 保存不变量，简短 narrative 提供上下文。Reducer 可以重新生成 display prose，而不丢 machine-readable status。

### Summary Model Isolation

如果用模型做 compaction，要决定它能访问哪些 tools、memory 与 instructions。Summarizer 不应执行副作用，并需要独立 timeout、retry、cost accounting 与 prompt-injection defense，因为待总结 history 可能包含不可信 tool output。

### Cache Consequences

替换长 prefix 可能使 provider prompt cache 失效。有些设计只在低频边界 compact，保持 stable system/tool-schema prefix，或使用 remote provider compaction。Cache efficiency 是性能问题，不能静默削弱 semantic retention。

### Evaluation Dimensions

一个有意义的 suite 至少包含：

- **constraint retention**：required 与 forbidden actions 仍明确；
- **task continuity**：下游任务完成率不下降；
- **artifact identity**：path、hash、tool-call ID 与 branch 正确；
- **epistemic fidelity**：fact、hypothesis、failure 与 unknown 不混淆；
- **unfinished-work recall**：open task 存活；
- **invention rate**：没有 unsupported fact；
- **multi-cycle drift**：错误不随多次 compaction 累积；
- **cost and latency**：节省值得额外 summarization 工作。

### 直接 Real-agent Mapping

链接的 Codex、Pi 与 Reasonix Claim 直接描述固定源码版本的 compaction。它们的 trigger、recent-tail rule、cache behavior 与 local/remote choice 不同。课程提供中立比较词汇，而不是声称实现等价。

### Compaction 与 Memory

Compaction 保存足以继续 Session 的状态；durable memory 选择未来可能有用、甚至跨 Session 的事实。把每个 summary 自动写入 memory，会混合两个不同 trust 与 retention decision。s09 会把 retrieval 与 skill loading 从 compaction path 分离。

---

## 本章检查点 {#checkpoint}

继续之前，请回答：

1. 为什么 factual journal 必须在 compaction 后仍保留？
2. `source_sha256` 能证明什么，又不能证明什么？
3. 为什么 tool request/result 应按 atomic group 处理？
4. Compaction 相对 `model.request` 应位于哪里？
5. 生产 checkpoint 中你会要求哪些字段？
6. 如何度量 repeated-compaction drift？

s09 会把选定信息与完整能力说明移出常驻 prompt。Harness 不再反复总结所有内容，而是在当前任务需要时才取回带来源的 memory 或加载 skill。
