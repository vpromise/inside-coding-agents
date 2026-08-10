# Agent Harness Mechanisms

A Mechanism is a stable design problem shared across coding agents. Mechanisms organize the project by engineering concern—such as the agent loop, tool dispatch, context compaction, execution policy, subagent orchestration, or recovery—rather than by product brand.

Structured records under [`registry/mechanisms/`](../../registry/mechanisms/) connect each Mechanism to lessons, Agent implementations, Claims, and Experiments. This directory contains the bilingual long-form explanation when one is available.

The current Registry contains 20 Mechanisms. Seven have bilingual narrative pages: `agent-loop`, `context-budget`, `context-compaction`, `memory-retrieval`, `execution-policy`, `os-sandbox`, and `checkpoint-rollback`. The six v0.2 core dossiers each cover L0 intuition, a runnable reference, production constraints, failure and safety boundaries, evidence-scoped Agent comparison, research design, and exercises.

Use the [live Architecture Atlas](https://vpromise.github.io/inside-coding-agents/mechanisms) to search by category, follow prerequisite and dependent links, inspect Claim/Evidence mappings, or move from a mechanism into source code and Golden Traces.
