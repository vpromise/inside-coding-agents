# s02 · Streaming 与事件

> 传输 chunk 是“正在到达的字节”，assistant message 是“模型最终说过的话”；两者不能混为一谈。

## 学完这一章，你会得到什么 {#learn}

s01 建立了有界循环，但模型响应仍像一次性返回的字符串。真实模型通常流式输出：文本逐段出现，tool-call arguments 也可能分片到达，连接还可能中途断开。本章把这些传输增量转换成稳定事件，同时维持干净的会话状态。

完成本章后，你应该能够：

- 区分 provider chunk、可观察 event 和最终 assistant message。
- 解释为什么 UI 可以逐字更新，而 `messages` 只能在一轮完成后追加一次。
- 设计严格递增、可关联、可脱敏的事件序列。
- 从 `delta` 和 `accumulated` 字段检查流是否丢失、重复或乱序。
- 运行确定性 streaming demo，并验证最终状态与事件投影一致。

---

## 问题：流式输出制造了两个时间尺度 {#problem}

非流式调用只有“请求前”和“响应后”。流式调用却同时存在：

1. **传输时间**：chunk 什么时候抵达，是否重试，是否断流。
2. **会话时间**：这一轮最终形成了哪条 assistant message。

如果每收到一个 chunk 就往 `messages` 追加一条 assistant message，下一轮模型会看到人为拆碎的历史：

```text
assistant: "Observe "
assistant: "events, "
assistant: "not hidden state."
```

这不是模型说了三轮，而是一次响应经过了三次传输。正确的最终状态应该是：

```text
assistant: "Observe events, not hidden state."
```

> Streaming 是 transport concern；message history 是 conversation concern；event stream 是 observability concern。

---

## 心智模型：一个事实，三个投影 {#mental-model}

同一轮响应可以被投影到三个不同表面：

| 表面 | 面向谁 | 允许增量更新吗 | 最终保留什么 |
| --- | --- | --- | --- |
| Provider stream | Adapter | 是 | 原始 chunk / delta |
| Trace events | UI、评测、审计 | 是 | 每个可观察状态转换 |
| `messages` | 下一轮模型 | 否 | 一条完整 assistant message |

数据流如下：

```text
provider chunks
  "Observe " ─┐
  "events, " ─┼─> accumulator ─> "Observe events, not hidden state."
  "not..."   ─┘         │
                         ├─> model.response event × 3
                         └─> assistant message × 1
```

### 事件不是隐藏状态转储

Trace 只记录 Harness 实际观察到的事实：delta、累计文本、工具请求、执行结果、终止原因。它不记录模型内部不可见的 chain-of-thought，也不应该把密钥、完整环境变量或未脱敏文件内容塞进 payload。

### 一条可靠事件流的四个性质

1. **有序**：同一 session 内 `sequence` 严格递增。
2. **可关联**：`parent_event_id` 或 tool-call ID 能连接因果关系。
3. **可解释**：actor 清楚说明事件来自 user、model、harness 还是 tool。
4. **可发布**：redaction 与 provenance 使读者知道数据边界。

---

## 逐步把 chunk 变成事件 {#build}

### 第 1 步：让模型替身返回 chunks

本章 demo 声明三个确定性增量：

```python
model = ScriptedModel([
    ModelTurn(chunks=(
        "Observe ",
        "events, ",
        "not hidden state.",
    ), stop=True)
])
```

`ModelTurn.resolved_content` 定义最终文本：

```python
@property
def resolved_content(self) -> str:
    return "".join(self.chunks) if self.chunks else self.content
```

这是一条重要边界：adapter 可以使用任何原生 chunk 类型，但进入 Harness 后必须给出稳定的内部表示。

### 第 2 步：为可见 UI 维护 accumulator

`AgentRunner` 逐个处理 chunk：

```python
accumulated = ""
for index, chunk in enumerate(turn.chunks):
    accumulated += chunk
    self._emit(
        "model.response",
        actor_kind="model",
        actor_id=self.config.model_id,
        payload={
            "turn": turn_number,
            "delta": chunk,
            "accumulated": accumulated,
            "final": index == len(turn.chunks) - 1,
            "tool_calls": [],
        },
    )
```

`delta` 适合网络和调试分析；`accumulated` 适合播放器直接展示当前完整文本。生产系统可以只存 delta 以节省空间，但播放器就必须可靠地重建累计状态。

### 第 3 步：流结束后只追加一次 message

事件全部记录后，循环追加 `resolved_content`：

```python
final_text = turn.resolved_content
messages.append(Message(role="assistant", content=final_text))
```

注意这行不在 chunk 循环里。这个位置保证“3 个 response event，1 条 assistant message”。

### 第 4 步：把因果链写进 Trace

`AgentRunner._emit()` 会把上一事件 ID 作为下一事件的 parent：

```python
event_id = self.trace.emit(
    event_type,
    parent_event_id=self._parent_event_id,
    **kwargs,
)
self._parent_event_id = event_id
```

教学实现使用线性 parent chain。更复杂系统中，并行工具会形成分支 DAG，此时不能只依赖“上一条事件”。

### 第 5 步：显式标记最后一个增量

