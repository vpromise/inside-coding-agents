# Reference Harness memory retrieval probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-memory-retrieval-v1`

## Question

Can the Reference Harness retrieve a task-relevant memory source and select the declared skill without loading unrelated memory?

## Reproduction

```bash
python3 labs/runner.py reference-memory-retrieval-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-memory-retrieval-v1-run-001`: passed, 13 events, fingerprint `7eaa2d164b456e7373c87905a4b1fe77bd96941c1240fc9da34d5df2711bf05c`
- `reference-memory-retrieval-v1-run-002`: passed, 13 events, fingerprint `7eaa2d164b456e7373c87905a4b1fe77bd96941c1240fc9da34d5df2711bf05c`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `bab97a48fbc064150c113df8551727c7dc93abec9288a673737a562660e39bf9`

## Evidence boundary

- Retrieval uses a small deterministic teaching index, not embeddings or a production memory service.
- The probe does not measure ranking quality on ambiguous or adversarial corpora.
- The Reference Harness result is not Native vendor evidence.
