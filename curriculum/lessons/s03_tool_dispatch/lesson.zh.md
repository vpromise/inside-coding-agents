# s03 · Tool Registry 与 Dispatch

## 目标

理解工具描述、参数验证、执行、结果消息和 Trace 之间的完整往返。

## 数据流

模型产生结构化 `ToolCall`。Registry 先检查工具名和参数 Schema，再调用 handler。无论成功或失败，Harness 都把结果作为 `tool` message 回送模型，并记录 request/result 事件。

## 运行

`python3 -m curriculum.lessons.s03_tool_dispatch.demo`

## 练习

给 `echo` 增加一个未声明参数。验收条件：handler 不执行，Trace 中的 `tool.result.ok` 为 `false`，下一轮仍能看到结构化错误。

## 安全边界

Schema validation 不是 authorization。是否允许读文件、运行命令或访问网络，需要独立的 policy 和 sandbox 层。
