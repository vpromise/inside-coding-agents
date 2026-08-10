# s01 · 最小 Agent Loop

> 模型只提出下一步，Harness 才拥有循环、状态、边界和停止条件。

## 学完这一章，你会得到什么 {#learn}

这一章从一个普通的模型调用开始，把它改造成一个**可终止、可观察、可测试**的 Agent Loop。我们故意暂时不加入工具：先看清控制骨架，s03 再把工具往返接进同一个循环。

完成本章后，你应该能够：

- 用自己的话区分 Model、Harness 和 Agent Product。
- 解释 `messages` 为什么是循环状态，而不是聊天记录的随意拼接。
- 找出一次运行的三个终止出口：正常完成、达到 `max_turns`、异常失败。
- 从 Trace 中还原“用户输入 → 模型请求 → 模型响应 → 会话停止”。
- 运行离线示例并修改它，而不需要 API Key 或网络。

### 开始前只需要知道

你只需要会读基础 Python：函数、列表、`for` 循环和 dataclass。示例中的 `ScriptedModel` 是确定性的模型替身，它不是为了模拟模型智能，而是为了让 Harness 行为可以重复测试。

---

## 问题：为什么一次模型调用还不是 Agent？ {#problem}

普通的 LLM 调用只有一个方向：输入消息，得到一次输出，然后程序结束。即使模型在输出里说“下一步我需要读文件”，文件也不会自动被读取；即使它发现任务没完成，也不会自动请求下一轮。

一个可工作的 Agent Product 至少需要两个角色：

| 角色 | 决定什么 | 不应该偷偷决定什么 |
| --- | --- | --- |
| Model | 基于当前上下文提出文本或结构化动作 | 文件是否真的被修改、命令是否被允许 |
| Harness | 保存状态、调用模型、执行获准动作、判断继续或停止 | 伪造模型的隐藏推理、替模型编造结论 |

把两者连接起来的最小机制就是循环。没有循环，模型输出只是建议；有了循环，上一轮的结果可以成为下一轮的输入。

> Agent Loop 不是“让模型多想几次”的魔法。它是一份明确的控制协议：什么时候调用、保存什么、为什么继续、为何停止。

---

## 心智模型：状态机，而不是 `while True` 咒语 {#mental-model}

把一次运行想成一个有边界的状态机：

```text
START
  │
  ├─ append user message
  │
  ├─ request model ──> append assistant message
  │                         │
  │                         ├─ needs action ──> continue
  │                         └─ no action ─────> COMPLETE
  │
  └─ turn budget exhausted ──────────────────> MAX_TURNS
```

循环真正拥有的是四类状态：

| 状态 | 本章中的表示 | 设计意义 |
| --- | --- | --- |
| 对话状态 | `messages` | 下一轮模型能看到什么 |
| 迭代状态 | `turn_number` | 当前执行到第几轮 |
| 配置状态 | `AgentConfig.max_turns` | 防止无界运行 |
| 观测状态 | `TraceRecorder.events` | 事后可以证明发生了什么 |

### 三条必须一直成立的不变量

1. 每次 `model.request` 使用的消息序列都可以从 Harness 状态解释。
2. 每个 assistant 响应只追加一次，流式 chunk 不能变成多条 assistant message。
3. 每次运行最终都产生明确的 `session.stop`，不能悄悄消失。

这三条不变量会贯穿后面的工具、上下文和权限章节。

---

## 逐步构建最小循环 {#build}

### 第 1 步：用 provider-neutral 类型描述一轮

本项目不把任何厂商 SDK 对象塞进核心循环。模型边界只需要接收 `Message`，返回 `ModelTurn`：

```python
@dataclass(frozen=True)
class Message:
    role: Role
    content: str

@dataclass(frozen=True)
class ModelTurn:
    content: str = ""
    tool_calls: tuple[ToolCall, ...] = ()
    chunks: tuple[str, ...] = ()
    stop: bool = False
```

