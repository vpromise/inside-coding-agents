# s03 · Tool Registry 与 Dispatch

> 工具调用不是“执行一段模型文本”，而是一份必须经过描述、验证、执行、关联和回传的结构化协议。

## 学完这一章，你会得到什么 {#learn}

前两章的模型只能返回文本。现在我们给它第一个真正的能力：`echo`。重点并不在 echo 本身，而在完整往返——模型提出 `ToolCall`，Registry 验证名称与参数，handler 执行，Harness 记录结果并把 tool message 送回下一轮。

完成本章后，你应该能够：

- 解释 descriptor、schema、handler 和 tool result 各自承担的责任。
- 区分 validation、authorization 与 execution，避免把它们混成一个“安全检查”。
- 跟踪 `tool_call_id` 如何连接请求、结果和下一轮消息。
- 让未知工具、缺失参数、多余参数和 handler 异常都变成结构化失败。
- 读懂一次两轮模型调用、一次工具执行的完整 Trace。

---

## 问题：模型说“调用工具”以后，谁来负责？ {#problem}

模型输出下面的 JSON，并不意味着程序应该直接执行：

```json
{
  "id": "call-001",
  "name": "echo",
  "arguments": {"text": "hello"}
}
```

在真正产生副作用前，Harness 至少要回答：

1. `echo` 是已注册工具吗？
2. `text` 是否存在且类型正确？
3. 是否包含 schema 未声明的字段？
4. 当前会话是否有权调用它？
5. handler 成功、失败或超时时如何编码结果？
6. 下一轮模型如何知道结果属于哪次请求？

本章实现 1、2、3、5、6；权限与 OS sandbox 在后续层处理。

> Schema validation 只能证明“参数长得像预期”，不能证明“这个动作被允许”。

---

## 心智模型：工具往返是一条闭环 {#mental-model}

```text
messages + descriptors
        │
        ▼
      MODEL
        │ ToolCall(id, name, arguments)
        ▼
  validate name + schema
        │
        ├─ invalid ─> structured error result
        │
        ▼
   execute handler
        │
        ├─ exception ─> structured error result
        ▼
 append tool message
        │
        └────────────> next model request
```

闭环里有四份数据合同：

| 合同 | 生产者 | 消费者 | 稳定键 |
| --- | --- | --- | --- |
| Tool descriptor | Registry | Model adapter | `name` |
| Tool call | Model | Harness | `id` + `name` |
| Tool result event | Harness/tool | Trace consumers | `tool_call_id` |
| Tool message | Harness | 下一轮 Model | `tool_call_id` + `name` |

### Descriptor 是模型的操作界面

模型只看到名称、描述和参数 schema，不应该看到 Python handler、凭据或内部对象。描述越含糊，模型越容易选错工具；schema 越宽松，Harness 接到的歧义越多。

### Registry 是能力目录，不是权限系统

“已注册”表示 Harness 知道如何执行，并不表示任何用户、目录或会话都能执行。生产系统通常在 Registry 与 handler 之间插入 policy decision point。

---

## 逐步构建工具系统 {#build}

### 第 1 步：定义一个 Tool

核心类型把公开描述与私有实现放在一起管理，但 `descriptor()` 只投影安全字段：

```python
@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: JsonObject
    handler: Handler

    def descriptor(self) -> JsonObject:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }
```

本章注册 `echo`：

```python
registry.register(Tool(
    name="echo",
    description="Return the supplied text.",
    parameters={
        "type": "object",
        "additionalProperties": False,
        "required": ["text"],
        "properties": {"text": {"type": "string"}},
    },
    handler=lambda args: {"echo": args["text"]},
))
```

`additionalProperties: False` 很重要：`{"text": "hello", "command": "..."}` 不能悄悄穿过 validation。

### 第 2 步：禁止重复工具名

Registry 使用名称索引 handler：

```python
def register(self, tool: Tool) -> None:
    if tool.name in self._tools:
        raise ValueError(f"tool already registered: {tool.name}")
    self._tools[tool.name] = tool
```

