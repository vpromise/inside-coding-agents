# Reference Harness checkpoint and rollback probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-checkpoint-rollback-v1`

## Question

Can the Reference Harness restore the declared file to a clean checkpoint after a reviewed temporary change?

## Reproduction

```bash
python3 labs/runner.py reference-checkpoint-rollback-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-checkpoint-rollback-v1-run-001`: passed, 15 events, fingerprint `746ad39a0a83d20565a6f93ec13a70aa08dd75db6d08e56c24e478c881460b19`
- `reference-checkpoint-rollback-v1-run-002`: passed, 15 events, fingerprint `746ad39a0a83d20565a6f93ec13a70aa08dd75db6d08e56c24e478c881460b19`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `7a5bc10e132d7b5dfa623eb784340c0ffb1c3d9222c644abf94dc6220a761b9b`

## Evidence boundary

- The checkpoint backend is deterministic lesson code over a disposable temporary directory.
- The probe does not test large repositories, untracked files, concurrent edits, or partial filesystem failure.
- The Reference Harness result is not Native vendor evidence.
