# Agent Harness Mechanisms

A Mechanism is a stable design problem shared across coding agents. Mechanisms organize the project by engineering concern—such as the agent loop, tool dispatch, context compaction, execution policy, subagent orchestration, or recovery—rather than by product brand.

Structured records under [`registry/mechanisms/`](../../registry/mechanisms/) connect each Mechanism to lessons, Agent implementations, Claims, and Experiments. This directory contains the bilingual long-form explanation when one is available.

The current Registry contains 14 Mechanisms. `agent-loop/` is the complete public vertical slice, with an intuitive model, runnable implementation, production constraints, cross-Agent comparison, evidence links, and an experiment connection.
