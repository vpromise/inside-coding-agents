# s01 · 最小 Agent Loop

## 目标

理解 Harness 的最小职责：保存消息、调用模型、判断是否继续，并留下终止原因。

## 心智模型

模型只产生“下一步”。Harness 才拥有循环、状态和停止策略。即使本章只有一次响应，也保留循环结构，因为工具调用会在 s03 把它变成多轮。

## 运行

`python3 -m curriculum.lessons.s01_agent_loop.demo`

观察 `session.start → user.message → model.request → model.response → session.stop`。不要把模型内部推理伪装成 Trace 事件。

## 练习

把 `max_turns` 改为 1，并让 Fake Model 首轮请求工具。验收条件：运行以 `max-turns` 结束，而不是无限循环。

## 边界

本章没有工具、权限、重试或 token 预算。它只建立后续章节不变的控制骨架。
