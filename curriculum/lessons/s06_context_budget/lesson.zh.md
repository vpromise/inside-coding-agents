# s06 · Context Budget 与截断

> 上下文不是无限聊天记录，而是 Harness 为下一次模型调用编译的一份有预算输入。

## 学完这一章，你会得到什么 {#learn}

到 s05 为止，Harness 会不断累积 system prompt、项目指令、用户消息、assistant turn、tool results 和 tool descriptors。任何有限上下文窗口最终都会被填满。等 provider 返回 “context length exceeded” 才处理，已经太晚。

本章加入两道独立预算：工具结果进入消息前先截断；每次模型请求前再裁剪整个消息列表。为了离线、确定性教学，我们用字符数代替 tokenizer，并把每次策略动作写入 Trace。

完成本章后，你应该能够：

- 画出 system、messages、tools、输出预留共同争夺窗口的预算模型。
- 区分 tool-output truncation、history pruning 和 semantic compaction。
- 解释为什么要先限制单条工具结果，再处理全局消息预算。
- 读懂“保留 system、优先最近消息”的反向选择算法。
- 指出教学算法在 token 计数、消息配对和超大 system prompt 上的局限。

---

## 问题：上下文会在最不方便的时候耗尽 {#problem}

模型窗口通常同时容纳：

```text
system + project instructions + tool schemas
+ conversation history + tool results
+ reserved output tokens
<= provider context window
```

如果 Harness 只把消息不断 append，两个现象会先后出现：

1. 成本与延迟随历史增长。
2. 最终 request 被 provider 拒绝，Agent 在任务中途停止。

工具输出尤其危险：一次测试日志、搜索结果或依赖树就可能比此前全部对话更大。只裁旧聊天而不限制单条结果，会让一个 tool message 独占窗口。

> Context management 的目标不是“永远保留最多文本”，而是在预算内保留完成下一步所需的状态，并让信息损失可见。

---

## 心智模型：两级保险丝 {#mental-model}

本章使用两级策略：

```text
raw tool result
      │
      ├─ Level 1: max_tool_output_chars
      │       └─ bounded result + truncated metadata
      ▼
append tool message
      │
      ├─ Level 2: max_input_chars before next model call
      │       └─ keep system + recent messages
      ▼
model request
```

| 策略 | 作用对象 | 发生时机 | 是否理解语义 |
| --- | --- | --- | --- |
| Truncation | 单个 tool result | 结果进入 messages 前 | 否 |
| Pruning | 消息列表 | 每次 model request 前 | 否 |
| Compaction | 一段历史 | 超预算前或策略触发时 | 是，生成摘要/状态 |

教学实现前两种。Compaction 会生成新的语义投影，需要更强的 provenance、失败处理和评测，因此没有伪装成简单字符串截断。

### 预算决定是 Harness policy

模型可以建议“这段历史不重要”，但最终输入包含什么、删除什么、为输出预留多少，必须由 Harness 执行并记录。否则同一会话无法可靠重放。

---

## 逐步实现两级预算 {#build}

### 第 1 步：声明两个独立上限

```python
@dataclass(frozen=True)
class ContextBudget:
    max_input_chars: int = 8_000
    max_tool_output_chars: int = 2_000
```

把它们分开，才能判断到底是某个工具异常膨胀，还是长期历史自然增长。生产配置还会为 system、tool schema 和输出分别预留 token。

### 第 2 步：稳定编码工具结果

```python
encoded = json.dumps(value, ensure_ascii=False, sort_keys=True)
if len(encoded) <= self.max_tool_output_chars:
    return value, False
```

预算针对将进入消息的序列化形式，而不是 Python 对象数量。排序让同一对象在测试中得到稳定长度与 fingerprint。

### 第 3 步：超限时返回带元数据的 preview

```python
preview_size = max(0, self.max_tool_output_chars - 96)
return {
    "truncated": True,
    "original_chars": len(encoded),
    "preview": encoded[:preview_size],
}, True
```

结果不能只是无提示地切掉尾部。`truncated` 告诉模型和 UI 内容不完整，`original_chars` 说明损失规模，`preview` 保留可辨认片段。

常数 96 是教学实现为 JSON 包装预留的近似空间，不保证最终编码严格等于上限；生产代码应对最终 wire representation 再次测量。

