# s13 · Git Checkpoints, Diffs, and Rollback

> Reversibility is a recovery property, not permission. Create a clean, version-bound baseline before an agent edit, review the exact scoped delta, and restore only paths the harness explicitly owns.

## What you will build {#learn}

s10 decides whether an action may run. s11 confines its powers. s12 controls which inputs may become instructions. Those layers reduce risk, but a fully authorized, isolated, trusted edit can still be wrong.

This chapter adds a recovery boundary using a real temporary Git repository:

- `GitCheckpointManager` verifies one exact repository top level;
- `create()` refuses a dirty baseline by default and records `HEAD` plus tree identity;
- `diff()` requires explicit relative paths and produces a patch fingerprint plus line counts;
- `rollback()` rechecks the reviewed fingerprint before a scoped `git restore`;
- untracked files and unrelated paths are never selected by the lesson rollback;
- `checkpoint.create`, `file.patch`, `checkpoint.diff`, and `checkpoint.rollback` preserve the state transition in Trace 0.1;
- the demo runs only in a disposable fixture and ends at its original content.

By the end, you should be able to:

- distinguish session checkpoints, Git checkpoints, commits, patches, and backups;
- protect pre-existing user changes from agent ownership;
- bind review to an exact state delta and detect stale review;
- scope rollback to explicit files rather than the whole working tree;
- explain which network, process, database, and deployment effects Git cannot undo;
- design checkpoint events that support debugging without leaking private source.

### Prerequisites

You should understand workspace path bounds from s04, append-only events from s07, compaction checkpoints from s08, and the safety chain from s10–s12. Git must be available locally; the lesson initializes its own temporary repository.

---

## The problem: “Git can undo it” is dangerously underspecified {#problem}

Coding agents often operate in a working tree that already contains user edits. A broad rollback command can erase work the agent did not create. A checkpoint taken after an unwanted edit merely records the wrong state. A reviewed diff can become stale before rollback because another process changes the file.

| Term | What it captures | What it does not guarantee |
| --- | --- | --- |
| Session checkpoint | Agent/event progression | Filesystem state or external effects |
| Context checkpoint | Model-visible semantic summary | Lossless history or working tree state |
| Git commit/tree | Tracked repository content | Untracked files, databases, remote services |
| Working-tree diff | Delta from a base | Ownership or authorization |
| Backup/snapshot | A storage copy at some scope | Correct restore semantics or freshness |
| Compensating action | Domain-specific reverse operation | Exact restoration under concurrency |

> A dirty working tree is evidence of ambiguous ownership. Never absorb or erase it just to make an agent workflow convenient.

### Four recovery questions

Before changing a file, ask:

1. What exact baseline are we restoring to?
2. Which paths does this operation own?
3. Has the reviewed delta changed since inspection?
4. Which side effects live outside Git and need separate compensation?

If any answer is unknown, “rollback available” is not a reliable safety claim.

---

## Mental model: authorize, checkpoint, mutate, review, decide {#mental-model}

The final safety pipeline is:

```text
trusted instruction + user task
          │
          ▼
tool.request ──> approval ──> sandbox profile
          │ allowed
          ▼
verify exact Git root + clean baseline
          │
          ▼
checkpoint.create (commit/tree identity)
          │
          ▼
scoped mutation ──> file.patch
          │
          ▼
checkpoint.diff (paths + additions/deletions + private fingerprint)
          │
          ├── accept ──> continue/test/commit
          │
          └── rollback ── recheck fingerprint ──> scoped restore
```

The demo always chooses rollback so the Golden Trace proves restoration. A production harness may continue after review, commit a coherent change, or create a new checkpoint.

### Ownership is path- and time-bounded

The lesson owns one file in a disposable fixture for one tool call. It does not claim ownership of the repository root, unrelated tracked changes, untracked files, or effects after the call.

### Review is a state binding

`GitDiff.patch_sha256` binds the patch the harness inspected. Rollback recomputes the patch and refuses if it changed. That prevents a decision over version A from acting blindly on version B.

---

## Build scoped Git recovery step by step {#build}

### Step 1: create an isolated fixture repository

`build_demo()` creates a `TemporaryDirectory`, initializes branch `main`, writes one file, and commits a deterministic baseline:

```python
_git(root, "init", "-q", "-b", "main")
target.write_text("status: pending\n", encoding="utf-8")
_git(root, "add", "--", "status.txt")
_git(root, "commit", "-q", "-m", "baseline", commit=True)
```

The helper uses argv arrays, no shell, a five-second timeout, no terminal prompt, and fixed commit identity/time. The fixture is never the project repository containing this course.

### Step 2: verify the exact Git top level

The manager resolves its requested root and compares it with:

```bash
git rev-parse --show-toplevel
```

