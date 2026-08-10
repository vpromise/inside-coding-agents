# s06 · Context Budget 与截断

## 目标

让上下文裁剪和工具输出截断成为显式、可测试、可观察的 Harness 策略。

## 运行

`python3 -m curriculum.lessons.s06_context_budget.demo`

示例先限制单个 tool result，再在下一次模型调用前压缩消息列表。两次动作分别记录 `tool.result.truncated` 与 `context.prune`。

## 练习

把 `max_input_chars` 降到 120。验收条件：最近的工具结果仍保留可辨识 preview，Trace 报告裁剪前后字符数。

## 局限

字符数只是确定性教学代理，不等于 provider tokenizer。生产 adapter 应使用真实 token 计数，并为 system、user、tool schema 和输出预留分别预算。