### 第 4 步：在每次 model request 前调用 `fit`

```python
if self.budget is not None:
    report = self.budget.fit(messages)
    if report.removed_count or report.final_chars < report.original_chars:
        messages = list(report.messages)
        self._emit(
            "context.prune",
            actor_kind="harness",
            actor_id=self.config.agent_id,
            payload={
                "removed_messages": report.removed_count,
                "original_chars": report.original_chars,
                "final_chars": report.final_chars,
            },
        )
```

预算检查必须发生在 request 之前；把 prune 放在 response 之后只能保护下一轮，无法挽救当前已经超限的请求。

### 第 5 步：固定 system，反向保留最近历史

```python
system = [message for message in messages[:1] if message.role == "system"]
remaining = list(messages[len(system):])
kept_reversed = []
used = sum(len(message.content) for message in system)

for message in reversed(remaining):
    if kept_reversed and used + len(message.content) > self.max_input_chars:
        continue
    kept_reversed.append(message)
    used += len(message.content)
```

算法从最新消息向前选择，因为最近的用户意图、assistant action 和 tool result 通常最直接影响下一步。最后再 reverse 回原始时间顺序。

### 第 6 步：至少保留最新消息的尾部

```python
if not kept_reversed and used + len(message.content) > self.max_input_chars:
    room = max(0, self.max_input_chars - used)
    message = Message(
        role=message.role,
        content=message.content[-room:] if room else "",
        name=message.name,
        tool_call_id=message.tool_call_id,
    )
```

这避免预算极小时把全部动态历史删除。但保留“尾部”只是确定性教学选择：代码文件可能需要开头，错误日志可能需要首尾，tool-call/result pair 也不应被拆散。

---

## 运行超大工具结果示例 {#run}

本章注册一个故意返回大 payload 的工具：

```python
handler=lambda args: {"content": "context-data-" * 80}
```

Runner 配置为：

```python
ContextBudget(
    max_input_chars=300,
    max_tool_output_chars=180,
)
```

执行：

```bash
python3 -m curriculum.lessons.s06_context_budget.demo
```

你应该在 Trace 中先后看到：

```text
tool.result             payload.truncated = true
context.prune           original_chars > final_chars
model.request           receives the bounded projection
```

验证代码：

```python
runner, trace = build_demo()
result = runner.run("Fetch the large result, then explain the budget behavior.")

tool_result = next(e for e in result.events if e["type"] == "tool.result")
assert tool_result["payload"]["truncated"] is True

prune = next(e for e in result.events if e["type"] == "context.prune")
assert prune["payload"]["final_chars"] < \
       prune["payload"]["original_chars"]
```

### 检查模型实际看到的第二轮

```python
second_request = runner.model.requests[1]
for message in second_request:
    print(message.role, len(message.content), message.content[:60])
```

不要只看 `result.messages`：它表示运行结束时的内部列表；`model.requests[1]` 才是第二轮真正传给模型的投影。

---

## 读懂算法，也要看见它的局限 {#code-reading}

### 字符不等于 token

中文、英文、代码和 JSON 的 token/character 比例不同，不同 tokenizer 也不同。字符预算只为了离线确定性。Provider adapter 应使用实际 tokenizer 或服务端计数，并保留安全余量。

### System prompt 可能自己就超预算

教学算法始终保留第一条 system message。如果它大于 `max_input_chars`，最终输入仍会超限。生产系统必须对 prompt 各 section 单独预算，或者在启动前拒绝不可能满足的配置。

### 独立消息不一定能独立删除

Assistant tool call 与对应 tool result 是协议对；只保留一边可能让 provider 拒绝消息结构。更稳健的算法以 turn 或 atomic group 为单位裁剪，而不是逐条 message。

### Pruning 会永久丢信息

简单删除不能恢复旧目标、约束和未完成任务。Semantic compaction 会把旧历史转成摘要、todo state、文件变化和 unresolved questions，但摘要本身也可能失真，需要 provenance 和质量评测。

### Preview 需要取样策略

只保留前缀适合某些文件，却可能漏掉错误栈尾部。工具可以提供结构化 pagination、head+tail、匹配窗口或 artifact handle，让模型按需继续读取。

