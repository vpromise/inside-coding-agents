# Reproducible Agent Harness Lab

The Lab connects a fixed fixture and scenario to an executable runner, normalized Trace 0.1 events, a structured Result, and a human-readable report.

```text
labs/
├── fixtures/      Fixed workspaces and environment baselines
├── scenarios/     Prompts, policy, scripted turns, acceptance criteria
├── adapters/      Observable native-event to Trace mappings
├── results/       Redacted traces, structured results, reports
└── runner.py      Registry-backed controlled-experiment runner
```

## Published controlled baseline

`reference-tool-roundtrip-v1` runs the deterministic Reference Harness against a temporary read-only workspace. It verifies the complete fixture → runner → Result → Trace → web replay path.

This baseline is evidence about the Reference Harness only. It is not Native evidence about Codex, Claude Code, Pi, or Reasonix, and it is not a cross-product benchmark.

```bash
# Re-run and replace the four declared artifacts.
python3 labs/runner.py reference-tool-roundtrip-v1

# Rebuild in memory and compare byte-for-byte without writing files.
python3 labs/runner.py reference-tool-roundtrip-v1 --check

python3 -m unittest discover -s labs/tests -v
```

## Experiment rules

- Define the question, variables, metrics, and outputs before the run.
- Keep Native, Controlled, and Adversarial modes separate.
- Pin fixtures, configuration, versions, permissions, sandboxing, and network policy.
- Preserve failures and use `not-comparable` for missing or incompatible observations.
- Publish only redacted traces and never record hidden chain-of-thought.
- Run adversarial scenarios only in an isolated environment you own or are authorized to test.

Fixture digests sort relative POSIX paths and hash `relative_path + NUL + bytes + NUL` for every file. The validator rejects inconsistent scenario digests, result paths, repetitions, provenance, or trace fingerprints.
