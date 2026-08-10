# Reasonix CLI engine source map

This page is pinned to release ledger `1.22.0` at commit `6376bd4`. It is source inspection only: no binary, provider, sandbox backend, or plugin process was started.

```text
user turn
  → delivery / permission / context state
  → frozen sampling request + cache-shape capture
  → bounded stream recovery
  → clean response commit
  → batch scheduler → per-call gate → tool
  → native event log / checkpoint / next round
```

## 1. Loop

`runToolLoop` divides each round into sampling, commit, and final/tool dispatch. A provider attempt enters the session only after a clean terminal result, preventing a failed speculative attempt from mutating history first. Max steps, grace rounds, steering, and final readiness are host-owned state. Claim: `reasonix-source-agent-loop`.

## 2. Context

Context maintenance uses soft, snip, compact, and force thresholds plus a fixed recent-tail budget. `PrefixShape` hashes the system prompt and tool schemas and records provider-visible rewrite reasons to explain cache hits or misses—not to replace correctness with cache metrics. Claim: `reasonix-source-context-maintenance`.

## 3. Tools

Batch scheduling and single-call execution are separated. The former decides parallel/sequential behavior and batch lifecycle; the latter creates per-call context, checks capabilities and policy, invokes the tool, normalizes results, and records failure state. Claim: `reasonix-source-tool-dispatch`.

## 4. Safety

Permission policy, runtime approval posture, and OS sandboxing are distinct layers. Ask/Auto/DontAsk/Yolo remain subject to explicit deny rules, fresh human decisions, and headless gates. Shell sandbox backends exist for macOS/Linux and fail closed when enforcement is requested but unavailable. The source explicitly says Windows lacks an OS-level Bash sandbox at this commit. Claim: `reasonix-source-execution-policy`.

## 5. Reliability

Sampling recovery performs bounded attempts against one frozen request and commits only the selected clean attempt. A separate guard signs semantically identical write-like failures and stops after a threshold; some stale-state failures can first run a side-effect-free recheck. Claim: `reasonix-source-retry-recovery`.

Checkpoint, snapshot-conflict, tail-repair, and delivery-evidence code also exists, but no end-to-end experiment has validated those paths here.

## 6. Extensibility

Plugin manifests can contribute hooks, MCP servers, and other resources. Lazy MCP tools use cached schemas or a connect stub to keep the provider-visible prefix stable, then start a process and reconcile live safety metadata when needed. Claim: `reasonix-source-extension-runtime`.

## 7. Orchestration

Child agents receive a private session temp, filtered tool registry, read-only profile option, and depth cap. Parent-only job/orchestration tools are hidden, and direct MCP schemas are replaced by a stable capability proxy. Claim: `reasonix-source-subagents`.

## 8. Interfaces

Multiple frontends use the engine, but this snapshot binds only the CLI. ACP's NDJSON JSON-RPC, event projection, and permission requests are reviewed in a separate snapshot; this project has no desktop/web claims yet.

## 9. Observability

The append-only `.events.jsonl` file is transcript authority. Model-visible context, event/display indexes, conflict logs, checkpoints, and jobs live in separate sidecars. This separates authoritative events from rebuildable projections instead of combining everything into one large JSON object. Claim: `reasonix-source-event-log`.

## Result and experiment requirement

Reasonix exposes many production-oriented mechanisms in one repository, but source volume is not a maturity score. Tier A still requires at least one end-to-end path across real stream interruption, repeated failure, compaction/cache, sandbox denial, checkpoint restore, or native-trace normalization, plus external reproduction.
