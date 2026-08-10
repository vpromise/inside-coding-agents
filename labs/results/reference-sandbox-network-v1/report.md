# Reference Harness sandbox and network policy probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-sandbox-network-v1`

## Question

Can the Reference Harness record a destination-scoped network decision while guaranteeing that the teaching backend performs no real network effect?

## Reproduction

```bash
python3 labs/runner.py reference-sandbox-network-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-sandbox-network-v1-run-001`: passed, 13 events, fingerprint `ce801377d12b9d0eb13d616eeaccfe1db807deaeaee68396bad87001f8958911`
- `reference-sandbox-network-v1-run-002`: passed, 13 events, fingerprint `ce801377d12b9d0eb13d616eeaccfe1db807deaeaee68396bad87001f8958911`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `50231e5c01569ce28a885affae2d3ee57702efd1062bcb514f9238c142eb8554`

## Evidence boundary

- This is a policy simulation and proves neither OS sandboxing nor firewall enforcement.
- The invalid example destination is never contacted, so no real network stack behavior is measured.
- The Reference Harness result is not Native vendor evidence.