这样做的价值不是少写几个字段，而是把变化隔离到 adapter：未来接 OpenAI、Anthropic 或本地模型时，核心循环仍然处理同一种内部协议。

### 第 2 步：建立初始消息

`AgentRunner.run()` 先放入可选的 system prompt，再放入用户输入：

```python
messages: list[Message] = []
if self.system_prompt:
    messages.append(Message(role="system", content=self.system_prompt))
messages.append(Message(role="user", content=user_input))
```

消息顺序是状态的一部分。System 约束在前，当前用户意图在后；下一章会看到响应如何以事件增量到达，但最终仍只形成一条 assistant message。

### 第 3 步：给循环一个硬上限

教学实现使用有界 `for`，而不是裸 `while True`：

```python
for turn_number in range(1, self.config.max_turns + 1):
    turn = self.model.respond(messages, self.tools.descriptors())
    final_text = turn.resolved_content
    messages.append(Message(role="assistant", content=final_text))

    if not turn.tool_calls:
        return completed_result(...)
```

“没有工具调用”是当前 reference harness 的正常完成信号。等 s03 加入工具后，存在 `tool_calls` 就意味着 Harness 要执行动作、追加结果并进入下一轮。

### 第 4 步：把耗尽预算变成显式结果

如果所有轮次都用完，循环不能假装成功：

```python
self._emit(
    "error",
    actor_kind="harness",
    actor_id=self.config.agent_id,
    payload={"kind": "max-turns", "max_turns": self.config.max_turns},
)
self._emit(
    "session.stop",
    actor_kind="harness",
    actor_id=self.config.agent_id,
    payload={"reason": "max-turns"},
)
```

调用方得到的不是一个模糊的空字符串，而是 `RunResult.stop_reason == "max-turns"`。可靠系统的关键不是永远成功，而是失败时仍然给出机器可读的状态。

### 第 5 步：用确定性模型替身固定行为

本章 demo 只声明一轮响应：

```python
model = ScriptedModel([
    ModelTurn(
        content="A harness keeps calling the model until work stops.",
        stop=True,
    )
])
```

`ScriptedModel` 会按顺序弹出预先声明的 turn，并保存收到的 requests。于是测试既能检查最终文本，也能检查模型在每一轮究竟看到了哪些消息。

---

## 运行并观察，而不是只读代码 {#run}

从仓库根目录执行：

```bash
python3 -m curriculum.lessons.s01_agent_loop.demo
```

程序会先打印最终文本，再打印 Trace 0.1 JSONL。你应该看到如下事件族：

```text
session.start
user.message
model.request
model.response
session.stop
```

逐项检查：

1. `sequence` 从 0 开始严格递增，中间没有空洞。
2. `model.request.payload.roles` 是 `user`；本章没有 system prompt。
3. `model.response` 的 actor 是 `model`，而不是 Harness。
4. `session.stop.payload.reason` 是 `completed`。
5. 任意 payload 中都不存在 `chain_of_thought`。

### 为什么 Trace 不是普通日志？

普通日志面向人类排错，格式可能随时变化。Trace 是稳定的数据合同：事件有 ID、顺序、actor、provenance 和 redaction 状态，可以被播放器、实验 runner 和验证器共同消费。

试着把输出保存后查询事件类型：

```bash
python3 -m curriculum.lessons.s01_agent_loop.demo \
  | rg '"type"'
```

本示例不会读写工作区、访问网络或读取环境变量，因此可以安全地重复运行。

---

## 读代码时应该盯住什么 {#code-reading}

### `turn.stop` 为什么没有直接控制循环？

当前核心以 `tool_calls` 是否为空判断是否需要继续，因为真正要求 Harness 做事的是结构化动作，而不是一个可能受 provider 流式时序影响的单一 stop 字段。`stop` 保留在内部类型中，用于 adapter 和诊断，但不能成为唯一真相。

### 为什么 assistant message 在判断前追加？

模型的文本和工具请求属于同一个 assistant turn。即使它同时请求工具，这一轮也必须进入历史；否则下一轮看不到自己为什么发起动作。

