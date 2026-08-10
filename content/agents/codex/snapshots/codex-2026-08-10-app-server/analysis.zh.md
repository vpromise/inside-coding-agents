# App Server interface snapshot

这个 snapshot 只覆盖 Codex App Server，不代表任一 desktop 或 IDE client 的完整实现。

## Boundary

App Server 在固定 commit 上提供 JSON-RPC message loop，并支持 stdio、Unix socket 与 WebSocket transport。连接层负责 framing 与连接生命周期，message processor 将 wire request 转换为 typed request，再分派给 thread、turn、config、MCP、plugin、filesystem 等 processor。

## 为什么单独建 snapshot

- `surface=server`，不能与 `surface=cli` 的用户行为混写；
- protocol capability 不证明某个 client 已采用；
- server source 可见，不代表 client source 或 hosted service 可见；
- transport 存在不等于 reconnect、ordering 与 backward compatibility 已通过实验。

对应 Claim：`codex-source-app-server`。下一步是用公开 client contract 做 initialize → thread → turn → event → cancel 的确定性协议实验。
