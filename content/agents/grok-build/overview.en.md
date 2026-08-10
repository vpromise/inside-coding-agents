# Grok Build

Grok Build is a strong systems-oriented harness study target: the public Rust repository includes the Agent runtime, terminal UI, headless entry points, ACP transport, tool registry, workspace layer, permissions, sandbox backends, hooks, plugins, skills, subagents, retry logic, and event files. Its boundaries make it possible to compare semantic policy, kernel enforcement, protocol projection, and durable observability without pretending they are one mechanism.

- Current coverage: Tier B, source-backed.
- Version boundary: CLI crate `1.0.0` at repository commit `75e73f3`.
- Provenance boundary: the repository is a public sync; `SOURCE_REV` records monorepo revision `a61c32b…`.
- Research value: actor-style session control, typed tool bridge, ACP, independent child sessions, plugin/hook gates, configurable compaction, and explicit sandbox state.
- Critical limitation: source inspection found an unsupported/apply-failure path that can continue without sandboxing. Effective isolation must therefore be recorded per run, not inferred from a `--sandbox` request.
- Missing: released-binary version verification, a reviewed Native streaming-JSON trace, platform-specific sandbox experiments, ACP interoperability reproduction, and an external reviewer.

The repository shows a layered design rather than one monolithic loop. A session actor receives commands and asynchronous events; a turn drives sampling and tool calls; a ToolBridge projects a finalized registry; workspace policy resolves permission; a separate sandbox manager attempts platform enforcement; and file-event utilities persist observable lifecycle records.

That separation produces a particularly important lesson for harness builders:

```text
permission decision ≠ sandbox requested ≠ sandbox active ≠ effect contained
```

A deny rule can block a call before execution. A sandbox profile can ask for OS restrictions. The active backend determines whether those restrictions exist. Tool semantics and external side effects still determine what can escape or remain irreversible. The Grok Build snapshot keeps all four questions visible.

## What to learn from Grok Build

For newcomers, the repository demonstrates how a production-shaped coding Agent decomposes into turn control, model sampling, tool dispatch, permission, isolation, event projection, and UI/protocol clients. For advanced readers, the valuable details are pure retry decisions, hook gates before tools, resume identity for subagents, schema-versioned JSONL events, and ACP normalization.

The nine reviewed mechanism mappings are source facts, not a product certification. No model call or released CLI execution was made for this snapshot. Tier B remains the honest level until a pre-registered Native run establishes the exact binary, flags, active isolation state, observable event stream, and limitations.
