# Trace 0.1 Contract

Trace 0.1 is the normalized, JSONL-based event contract shared by lessons, experiments, validation, and the web Trace Player.

- [Canonical JSON Schema](../../registry/schemas/trace-event.schema.json)
- [Synthetic format example](../../registry/examples/example-trace.jsonl)
- [Controlled reproduced traces](../../labs/results/reference-tool-roundtrip-v1/)

Each line is an independently valid event with a sequence number, kind, source, payload, and provenance. Adapters may normalize only legally observable events; they must not invent hidden model, policy, sandbox, or reasoning events.

The JSON Schema is the language-neutral source of truth. Unknown-field and compatibility behavior must evolve through explicit schema versions.
