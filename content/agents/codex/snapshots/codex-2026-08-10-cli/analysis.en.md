# Official-documentation observation

This snapshot answers only what the Codex CLI officially promises users can do; it does not explain how the Rust core implements that behavior. The documentation presents one continuous terminal coding loop for inspecting a repository, planning and editing, running local tools, steering an active turn, and continuing with follow-up work in the same session.

## Confirmed at this boundary

- The product surface is the CLI.
- The user-facing loop is a continuing session rather than a one-shot completion.
- Permissions and sandboxing are configurable.
- Users can steer an active turn.

## Not established here

- The exact loop state machine, retry count, or termination enum.
- The source structure of the tool registry, approval cache, or OS sandbox.
- Whether desktop, IDE, or cloud runs the same binary and commit.
- Performance, security effectiveness, or recovery behavior.

The later source snapshot adds an implementation map, but the evidence is not merged into one claim: official product behavior and public source can move on different release schedules.
