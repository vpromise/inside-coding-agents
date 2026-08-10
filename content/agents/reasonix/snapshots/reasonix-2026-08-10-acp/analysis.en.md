# Reasonix ACP snapshot

ACP is a separate interface surface between an editor/client and the Reasonix engine. The pinned source uses NDJSON JSON-RPC 2.0 over stdin/stdout. Requests and notifications may run concurrently, while writes are serialized by a mutex so frames cannot interleave.

An event adapter projects engine events into ACP `session/update`. When a tool needs approval, the server sends `session/request_permission` and resolves the client's choice back into a runtime decision. Todos, tool progress, compaction notices, and extension UI each need a projection policy; engine events and ACP events are not assumed to be one-to-one.

## Confirmed

- Framing, message-size cap, and request correlation.
- Prompt/cancel concurrency is not blocked by one long-running turn in the read loop.
- Approval requests and session updates have explicit adapters.
- ACP session metadata persists work mode and tool-approval mode.

## Still unknown

- Compatibility with specific editor versions.
- Full semantics across disconnect and reconnect.
- Backpressure and memory behavior for large traces.
- Whether permission UI expresses every Reasonix-specific decision accurately.

Claim: `reasonix-source-acp`. Evidence can be upgraded only after integrating a real ACP client, saving a redacted wire trace, and testing cancellation, approval, and reconnect.
