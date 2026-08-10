# Pi RPC snapshot

RPC mode is a process boundary for non-Node integrations, not a network daemon. Commands are written to stdin as strict LF-delimited JSON; responses and agent events leave through stdout, so business logs must not corrupt the framing channel.

The protocol covers prompts, steering, follow-up, abort, model/thinking controls, queue modes, compaction, retry, Bash, session trees, fork/clone, and command discovery. A client can subscribe to events and use `agent_settled` to determine that a run is idle.

## Confirmed and unknown

- Confirmed: typed command union, JSONL framing, request IDs, and asynchronous event flow.
- Unknown: cross-language compatibility, backpressure, large-message boundaries, crash/restart behavior, and protocol evolution policy.
- Safety: RPC adds no sandbox; it inherits the CLI core's requirement for an external isolation boundary.

Claim: `pi-source-rpc-mode`. The next step is a provider-free scripted RPC fixture covering prompt → tool events → settle → session tree.
