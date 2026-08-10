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

Each lesson includes a long-form `lesson.en.md`, a complete Chinese `lesson.zh.md`, and an independently runnable `demo.py`. Shared teaching code lives under `harness/`; deterministic end-to-end tests live under `tests/`. `catalog.json` is the canonical website navigation source.

Every published lesson follows the same learning contract:

1. Define the problem and the mechanism’s boundary.
2. Build a mental model before introducing implementation details.
3. Walk through the repository’s real code step by step.
4. Run an offline demo and inspect its Trace 0.1 events.
5. Study failure modes and complete graduated exercises.
6. Separate the teaching implementation from production-grade concerns.

The content-quality tests enforce bilingual parity, stable section anchors, minimum tutorial depth, runnable source links, code examples, tables, and explicit evidence boundaries.

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
