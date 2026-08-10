# Knowledge Registry

The Registry is the structured fact layer for Inside Coding Agents.

```text
registry/
├── schemas/       JSON Schema 0.1 contracts
├── examples/      Synthetic format fixtures, never research conclusions
├── agents/        Agent profiles and immutable snapshots
├── claims/        Snapshot-bound atomic Claims and Evidence
├── mechanisms/    Cross-Agent design-problem records
└── experiments/   Versioned experiment metadata
```

## Data boundary

- IDs, versions, status, relationships, Claims, and Evidence belong in the Registry.
- Teaching explanations and architecture narratives belong in `curriculum/` and `content/`.
- Executable inputs, traces, and results belong in `labs/`.
- Stable IDs connect all three layers and generate the web views.

Real collections are discovered from conforming files. Adding an Agent, Claim, Mechanism, or Experiment should not require editing product-specific route code.

## Validate

```bash
python3 scripts/validate_registry.py
```

The validator checks JSON Schema, graph references, snapshot and evidence consistency, source commit permalinks, bilingual coverage, fixture and scenario digests, experiment outputs, trace provenance, deterministic fingerprints, and repository-relative Markdown links.
