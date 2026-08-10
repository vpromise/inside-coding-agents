# Reasonix

Reasonix exposes one Go engine through terminal, desktop, browser, and ACP surfaces. Its public source gives cache-aware context maintenance, approvals, an OS sandbox, checkpoints, plugins/MCP, subagents, and an append-only session event log inspectable boundaries, making it useful for studying how long-running harnesses combine performance, safety, and recovery.

- Current coverage: Tier B, source-backed.
- Version boundary: release ledger `1.22.0` at commit `6376bd4`.
- Snapshots: CLI engine and ACP are separated.
- Research value: prefix-cache diagnostics, staged context maintenance, stream recovery, repeated-failure guards, child-tool filtering, and session authority.
- Missing: real provider failure injection, OS-sandbox execution, checkpoint rollback, ACP editor interoperability, and external reproduction.

A rich source tree does not prove an experimental outcome. This profile records what the pinned commit implements; it does not claim lower cache cost, higher recovery success, or effective enforcement on every platform.
