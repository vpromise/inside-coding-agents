# Reference Harness 0.1 controlled snapshot

## Loop

`AgentRunner` 记录 session start，循环请求 Scripted Model，执行工具调用，把工具结果加入下一轮消息，并在无工具调用时停止。

## Context

本实验只有固定的 system、user、assistant 与 tool message；没有 compaction，也不把隐藏推理记录到 Trace。

## Tools

工具先经过声明参数校验，再进入只读 `read_file` handler。fixture 被复制到临时 workspace，规范输入不会被运行过程修改。

## Safety

没有 shell、写文件或网络工具。路径边界阻止绝对路径和 workspace escape，但它不提供 OS 级隔离。

## Reliability

两次 repetition 必须通过事件顺序、工具结果、最终答案、fixture 不变和确定性重放五项指标。

## Extensibility

Model 和 ToolRegistry 都是小接口；Native adapter 可替换输入边界，但不能把本实验结果冒充 Native 证据。

## Orchestration

该 snapshot 没有 subagent。此维度保持 unknown。

## Interfaces

公开入口是 `python3 labs/runner.py reference-tool-roundtrip-v1`，`--check` 只比较重建结果，不写文件。

## Observability

每次运行产生符合 Trace 0.1 的 JSONL、结构化 Result 和可读报告；网页从这些规范产物生成实验页和逐事件回放。
