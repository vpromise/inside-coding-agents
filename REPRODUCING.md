# Reproducing Inside Coding Agents experiments

[简体中文](REPRODUCING.zh-CN.md)

Inside Coding Agents treats independent reproduction as evidence, including failures and `not-comparable` outcomes. This guide produces a small, public-safe report from a clean checkout without an API key, provider account, network request, or model call.

## What this reproduces

The command rebuilds a declared **Controlled Reference Harness** experiment in memory and compares every trace, result, and report byte-for-byte with the committed artifacts. It verifies the fixture and prompt digests along the way.

It does **not** reproduce the Native behavior of Codex, Claude Code, OpenCode, Grok Build, or another vendor product. It also does not establish model quality, production security, provider reliability, or a comparative ranking.

## Fast path

Use Python 3.12+ and Git. Start from a clean clone of the public repository:

```bash
git clone https://github.com/vpromise/inside-coding-agents.git
cd inside-coding-agents

python3 labs/reproduce.py reference-tool-roundtrip-v1 \
  --output reproduction-report.json

python3 labs/reproduce.py --verify-report reproduction-report.json
```

No dependency installation is required for this path. The generated file is untracked; the reporter deliberately ignores untracked files when confirming that tracked source is clean.

A submission-ready run exits with status 0 and records:

- `outcome: reproduced` and `submission_ready: true`;
- the full public Git commit and a clean tracked worktree;
- OS family, architecture, and Python version, without usernames or absolute paths;
- fixture, prompt, result, report, and trace digests;
- `model_calls: 0` and `network_required: false`;
- an integrity digest in `report_sha256`.

Do not edit the report. Rerun the command when a field is wrong; `--verify-report` detects changes after generation.

## Available Controlled experiments

Replace the ID in the fast-path command with one of these immutable experiment IDs:

| Experiment ID | Mechanism probe |
| --- | --- |
| `reference-tool-roundtrip-v1` | Tool request/result roundtrip |
| `reference-stream-normalization-v1` | Stream normalization |
| `reference-context-budget-v1` | Context budget and truncation |
| `reference-session-replay-v1` | Replay and branch |
| `reference-context-compaction-v1` | Context compaction |
| `reference-memory-retrieval-v1` | Memory retrieval |
| `reference-approval-binding-v1` | Approval binding |
| `reference-sandbox-network-v1` | Sandbox and network policy |
| `reference-project-trust-v1` | Project trust boundary |
| `reference-checkpoint-rollback-v1` | Checkpoint and rollback |

## Reading outcomes

- `reproduced` — the clean, pinned source rebuilt every declared artifact exactly;
- `failed` — the run was comparable, but an input, execution, or artifact check failed;
- `not-comparable` — the report could not bind the observation to a clean, pinned Git state.

Do not convert a failure or `not-comparable` result into success. Negative results help identify portability problems and stale assumptions.

## Submit an independent reproduction

Open the [Experiment reproduction issue form](https://github.com/vpromise/inside-coding-agents/issues/new?template=experiment-reproduction.yml) and provide:

1. the Experiment ID and the report's exact outcome;
2. the generated JSON, either in a fenced block or as a public-safe attachment;
3. the command you ran and any differences from this guide;
4. an explicit statement that you ran it in your own environment and are not submitting on behalf of the project maintainer;
5. any affiliation with a vendor or upstream project relevant to the result.

Project automation can validate the report, but it cannot attest that a human is independent. Maintainer reruns, CI, synthetic fixtures, and AI agents acting for the maintainer do not satisfy the external-participant requirement.

## Publication safety

Review the report before posting it. The generator intentionally excludes Git remotes, usernames, environment values, untracked filenames, personal paths, credentials, and hidden reasoning. Do not add those fields manually.

Never attach raw Native-agent stdout, private workspaces, account identifiers, access tokens, cookies, hidden reasoning, or security-sensitive details to a public issue. Use [SECURITY.md](SECURITY.md) for private vulnerability reporting.