如果后注册工具可以覆盖前一个，插件就可能劫持同名能力。即使生产系统允许 override，也应该要求显式命名空间或优先级，而不是静默覆盖。

### 第 3 步：在 handler 之前验证

`ToolRegistry.execute()` 先找工具，再验证参数，最后才调用 handler：

```python
tool = self._tools.get(name)
if tool is None:
    raise ToolValidationError(f"unknown tool: {name}")

self._validate(tool.parameters, arguments)
return tool.handler(dict(arguments))
```

教学 validator 支持 object、required、additionalProperties 和基础类型。它不是完整 JSON Schema 实现；生产系统应使用成熟 validator 并固定 schema dialect。

### 第 4 步：声明模型的两轮脚本

第一轮请求工具，第二轮读取结果后完成：

```python
model = ScriptedModel([
    ModelTurn(tool_calls=(
        ToolCall(
            id="call-001",
            name="echo",
            arguments={"text": "hello"},
        ),
    )),
    ModelTurn(
        content="The echo tool returned hello.",
        stop=True,
    ),
])
```

这让工具往返的因果关系完全确定，不需要真实模型“碰巧”选择正确工具。

### 第 5 步：执行并追加 tool message

核心循环为每个 call 发出请求事件，执行 Registry，再追加结果：

```python
value = self.tools.execute(call.name, call.arguments)
encoded = encode_tool_result(value)

messages.append(Message(
    role="tool",
    content=encoded,
    name=call.name,
    tool_call_id=call.id,
))
```

下一轮 request 的 roles 应该是：

```text
user → assistant → tool
```

Provider adapter 可以把内部 `role="tool"` 转换为厂商要求的原生结构，但 `tool_call_id` 必须保留。

### 第 6 步：把失败也送回模型

未知工具、参数错误和 handler 错误都实现为 `ToolError`。Harness 捕获后生成 JSON：

```python
{
    "ok": False,
    "error": str(exc),
    "error_type": type(exc).__name__,
}
```

失败仍然成为 tool message，模型才有机会修正参数、换工具或向用户解释。异常不能只写 stderr 后丢失。

---

## 运行完整工具往返 {#run}

执行：

```bash
python3 -m curriculum.lessons.s03_tool_dispatch.demo
```

预期事件顺序：

```text
session.start
user.message
model.request       # turn 1: descriptors include echo
model.response      # contains call-001
tool.request        # echo({"text": "hello"})
tool.result         # {"echo": "hello"}
model.request       # turn 2: includes the tool message
model.response      # final explanation
session.stop
```

### 检查模型第二轮看到了什么

```python
runner, trace = build_demo()
result = runner.run("Use the echo tool, then report its result.")

second_request = runner.model.requests[1]
assert [message.role for message in second_request] == [
    "user", "assistant", "tool"
]
assert second_request[-1].tool_call_id == "call-001"
```

### 检查 request/result 配对

```python
requests = [e for e in result.events if e["type"] == "tool.request"]
results = [e for e in result.events if e["type"] == "tool.result"]

assert requests[0]["payload"]["tool_call_id"] == \
       results[0]["payload"]["tool_call_id"]
assert results[0]["payload"]["ok"] is True
```

这比只检查最终回答更重要：模型完全可能在没有正确执行工具时生成一句看似合理的话。

---

## Validation、Authorization、Execution 三层边界 {#code-reading}

这三个概念经常被混用：

| 层 | 问题 | 例子 |
| --- | --- | --- |
| Validation | 输入结构有效吗？ | `path` 是字符串吗？是否有未知字段？ |
| Authorization | 当前主体可以做吗？ | 这个 repo 是否可信？写文件要审批吗？ |
| Execution | 动作怎样被隔离地运行？ | cwd、env、timeout、sandbox、资源上限 |

正确顺序通常是 validate → authorize → execute，但还要考虑 TOCTOU：授权时检查的路径或文件，执行时可能已经变化。s04 会加入工作区边界，并明确它仍不是 OS sandbox。

### 结果为什么要 JSON 编码？

工具返回值可能是 dict、list、数字或布尔值。稳定 JSON 能让 provider adapter、Trace 和测试使用同一表示。`sort_keys=True` 还让确定性测试和 fingerprint 更可靠。

