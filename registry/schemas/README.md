# Registry Schemas

Schema version `0.1.0` uses JSON Schema Draft 2020-12 to define the shareable, machine-checkable boundaries of the knowledge graph.

| Schema | Purpose |
| --- | --- |
| `agent-profile.schema.json` | Agent identity, surfaces, coverage, snapshots |
| `claim.schema.json` | Atomic architecture statement and Evidence |
| `mechanism.schema.json` | Stable design-problem ID and graph relations |
| `experiment.schema.json` | Research question, variables, subjects, metrics, outputs |
| `lab-scenario.schema.json` | Executable controlled scenario and expected events |
| `experiment-result.schema.json` | Runs, metrics, digests, fingerprints, summary |
| `trace-event.schema.json` | One normalized JSONL Trace event |
| `curriculum-catalog.schema.json` | Bilingual lesson index and Mechanism mapping |

`registry/examples/` contains synthetic format fixtures. Examples are never presented as research results.

```bash
python3 scripts/validate_registry.py
```

The validator checks every schema and record, then enforces cross-entity, bilingual-content, evidence, digest, experiment-output, trace-provenance, and link invariants.
