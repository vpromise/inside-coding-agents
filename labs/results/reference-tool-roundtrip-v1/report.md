# Reference Harness controlled tool roundtrip

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-tool-roundtrip-v1`

## Question

Can the registry-backed reference runner reproduce one read-only tool roundtrip, including the same normalized event trace, from a pinned fixture and scenario?

## Reproduction

```bash
python3 labs/runner.py reference-tool-roundtrip-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-tool-roundtrip-v1-run-001`: passed, 9 events, fingerprint `a59806d5bd056ac750112dcaf356879b72d7d87b52fac970248fa8f72b94b886`
- `reference-tool-roundtrip-v1-run-002`: passed, 9 events, fingerprint `a59806d5bd056ac750112dcaf356879b72d7d87b52fac970248fa8f72b94b886`

## Metrics

- `event-order-valid`: pass
- `tool-result-recorded`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `8d962551cb790e0401896c6bab495fbd63f25c1194b70c9f5e0a79f2909ddcaf`
- Prompt: `4a1376db3ab987fd384e91931d34930c35856f1a379a017a237db9f60f408760`

## Evidence boundary

- The Scripted Model is a deterministic test double and does not measure model capability.
- The Reference Harness is not a native vendor agent, so this result cannot raise Codex, Claude Code, Pi, or Reasonix coverage.
- The workspace boundary prevents path escape but is not an operating-system sandbox.
- The experiment does not measure latency, token usage, cost, or behavior under failure.
