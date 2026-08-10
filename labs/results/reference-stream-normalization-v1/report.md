# Reference Harness stream normalization probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-stream-normalization-v1`

## Question

Can the Reference Harness normalize a fragmented model stream into one deterministic event sequence without depending on hidden model state?

## Reproduction

```bash
python3 labs/runner.py reference-stream-normalization-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-stream-normalization-v1-run-001`: passed, 7 events, fingerprint `3f234ce09a5c8cd997c743cb9f5459496a78de8f32b3524b5ff06cd912db9ef6`
- `reference-stream-normalization-v1-run-002`: passed, 7 events, fingerprint `3f234ce09a5c8cd997c743cb9f5459496a78de8f32b3524b5ff06cd912db9ef6`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `51f9c1719823cfcedfe60c50fe59fefe0167e444b30430b9018d72468c931fb4`

## Evidence boundary

- The Scripted Model and Reference Harness are deterministic teaching components, not Native vendor evidence.
- The probe validates the declared normalization path only; it does not cover malformed or vendor-specific streams.
- The experiment does not measure latency, token usage, cost, or model capability.
