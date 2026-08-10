# Reference Harness approval binding probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-approval-binding-v1`

## Question

Does one approval grant authorize only the exact declared write and leave an auditable result?

## Reproduction

```bash
python3 labs/runner.py reference-approval-binding-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-approval-binding-v1-run-001`: passed, 11 events, fingerprint `080977d87e0c4d8c525fd64833a3f440d94c86437ea0b99f9a34659397d84d4f`
- `reference-approval-binding-v1-run-002`: passed, 11 events, fingerprint `080977d87e0c4d8c525fd64833a3f440d94c86437ea0b99f9a34659397d84d4f`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `d8080c12b23ec0e2f24890e57b20523f6474b7d674aeb67629dc359482414a3a`

## Evidence boundary

- The policy engine is deterministic lesson code and the write occurs only in a disposable temporary directory.
- This probe does not establish operating-system isolation or Native vendor approval behavior.
- The experiment does not test races, symlinks, or approval reuse attacks.
