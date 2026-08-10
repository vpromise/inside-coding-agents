# Coding Agent Curriculum

The curriculum contains six bilingual, progressively layered lessons and a provider-neutral Python reference harness. The default path is deterministic, makes no network requests, reads no credentials, and requires no model API key.

| Lesson | Mechanism | New idea |
| --- | --- | --- |
| s01 | Agent loop | Model output becomes a bounded control loop |
| s02 | Events and streaming | Internal transitions become observable events |
| s03 | Tool dispatch | Structured requests are validated and routed |
| s04 | Workspace tools | File effects stay within an explicit boundary |
| s05 | Instruction discovery | Repository constraints follow deterministic precedence |
| s06 | Context budget | History is measured and compacted before overflow |

Each lesson includes `lesson.en.md`, `lesson.zh.md`, and an independently runnable `demo.py`. Shared teaching code lives under `harness/`; deterministic end-to-end tests live under `tests/`. `catalog.json` is the canonical website navigation source.

## Run

From the repository root:

```bash
python3 -m curriculum.lessons.s01_agent_loop.demo
python3 -m curriculum.lessons.s03_tool_dispatch.demo
python3 -m curriculum.lessons.s06_context_budget.demo
python3 -m unittest discover -s curriculum/tests -v
```

Each demo prints its final answer and Trace 0.1 JSONL events to standard output. It does not create files or access the network.

The implementation favors readability over framework abstraction. Code duplication may be intentional when it keeps a new mechanism visible to a learner.
