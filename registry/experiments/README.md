# Experiments

Each `*.experiment.json` file conforms to [`experiment.schema.json`](../schemas/experiment.schema.json) and defines its question, fixed inputs, controlled variables, metrics, and outputs before execution.

A `complete` experiment must resolve to a fixture, Scenario, Result, and every declared Trace with consistent provenance.

```bash
python3 labs/runner.py reference-tool-roundtrip-v1 --check
```
