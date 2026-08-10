# App Server interface snapshot

This snapshot covers Codex App Server only; it is not a complete description of any desktop or IDE client.

## Boundary

At the pinned commit, App Server runs a JSON-RPC message loop over stdio, Unix-socket, or WebSocket transports. The connection layer owns framing and connection lifecycle; the message processor converts wire requests into typed requests and dispatches them to processors for threads, turns, configuration, MCP, plugins, filesystems, and other domains.

## Why this is a separate snapshot

- `surface=server` must not be mixed with `surface=cli` behavior.
- A protocol capability does not prove that a particular client adopted it.
- Published server source does not imply published client or hosted-service source.
- Available transports do not establish reconnect, ordering, or backward compatibility without experiments.

Claim: `codex-source-app-server`. The next step is a deterministic public-contract experiment across initialize → thread → turn → event → cancel.
