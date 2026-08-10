# Pi RPC snapshot

RPC mode 是给非 Node integration 使用的 process boundary，不是网络 daemon。command 以严格 LF-delimited JSON 写入 stdin；response 与 agent events 从 stdout 输出，业务日志不能污染 framing channel。

协议覆盖：prompt、steer、follow-up、abort、model/thinking、queue mode、compaction、retry、bash、session tree、fork/clone 与 command discovery。客户端可以订阅事件并在 `agent_settled` 后判断一次 run 已空闲。

## 已确认与未知

- 已确认：typed command union、JSONL framing、request id、async event path；
- 未确认：跨语言 client 的兼容性、backpressure、大消息边界、crash/restart 与协议演进策略；
- 安全：RPC 不新增 sandbox，仍继承 CLI core 的外部隔离要求。

对应 Claim：`pi-source-rpc-mode`。下一步应提供一个不依赖 provider key 的 scripted RPC fixture，验证 prompt → tool events → settle → session tree。