---

## 常见失败模式 {#failure-modes}

| 错误 | 后果 | 更好的策略 |
| --- | --- | --- |
| 等 provider 报超限 | 任务中途硬失败 | request 前预估并留余量 |
| 只限制总历史 | 单个 tool result 独占窗口 | 单结果与全局两级预算 |
| 静默截断 | 模型把片段当完整事实 | 明确 truncated、原始大小、读取方式 |
| 删除 tool-call 一半 | 协议无效或语义断裂 | 按 atomic turn/group 裁剪 |
| 永远保留全部 system | 配置本身超限 | Section budget 与启动时验证 |
| 摘要覆盖原始记录 | 无法审计摘要错误 | 原始 transcript 外存，context 只存投影 |
| 每轮重新总结全部历史 | 成本和漂移不断累积 | 增量 compaction 与稳定 checkpoint |
| 没有 prune 事件 | 无法解释模型为何遗忘 | 记录策略、前后大小与丢弃范围 |

---

## 动手实验 {#exercises}

### A. 调低输入预算

把 `max_input_chars` 降到 120。验收条件：最新 tool result 仍保留可辨认 preview；Trace 报告裁剪前后字符数；运行仍有明确 stop reason。

### B. 超大 system prompt

创建长度 500 的 system prompt，却设置输入预算 100。运行并解释为何当前 `final_chars` 仍可能超过预算。然后设计启动时 validation，拒绝这组配置。

### C. Atomic turn pruning

把 messages 分成 system、user turn、assistant+tool group。实现按 group 从后往前保留，保证 tool-call 与 result 不分离。为“单个 group 自身超限”定义策略。

### D. Head + tail 工具结果

修改 `truncate_tool_result`，同时保留前 60% 与后 40%，中间插入省略元数据。验收条件：最终 JSON 有稳定上限，模型能看见错误日志结尾。

### E. Token adapter

为 `ContextBudget` 注入 `measure(text) -> int`，测试字符计数器和一个 fake tokenizer。核心算法不应该依赖具体 provider SDK。

### F. Compaction manifest

设计一个摘要对象，至少包含 goal、completed work、open tasks、changed files、constraints 和 source event range。说明每个字段如何从原始 Trace 追溯。

---

## 深入：从预算到长期记忆 {#deep-dive}

生产 Context Manager 往往组合四种层：

1. **Immediate window**：最近 turn 与当前工具结果，原样保留。
2. **Compacted history**：旧对话的结构化摘要和 checkpoint。
3. **External artifacts**：大文件、日志和搜索结果保存在窗口外，用 handle 按需读取。
4. **Durable memory**：跨会话仍有价值的项目事实，经过选择与更新。

关键不是“存在哪里”，而是每次模型调用如何选择投影。一个成熟预算器可能计算：

```text
available_input
= context_window
- reserved_output
- system_sections
- tool_descriptors
- safety_margin
```

然后把剩余空间分给 current task、recent turns、tool results、retrieved memory 和 compacted state。每一类都需要优先级、最小保证和最大上限。

### 如何评测 compaction？

压缩率不够。至少要测：

- 后续任务完成率是否下降。
- 关键约束是否仍被遵循。
- 未完成任务是否被保留。
- 文件与 tool-call identity 是否正确。
- 摘要是否引入原文没有的事实。
- 多次 compaction 后错误是否累积。

> Context window 是模型的工作记忆，不是系统的唯一数据库。可靠 Harness 会保存完整事实记录，再为每轮编译一个有限投影。

---

## 本章检查点 {#checkpoint}

完成 foundations 前，请确认你能回答：

1. 为什么单工具结果与全局历史需要不同预算？
2. 为什么字符数只适合教学？
3. Tool call 与 result 为什么应作为 atomic group？
4. Pruning 与 semantic compaction 的信息损失有何不同？
5. 为什么 `context.prune` 必须成为 Trace 事件？

至此，你已经拥有一条可运行的 reference harness vertical slice：有界 loop、流式事件、结构化工具、工作区边界、分层指令和上下文预算。下一步不是盲目加功能，而是用 Mechanism、Agent Snapshot、Claim、Experiment 与 Trace 去比较真实 coding agent 如何解决同一组问题。
