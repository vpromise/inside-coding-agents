# Reference Harness

Reference Harness is the project's minimal teaching and controlled-experiment baseline, not a product intended to compete with Codex, Claude Code, or another production agent. It keeps the scripted model double, agent loop, tool registry, workspace path boundary, and Trace recorder in a dependency-free Python implementation.

- Current coverage: Tier C, project-owned controlled baseline;
- Research role: validate the contract between Registry, Experiment, Result, Trace, and web replay;
- Model boundary: Scripted Model returns predeclared turns and says nothing about real model capability;
- Safety boundary: Workspace constrains path resolution but is not an operating-system sandbox;
- Reproducibility: pinned prompt and fixture digests, fixed timestamps, two repetitions, and a normalized trace fingerprint.

It answers whether the experiment infrastructure itself works. Native adapters can then connect observable behavior from real agents to the same evidence chain.
