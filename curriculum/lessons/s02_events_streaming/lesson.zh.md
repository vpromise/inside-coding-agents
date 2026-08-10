# s02 · Streaming 与事件

## 目标

把 provider 的流式增量转成稳定的 Harness 事件，同时保持最终 assistant message 完整。

## 关键设计

传输 chunk 不是新的会话消息。Reference harness 为每个增量记录 `model.response`，并用 `accumulated` 展示当前可见文本；循环只在流结束后追加一条 assistant message。

## 运行

`python3 -m curriculum.lessons.s02_events_streaming.demo`

## 练习

让第二个 chunk 为空。验收条件：事件仍严格递增，最终内容没有重复，最后一个事件明确标记 `final: true`。

## 工程提醒

生产系统还要处理断流、重复增量、tool-call arguments 的部分 JSON 和取消；这些不应被“字符串拼接”掩盖。