### 为什么 `RunResult` 同时返回 messages 和 events？

两者回答不同问题：

- `messages` 是**模型可见状态**，用于继续推理。
- `events` 是**观察者可见事实**，用于回放、审计和评测。

不要把内部事件全部塞回模型上下文，也不要从 messages 猜测精确执行时间线。

---

## 常见错误与失败模式 {#failure-modes}

| 错误 | 表面现象 | 正确处理 |
| --- | --- | --- |
| 无上限 `while True` | 模型反复请求动作，进程不退出 | 配置 `max_turns`，返回明确 stop reason |
| 每个 chunk 都追加 message | 历史内容重复，下一轮语义污染 | chunk 只更新累积显示，流结束后追加一次 |
| 把异常当完成 | UI 显示成功但没有最终答案 | 区分 completed、max-turns、cancelled、error |
| Trace 记录隐藏推理 | 泄露不可验证内容，误导读者 | 只记录可观察输入、输出、动作和策略决定 |
| 核心循环依赖厂商对象 | 更换模型时重写全部控制逻辑 | 在 adapter 边界转换为内部类型 |

---

## 动手实验：从小白到研究者 {#exercises}

### A. 热身：看见请求

在 `main()` 中运行后打印 `runner.model.requests`。验收条件：第一次 request 只有用户消息，而且内容与传入 prompt 完全一致。

### B. 工程练习：触发 `max-turns`

把模型第一轮改成包含一个虚构 `ToolCall`，并把 `AgentConfig.max_turns` 设为 1。验收条件：最终 `stop_reason` 是 `max-turns`，最后两个事件依次为 `error` 和 `session.stop`。

### C. 设计练习：增加取消

先不要写线程或 signal handler，只设计 `cancelled` 的数据合同：谁发出取消、在哪个检查点生效、是否允许正在执行的工具完成、Trace 记录什么。把答案写成一张状态转换表。

### D. 研究练习：做一个 provider adapter

定义一个实现 `Model` Protocol 的 adapter，将你熟悉的 SDK 响应转换成 `ModelTurn`。核心验收不是“能调用 API”，而是 `AgentRunner` 无须知道 provider 名称。

运行全部课程测试验证没有破坏不变量：

```bash
python3 -m unittest discover -s curriculum/tests -v
```

---

## 深入：生产级循环还缺哪些保护？ {#deep-dive}

教学循环刻意只保留控制骨架。真实 coding agent 通常还需要：

- **取消传播**：用户中断要传到模型流、工具进程和子任务。
- **超时与重试**：区分可重试网络错误、上下文过长和永久参数错误。
- **权限决策**：工具参数通过 schema 不代表允许执行。
- **上下文预算**：在每次模型请求前决定哪些状态可见。
- **并发纪律**：可并行的只读工具与必须串行的写操作不能混为一谈。
- **持久会话**：崩溃后恢复需要稳定的 turn、message 和 tool-call identity。
- **成本边界**：轮数、token、时间和金额都应该有独立预算。

这些保护层会让实现从几十行增长到几百或几千行，但它们没有改变核心关系：模型提出动作，Harness 管理状态和副作用。

> 判断一个复杂 Agent Loop 时，先把所有保护机制暂时折叠，寻找那条不变的数据流：request → response → effect → result → next request。

---

## 本章检查点 {#checkpoint}

如果你能回答下面五个问题，就可以进入下一章：

1. 为什么 Agent Loop 必须有 Harness 拥有的停止条件？
2. `messages` 与 `events` 为什么不能合并成同一个数组？
3. 为什么不能把每个 streaming chunk 追加成一条 assistant message？
4. 达到 `max_turns` 时，调用方应该得到什么结构化信息？
5. Provider adapter 应该位于循环内部还是边界？为什么？

下一章会保持这条循环不变，只改变模型响应抵达 Harness 的方式：我们把 streaming delta 转成稳定、可回放的事件，同时保证最终消息仍然只有一条。
