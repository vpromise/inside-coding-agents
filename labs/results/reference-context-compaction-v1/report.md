# Reference Harness context compaction probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-context-compaction-v1`

## Question

Can the Reference Harness replace older turns with a deterministic checkpoint while preserving the verified conclusion?

## Reproduction

```bash
python3 labs/runner.py reference-context-compaction-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-context-compaction-v1-run-001`: passed, 10 events, fingerprint `d3e3171adaa9a3de960fc262798c5f56a65f7a634a63c44ccd7f38ea1fc45e59`
- `reference-context-compaction-v1-run-002`: passed, 10 events, fingerprint `d3e3171adaa9a3de960fc262798c5f56a65f7a634a63c44ccd7f38ea1fc45e59`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `d48225211fab69c822df8f219e4e6c33c5c724a097f36375c43727194566e6e2`

## Evidence boundary

- The checkpoint text is produced by deterministic lesson code, not a generative summarizer.
- The probe checks declared facts, not semantic recall across long real-world sessions.
- The Reference Harness result is not Native vendor evidence.
