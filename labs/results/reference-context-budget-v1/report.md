# Reference Harness context budget and truncation probe

- Status: `PASSED`
- Mode: `controlled`
- Experiment: `reference-context-budget-v1`

## Question

Does the Reference Harness enforce a declared context budget and record deterministic tool-output truncation?

## Reproduction

```bash
python3 labs/runner.py reference-context-budget-v1 --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

2 of 2 repetitions passed all declared metrics.

- `reference-context-budget-v1-run-001`: passed, 10 events, fingerprint `a4d37ac72603f338783f60c8e94968375235d29f2580015dc625fbb7a3305784`
- `reference-context-budget-v1-run-002`: passed, 10 events, fingerprint `a4d37ac72603f338783f60c8e94968375235d29f2580015dc625fbb7a3305784`

## Metrics

- `event-order-valid`: pass
- `observations-match`: pass
- `final-answer-match`: pass
- `fixture-unchanged`: pass
- `deterministic-replay`: pass

## Input digests

- Fixture: `d369431d683da5c2cad36bb6dc6f76d429c2efbdc29171d5c8d9d4d7c3c575aa`
- Prompt: `2036916cd8508348f408350ebf57017bd728cc0555ccdb7fcaa2d058b31e3edc`

## Evidence boundary

- This is a character-budget teaching policy, not a measurement of any vendor Agent's token accounting.
- The truncation strategy is deterministic and does not evaluate semantic information loss.
- The experiment does not measure latency, cost, or model capability.
