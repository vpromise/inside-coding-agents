# Pi

Pi is representative not because it includes the most features, but because it draws a clear line between a minimal agent core and the coding-agent product layer. The lower package owns the model loop, events, and tool calls; the upper layer owns the session tree, compaction, TUI, RPC, resource loading, and extensions.

- Current coverage: Tier B, source-backed.
- Version boundary: coding-agent `0.84.1` at commit `936aff0`.
- Research value: minimal core, extension-first design, append-only session tree, and explicit security non-goals.
- Key safety boundary: project trust protects loading of project-local configuration and extensions; it is not a sandbox. Built-in tools inherit the permissions of the user and process that launched Pi.
- Missing: a native trace, safety experiments inside an isolated environment, cross-language RPC reproduction, and an external reviewer.

Pi is useful for asking which capabilities truly belong in a harness core and which can remain in extensions or the operating system. Its lack of built-in subagents, MCP, and permission popups is an intentional product boundary—not evidence that those capabilities cannot exist in the ecosystem.