最后一个 event 带有 `final: true`。消费者不必猜“多久没收到数据才算结束”，也不必把 socket close 当成业务完成。

---

## 运行并核对状态投影 {#run}

执行：

```bash
python3 -m curriculum.lessons.s02_events_streaming.demo
```

关注三条 `model.response`：

| 序号 | `delta` | `accumulated` | `final` |
| --- | --- | --- | --- |
| 1 | `Observe ` | `Observe ` | false |
| 2 | `events, ` | `Observe events, ` | false |
| 3 | `not hidden state.` | `Observe events, not hidden state.` | true |

然后验证最终 `RunResult`：

```python
runner, trace = build_demo()
result = runner.run("Stream one observability rule.")

assert result.final_text == "Observe events, not hidden state."
assert result.messages[-1].role == "assistant"
assert result.messages[-1].content == result.final_text
```

### 做一次投影一致性检查

最终 message、最后一个事件的 `accumulated` 和 `result.final_text` 应完全相同：

```python
responses = [
    event for event in result.events
    if event["type"] == "model.response"
]
assert responses[-1]["payload"]["accumulated"] == result.final_text
```

如果这条断言失败，说明 transport projection 与 conversation state 已经分叉。

---

## 从事件到播放器 {#code-reading}

一个 Trace 播放器不需要知道模型 SDK。它只消费规范化事件，并维护一个读取游标：

```text
cursor = 0
visible = events[:cursor + 1]
current = visible[-1]
```

这带来三个能力：

- **暂停**：检查任一事件发生时已知的事实。
- **回放**：按 sequence 重建用户看到的过程。
- **比较**：对两个 run 的事件类型、结果和 stop reason 做结构化 diff。

但播放器不能把 `timestamp` 当作绝对真理。分布式系统会有时钟偏差；因果关系应该优先依赖 sequence、parent 和 correlation ID。

---

## 流式系统最常见的失败模式 {#failure-modes}

| 失败 | 风险 | 需要的策略 |
| --- | --- | --- |
| 重复 chunk | 文本重复、tool arguments 失真 | provider event ID 去重或幂等 accumulator |
| chunk 乱序 | JSON 无法解析、UI 倒退 | sequence 检查，拒绝或缓冲乱序事件 |
| 连接中断 | 半条消息被误认为完成 | 独立的 interrupted/error 终止状态 |
| 空 chunk | 消费者误判无进展 | 允许空 delta，但仍保持序列合同 |
| tool JSON 分片 | 过早执行不完整参数 | 等 content block 完成后再验证与 dispatch |
| 消费者太慢 | 内存不断增长 | 有界队列、背压、降采样或落盘 |
| 敏感文本进入 Trace | 发布后泄密 | 写入前字段级 redaction，而不是事后搜索替换 |

---

## 动手实验 {#exercises}

### A. 空增量

把第二个 chunk 改成空字符串。验收条件：事件 sequence 仍连续，最终文本没有重复，最后一个 response 仍为 `final: true`。

### B. 投影属性测试

写一个小测试，输入任意 chunk tuple，断言：

1. response event 数等于 chunk 数。
2. 每个 `accumulated` 都是下一个的前缀。
3. 最后一个 `accumulated` 等于 `"".join(chunks)`。
4. messages 中只有一条新增 assistant message。

### C. 中断合同

给 `ModelTurn` 设计一个 `stream_error` 教学字段。不要直接复用 `stop=True`。验收条件：Trace 明确区分正常结束与传输中断，且半条文本是否进入 messages 有书面策略。

### D. Tool-call assembler

设计一个 accumulator，把三段 `{"path"`、`: "README`、`.md"}` 合并为参数对象。只有在完整 JSON 和 content-block end 同时到达后，才允许进入 s03 的 validation。

---

## 深入：生产事件总线的设计选择 {#deep-dive}

教学实现把事件保存在内存 list 中。生产系统还要回答：

- 事件先写持久化存储，还是先推 UI？
- 客户端重连时从 event ID、sequence 还是时间戳续传？
- 高频 token delta 是否全部保留，还是聚合成更粗粒度事件？
- 多工具并发时，parent relationship 如何形成 DAG？
- Redaction 在 adapter、event bus 还是 storage 层执行？
- Schema 升级时，旧播放器如何读取新事件？

一个实用分层是：provider adapter 负责协议解析，Harness 负责语义事件，transport 负责投递，storage 负责保留，UI 负责投影。任一层都不应该重新猜测上游语义。

> 好的事件系统不是“记录一切”，而是以稳定合同记录足够多的可观察事实，同时明确哪些内容从未被记录。

---

## 本章检查点 {#checkpoint}

进入 s03 前，请确认你能回答：

1. 为什么三个 chunk 不能变成三条 assistant message？
2. `delta` 与 `accumulated` 分别服务什么消费者？
3. Socket close 为什么不能等价于业务完成？
4. 并行工具出现后，线性 parent chain 为什么不够？
5. Trace redaction 应该发生在公开之后还是写入之前？

下一章会让模型不再只输出文本：它将产生结构化 `ToolCall`，Harness 必须验证名称和参数、执行 handler、记录结果，再把结果送回下一轮。
