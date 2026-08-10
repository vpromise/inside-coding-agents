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

## Published controlled experiment pack

Ten deterministic experiments cover tool roundtrips, stream normalization, context budgets, session replay, context compaction, memory retrieval, approval binding, sandbox/network policy simulation, project trust, and checkpoint/rollback. Every experiment runs twice and publishes two normalized traces, a structured Result, and a readable report.

The pack is evidence about the teaching Reference Harness only. It is not Native evidence about Codex, Claude Code, Pi, or Reasonix, and it is not a cross-product benchmark. The sandbox/network probe uses a `simulated-no-effects` backend; it does not establish OS isolation or firewall behavior.

```bash
# Re-run one experiment and replace its four declared artifacts.
python3 labs/runner.py reference-tool-roundtrip-v1

# Rebuild in memory and compare byte-for-byte without writing files.
python3 labs/runner.py reference-tool-roundtrip-v1 --check

python3 -m unittest discover -s labs/tests -v
```

`CONTROLLED_EXPERIMENT_IDS` in `labs/tests/test_runner.py` pins the complete ten-experiment set. The test suite rebuilds all 40 artifacts in memory and checks them byte-for-byte without a model or network call.

## Experiment rules

- Define the question, variables, metrics, and outputs before the run.
- Keep Native, Controlled, and Adversarial modes separate.
- Pin fixtures, configuration, versions, permissions, sandboxing, and network policy.
- Preserve failures and use `not-comparable` for missing or incompatible observations.
- Publish only redacted traces and never record hidden chain-of-thought.
- Run adversarial scenarios only in an isolated environment you own or are authorized to test.

Fixture digests sort relative POSIX paths and hash `relative_path + NUL + bytes + NUL` for every file. The validator rejects inconsistent scenario digests, result paths, repetitions, provenance, or trace fingerprints.
