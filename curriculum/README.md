# Coding Agent Curriculum

The curriculum contains thirteen bilingual, progressively layered lessons and a provider-neutral Python reference harness. The default path is deterministic, uses only disposable local fixtures or no-effect simulators, reads no credentials, makes no real network requests, and requires no model API key.

| Lesson | Mechanism | New idea |
| --- | --- | --- |
| s01 | Agent loop | Model output becomes a bounded control loop |
| s02 | Events and streaming | Internal transitions become observable events |
| s03 | Tool dispatch | Structured requests are validated and routed |
| s04 | Workspace tools | File effects stay within an explicit boundary |
| s05 | Instruction discovery | Repository constraints follow deterministic precedence |
| s06 | Context budget | History is measured and compacted before overflow |
| s07 | Session replay | Append-only events rebuild state and preserve branch lineage |
| s08 | Context compaction | Semantic checkpoints retain provenance while shrinking visible history |
| s09 | Memory and skills | Source-attributed facts and full skill instructions load on demand |
| s10 | Approval policy | Exact actions cross ordered allow, ask, and deny decisions |
| s11 | Sandbox and network | Authorized work compiles into a least-privilege capability envelope |
| s12 | Project trust | Workspace identity and source authority keep untrusted data out of policy |
| s13 | Checkpoint and rollback | A clean Git baseline, reviewed diff, and scoped restore make edits recoverable |

Each lesson includes a long-form `lesson.en.md`, a complete Chinese `lesson.zh.md`, an independently runnable `demo.py`, and a deterministic `golden.trace.jsonl`. Shared teaching code lives under `harness/`; deterministic end-to-end tests live under `tests/`. `catalog.json` is the canonical website navigation source.

Every published lesson follows the same learning contract:

1. Define the problem and the mechanism’s boundary.
2. Build a mental model before introducing implementation details.
3. Walk through the repository’s real code step by step.
4. Run an offline demo and inspect its Trace 0.1 events.
5. Study failure modes and complete graduated exercises.
6. Separate the teaching implementation from production-grade concerns.

The `0.2.0` course contract adds four machine-checkable bridges to every lesson:

- `change_contract` states what changed from the previous chapter and which invariants remain.
- `golden_trace` is generated directly from the runnable demo and verified byte for byte.
- `agent_bridge` links the reference mechanism to reviewed Agent Claims, or marks an evidence gap explicitly.
- `exercise_checks` provides local commands with concrete acceptance criteria.

The content-quality tests enforce bilingual parity, stable section anchors, minimum tutorial depth, runnable source links, code examples, tables, and explicit evidence boundaries.

## Run

From the repository root:

```bash
python3 -m curriculum.lessons.s01_agent_loop.demo
python3 -m curriculum.lessons.s03_tool_dispatch.demo
python3 -m curriculum.lessons.s06_context_budget.demo
python3 -m curriculum.lessons.s09_memory_skills.demo
python3 -m curriculum.lessons.s13_checkpoint_rollback.demo
python3 -m curriculum.golden verify
python3 -m unittest discover -s curriculum/tests -v
```

Each demo prints its final answer and Trace 0.1 JSONL events to standard output. Lessons that teach files, Git, or network boundaries use disposable fixtures or a no-effect simulator; they never access a real network or read credentials.

The implementation favors readability over framework abstraction. Code duplication may be intentional when it keeps a new mechanism visible to a learner.