Nested directory, parent repository, or unrelated path mismatches are rejected. Recovery commands need an exact scope before they can be safe.

### Step 3: bind checkpoints to one manager/repository

The manager hashes its absolute Git directory into an internal repository token. `GitCheckpoint` carries that token, commit, tree, label, and stable lesson ID. A checkpoint from another repository is rejected.

The internal token is not emitted in public Trace because it derives from a local path. Portable events use the non-sensitive checkpoint ID.

### Step 4: require a clean baseline

`create()` runs:

```python
git status --porcelain=v1
```

If any tracked or untracked change exists, the default call fails. This prevents the lesson from claiming a mixed user/agent state as its rollback baseline.

Production options include stopping, asking the user, creating a separate worktree, or recording a carefully scoped pre-existing delta. Silently stashing or committing user work is not an acceptable default.

### Step 5: record commit and tree identity

The manager resolves `HEAD` and `HEAD^{tree}`. A branch name alone is mutable and cannot identify a checkpoint. The demo event publishes only label and clean status; private state retains hashes needed for restore.

### Step 6: perform one explicit-path edit

The tool replaces exactly one occurrence in `status.txt`:

```python
workspace.replace_text(
    "status.txt",
    "status: pending",
    "status: reviewed",
)
```

It emits `file.patch` with relative path and before/after content SHA-256. The Trace does not need to publish the file body.

### Step 7: validate every diff path

`_validate_paths()` rejects an empty path list, escapes, and the repository root. It returns deduplicated repository-relative POSIX paths.

```python
candidate = (self.root / value).resolve()
relative = candidate.relative_to(self.root)
if not relative.parts:
    raise CheckpointError("repository root is too broad for scoped rollback")
```

Explicit `--` separates Git options from paths so a filename beginning with `-` cannot become an argument.

### Step 8: inspect the exact diff

The manager runs a binary-capable patch plus numstat:

```python
git diff --no-ext-diff --binary <checkpoint> -- status.txt
git diff --numstat <checkpoint> -- status.txt
```

The lesson records one addition and one deletion. `patch_sha256` remains private runtime state used to detect stale review.

### Step 9: recheck before rollback

`rollback()` recalculates the diff. When an expected fingerprint was supplied and differs, it raises `CheckpointError` before modifying anything.

```python
current = self.diff(checkpoint, scoped_paths)
if current.patch_sha256 != expected_patch_sha256:
    raise CheckpointError("working tree changed after the reviewed diff")
```

This is optimistic concurrency control for the reviewed change.

### Step 10: restore only explicit paths

The lesson uses:

```text
git restore --source <checkpoint> --worktree --staged -- status.txt
```

There is no repository-wide reset and no deletion of untracked files. The manager verifies the selected path is clean afterward and emits `checkpoint.rollback`.

### Step 11: return a structured result

The tool result reports reviewed path/counts, `rolled_back=true`, and final fixture content. The second model turn can explain the outcome using ordinary tool history.

---

## Run and inspect the reversible change {#run}

Run:

```bash
python3 -m curriculum.lessons.s13_checkpoint_rollback.demo
```

The central part of the 15-event trace is:

```text
approval.decision allow
checkpoint.create id=checkpoint-before-review clean_baseline=true
file.patch path=status.txt before_sha256=… after_sha256=…
checkpoint.diff paths=[status.txt] additions=1 deletions=1
checkpoint.rollback restored_paths=[status.txt] clean=true
tool.result final_content="status: pending\n"
```

Verify the committed result:

```bash
python3 -m curriculum.golden verify s13-checkpoint-rollback
```

### Inspect the final file

After `runner.run(...)`, `runner.target.read_text()` is exactly `status: pending\n`. The temporary repository returns to its baseline for the selected path.

### Challenge path scope

Call `diff(checkpoint, ("../outside.txt",))`. The manager raises `CheckpointError` before any Git restore operation.

### Challenge stale review

Create a diff and capture its fingerprint, change the file again, then call rollback with the old fingerprint. Acceptance: rollback refuses because the reviewed patch is no longer current.

---

## Failure modes and recovery limits {#failure-modes}

| Failure | Consequence | Safer design |
| --- | --- | --- |
| Checkpoint after mutation | Wrong state becomes “baseline” | Create and record before side effect |
| Dirty baseline accepted silently | User work mixes with agent work | Stop, isolate worktree, or explicit ownership contract |
| Repository-wide reset | Unrelated tracked edits are lost | Explicit path list and review |
| Clean command deletes untracked files | User artifacts disappear | Never clean broadly; inventory ownership |
| Branch name used as identity | Moving ref changes restore source | Immutable commit/tree identity |
| Review fingerprint omitted | Concurrent edit is overwritten | Recompute and compare before restore |
| Symlink/path scope unchecked | Restore targets unexpected location | Exact top level and resolved relative paths |
| Git rollback called “transaction” | Network/deploy/database effects remain | Compensating actions and effect ledger |
| Patch body placed in public trace | Private source leaks | Digests/counts/paths with redaction |
| Successful rollback hides failed attempt | Incident evidence disappears | Append-only events preserve both states |
| Agent auto-commits user work | Ownership and history are altered | Explicit consent and coherent commit policy |
| Concurrent agents share one tree | Checkpoints and diffs race | Worktree/process isolation and ownership leases |

