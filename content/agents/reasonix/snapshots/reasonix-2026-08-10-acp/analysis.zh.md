# Reasonix ACP snapshot

ACP 是 editor/client 与 Reasonix engine 之间的独立 interface surface。固定源码使用 stdin/stdout 上的 NDJSON JSON-RPC 2.0；request 与 notification 可并发处理，写入由 mutex 串行化，避免 frame 交错。

event adapter 将 engine event 投影为 ACP `session/update`。当工具需要批准时，server 发出 `session/request_permission`，并把 client 的选择解析回 runtime decision。todo、tool progress、compaction notice 与 extension UI 需要各自的 projection policy，不能假定 engine event 与 ACP event 一一对应。

## 已确认

- framing、message size cap 与 request correlation；
- prompt/cancel 等并发请求不会由单一长 turn 阻塞 read loop；
- approval request 与 session update 有明确 adapter；
- ACP session metadata 保存 work mode 与 tool approval mode。

## 仍未知

- 与具体 editor 的版本兼容；
- client disconnect/reconnect 下的完整语义；
- 大 trace 的 backpressure 与 memory；
- permission UI 是否能准确表达所有 Reasonix-specific decision。

对应 Claim：`reasonix-source-acp`。只有接入真实 ACP client、保存脱敏 wire trace 并验证 cancel/approval/reconnect 后，才能升级 evidence。
