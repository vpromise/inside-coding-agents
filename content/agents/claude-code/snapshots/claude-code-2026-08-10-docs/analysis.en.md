# Claude Code clean-room documentation snapshot

This snapshot is strong on product contracts and weak on implementation visibility. Every claim comes from official documentation observed on 2026-08-10. Public distribution tag `v2.1.226` aligns the time boundary; it is not product-core source.

## 1. Loop — unknown

Official material establishes an agentic terminal workflow, but this snapshot does not assert an internal sampling loop, tool-result continuation mechanism, termination enum, or retry scheduler. Future work can describe external behavior only through official structured output or authorized black-box experiments.

## 2. Context — partial

Subagent documentation establishes separate child context windows and describes auto-compaction, resume, and startup loading. It does not publish the main context reducer algorithm, summary prompt, or persistence format; those remain unknown.

## 3. Tools — partial

Documentation publishes permission-rule syntax, subagent tool allow/deny controls, and MCP scope. That supports a capability contract, not a claim about internal registry, validator, or dispatcher code.

## 4. Safety — documented product contract

Permissions decide whether tools, files, and domains may be accessed; sandboxing provides OS-level filesystem/network enforcement for Bash and child processes. Official guidance recommends both rather than treating one as a substitute. Deny, ask, managed precedence, and sandbox details remain bound to the documentation date. Claim: `claude-code-doc-execution-policy`.

## 5. Reliability — unknown

Official error and troubleshooting pages exist, but this project has no version-pinned experiments for retry, partial tool calls, crash recovery, or resume. Internal policy is not asserted.

## 6. Extensibility — documented product contract

Hooks cover lifecycle points including PreToolUse, PostToolUse, PermissionRequest, SessionStart/End, and Stop. A PreToolUse deny can block before permission-mode checks, while allow cannot override stricter deny rules. Concurrent hooks and merge precedence are experiment-worthy failure surfaces. Claim: `claude-code-doc-hooks`.

## 7. Orchestration — documented product contract

Subagents have separate context, prompts, tools, models, permission modes, hooks, skills, turn/depth limits, and optional worktree isolation. Documentation also distinguishes foreground/background execution, resume, and teams; this snapshot does not infer scheduler implementation. Claim: `claude-code-doc-subagents`.

## 8. Interfaces — partial

Known surfaces include CLI/TUI, IDE integration, and Agent SDK. No version-pinned protocol claim exists yet, so UI behavior is not presented as a stable wire contract.

## 9. Observability — unknown

Transcripts, hook JSON, and programmatic output expose observable events, but this project has not captured a native trace and does not know the authoritative internal event store. The page shows an evidence ledger rather than simulating an internal event bus.

## Completing Tier B well

Closed-source research does not wait for source; it uses stricter boundaries. Every claim binds to an official page and capture date, dynamic documentation changes trigger staleness, experiments record only public output, hidden prompts/chain-of-thought/private telemetry are excluded, and explanations of internal causes are labeled as inference.