> Git can restore tracked bytes. It cannot unsend a message, revoke a published package, roll back a database without a transaction, or guarantee that a command had no hidden effects.

### Dirty worktree strategies

Possible strategies include refusing to proceed, asking the user to commit/stash, creating a new worktree, snapshotting only agent-owned paths, or using an overlay filesystem. Each must preserve pre-existing state and make ownership visible. “Automatically stash everything” can still disrupt the user's workflow and should not be a hidden default.

### Binary and generated files

Binary diff review, lockfiles, generated artifacts, and file mode changes need specific UI and validation. Line counts alone are not sufficient to approve a binary replacement.

---

## Exercises with acceptance criteria {#exercises}

### A. Refuse a dirty baseline

Modify `status.txt` before `create()`. Acceptance: checkpoint creation raises, preserves content, and emits no misleading `checkpoint.create` event.

### B. Reject an empty or root-wide path scope

Pass `()` or `(".",)`. Acceptance: validation rejects both; no restore command is constructed.

### C. Detect stale review

Capture a diff fingerprint, make another edit, and attempt rollback with the old value. Acceptance: `CheckpointError` occurs and the latest content remains untouched.

### D. Preserve an unrelated tracked edit

Add `user-notes.txt`, modify it after the checkpoint, and roll back only `status.txt`. Acceptance: status returns to baseline while user notes remain exactly changed.

### E. Preserve an untracked artifact

Create `scratch.log` after the checkpoint. Acceptance: scoped rollback does not delete or add it to Git; the result explicitly reports that it was outside ownership.

### F. Add an effect ledger

Record filesystem, process, and network effects for one tool call. Acceptance: Git rollback handles only tracked paths; non-Git effects require named compensation or remain visibly irreversible.

Run the focused contract:

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s13_rolls_back_only_the_reviewed_scoped_diff -v
```

---

## Deep dive: production recovery architecture {#deep-dive}

### Checkpoint ownership models

A session may own a dedicated worktree, a set of paths, a patch stack, or an overlay snapshot. Express ownership explicitly and reject overlap. Multi-agent systems need leases, merge boundaries, and conflict events rather than assuming one global working tree.

### Commit versus checkpoint

Committing every intermediate state can clutter history or capture incomplete work. An internal checkpoint can use a tree/object/ref namespace without publishing a user-visible commit. Whatever representation is chosen, it needs retention, garbage-collection, and crash-recovery policy.

### Patch review semantics

Review should include rename, mode, binary, submodule, generated-file, and line-ending changes. Bind the final approved patch, not just a summary. If formatting or tests modify files afterward, produce a new diff and decision.

### Crash recovery

Persist checkpoint identity and effect ledger before mutation. On restart, replay the session log, detect incomplete tool calls, compare current repository state, and offer safe choices. Never assume a missing `tool.result` means no effect occurred.

### External side effects

Use domain transactions where available. Otherwise record idempotency keys and compensating operations: delete a draft release, close a temporary branch, revoke a token, cancel a job. Some effects are irreversible; policy should communicate that before approval.

### Privacy and evidence

Public traces can expose relative path categories, counts, status, and content digests while redacting filenames or code when necessary. Reproduction fixtures should contain redistributable synthetic content, never a private working tree.

### Agent evidence boundary

The pinned Reasonix event-log claim mentions derived checkpoint sidecars adjacent to an authoritative append-only log. It does not prove that Reasonix uses this manager, Git restore semantics, or the same stale-review contract. Other product mappings remain research work rather than inferred equivalence.

### Where the course goes next

s13 completes the initial Safety track. Reliability chapters will add error taxonomy, retry/backoff, tool-call repair, loop detection, steering/cancel/background work, and eval-driven observability. Those mechanisms build on the event and checkpoint boundaries established here.

---

## Checkpoint {#checkpoint}

Before leaving the Safety track, answer:

1. Why must a checkpoint be created before mutation?
2. Why does a dirty baseline make ownership ambiguous?
3. What does the patch fingerprint protect against?
4. Why is an explicit path list safer than repository-wide reset?
5. Which effects cannot Git restore?
6. Why does successful rollback still belong in an append-only trace?

You now have a complete first safety chain: identity-bound instructions, exact approval, mandatory sandbox/network planning, and scoped recovery. Every layer answers a different question; none is allowed to masquerade as the others.
