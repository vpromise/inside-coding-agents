# Reference Harness project trust probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-project-trust-v1`

## Question

Can the Reference Harness distinguish trusted policy from untrusted project and tool text before instruction assembly?

## Reproduction

```bash
python3 labs/runner.py reference-project-trust-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-project-trust-v1-run-001`: passed, 8 events, fingerprint `3a330c56aa3ce792ca797291497a246473e06d5e7f08f2b2e20723c3cc7cf8e2`
- `reference-project-trust-v1-run-002`: passed, 8 events, fingerprint `3a330c56aa3ce792ca797291497a246473e06d5e7f08f2b2e20723c3cc7cf8e2`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `d89048a868c7ebc2e559e0c9e45cfd2fcae4156adb2e9cd50d8da23686ed53f9`

## Evidence boundary

- The trust labels are controlled fixtures rather than classifications over arbitrary repositories.
- The probe validates instruction assembly, not resistance to every prompt-injection technique.
- The Reference Harness result is not Native vendor evidence.
