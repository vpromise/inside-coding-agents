# Claude Code

Claude Code's product core is not published in its public distribution repository, so this project uses a Tier B clean-room boundary: official documentation, formal changelogs, public examples/plugins, and behavior observable in an authorized environment are allowed; guesses about internal files, hidden prompts, or state machines are not.

- Current coverage: Tier B, official documentation.
- Documentation boundary: observed 2026-08-10 and aligned with public distribution tag `v2.1.226`.
- Structured coverage: permissions plus sandboxing, lifecycle hooks, subagent capabilities/isolation, and the experimental Agent Teams coordination contract.
- Explicitly unknown: internal loop, context reducer, tool dispatcher, retry scheduler, event storage, and hidden protocols.
- Missing: a redacted native trace, version-pinned black-box experiments, and a documentation change monitor.

Tier B is not a low-quality label; it records a different evidence boundary. Public behavior can be described precisely, but UI and documentation cannot establish a closed-source implementation.

Agent Teams is kept distinct from ordinary subagents. Official documentation describes teammates with independent context windows, a shared task list, and direct peer messaging, while also warning that teammates do not receive automatic worktree isolation. Those are product-contract facts; scheduler internals and effective workspace isolation remain unknown.
