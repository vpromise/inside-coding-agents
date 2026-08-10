# Reference Harness replay and branch probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-session-replay-v1`

## Question

Can append-only events deterministically rebuild session state and create a branch from an explicit sequence boundary?

## Reproduction

```bash
python3 labs/runner.py reference-session-replay-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-session-replay-v1-run-001`: passed, 7 events, fingerprint `acc0c48a153bfe73fd3048e034fb7c72cf8ac09eda32c61a71ec8d5f3eff0106`
- `reference-session-replay-v1-run-002`: passed, 7 events, fingerprint `acc0c48a153bfe73fd3048e034fb7c72cf8ac09eda32c61a71ec8d5f3eff0106`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `bafdff395bb00b3027f78b9eec80b803a5e79513c618cfeae2a8373c32848b8e`

## Evidence boundary

- The event log is in-memory teaching data rather than a crash-tested production store.
- The probe does not cover schema migrations, concurrent writers, or corrupted logs.
- The Reference Harness result is not Native vendor evidence.