### 错误为什么要分类？

- `ToolValidationError` 表示模型可修正的输入问题。
- `ToolExecutionError` 表示 handler 已开始但执行失败。
- Policy denial 应该是另一类错误，因为“格式错误”和“没有权限”的恢复方式不同。

---

## 常见错误与攻击面 {#failure-modes}

| 问题 | 后果 | 防护 |
| --- | --- | --- |
| `eval` 模型输出 | 任意代码执行 | 只 dispatch 已注册 handler |
| 宽松 `additionalProperties` | 隐藏参数穿透 | 默认拒绝未知字段 |
| 描述与实现不一致 | 模型选错或误用工具 | descriptor 与 handler 同版本发布 |
| 丢失 `tool_call_id` | 并发结果无法配对 | 请求、事件、消息全程保留 ID |
| handler 异常冒出循环 | 会话突然终止 | 分类并编码失败结果 |
| 结果无限大 | 上下文和 UI 被淹没 | s06 的输出预算与截断 |
| 重试非幂等写操作 | 重复修改或扣费 | 幂等键、事务或人工确认 |
| 工具输出提示注入 | 下一轮模型被不可信文本操纵 | 标记来源、最小暴露、策略隔离 |

---

## 动手实验 {#exercises}

### A. 拒绝额外参数

把 call arguments 改为 `{"text": "hello", "extra": true}`。验收条件：handler 不执行；`tool.result.payload.ok` 为 false；`error_type` 是 `ToolValidationError`。

### B. 未知工具恢复

把名称改成 `missing_tool`，但保留第二轮模型响应。观察 Harness 如何把错误作为 tool message 回送。然后让第二轮脚本改为请求正确的 `echo`，验证循环可以恢复。

### C. 新增结构化工具

注册 `add`，参数为两个 number，返回 `{"sum": ...}`。验收条件：不修改 `AgentRunner.run()`；只新增 Tool 定义和脚本 turn。

### D. 并发设计题

假设一轮同时请求 `read_file A`、`read_file B` 和 `write_file C`。为 Tool 增加 `concurrency` 元数据，设计调度规则：哪些能并行，哪些必须等待，结果仍如何按 call ID 回传。

### E. Fuzz validation

对 arguments 生成缺字段、错类型、布尔伪装整数、深层对象和超大字符串。验收条件：任何非法输入都在 handler 前失败，且错误可序列化。

---

## 深入：生产级 Tool Runtime {#deep-dive}

成熟 Harness 通常把 Registry 扩展成完整 runtime：

- **Discovery**：内置工具、插件、MCP server 和动态能力如何合并。
- **Namespacing**：不同 provider 出现同名工具时如何避免冲突。
- **Policy metadata**：read/write/network/destructive 等风险标签。
- **Approval**：在副作用前暂停，并把决定绑定到精确参数。
- **Isolation**：子进程、文件系统、网络和资源限制。
- **Cancellation**：取消信号传进 handler，清理子进程。
- **Observability**：duration、exit status、截断、redaction 和 provenance。
- **Idempotency**：重试不会重复产生不可逆副作用。

另一个关键问题是工具描述本身也属于 prompt surface。过多、重叠或模糊的工具会消耗 token 并降低选择准确率，因此生产系统可能按任务动态筛选 descriptor，而不是每轮广播全部能力。

> Tool use 的质量由两部分共同决定：模型是否选对动作，以及 Harness 是否把动作安全、准确、可恢复地执行。只优化其中一半不够。

---

## 本章检查点 {#checkpoint}

进入 s04 前，请确认你能回答：

1. Tool descriptor 为什么不能包含 handler 或凭据？
2. Schema-valid 为什么不等于 authorized？
3. `tool_call_id` 必须在哪四个位置保留？
4. Handler 失败为什么仍要生成 tool message？
5. 新增工具为什么不应该修改核心循环？

下一章会把抽象 handler 换成真实的 File、Shell 和 Edit 工具，并围绕工作区路径、命令 allowlist 和精确替换建立第一层副作用边界。
