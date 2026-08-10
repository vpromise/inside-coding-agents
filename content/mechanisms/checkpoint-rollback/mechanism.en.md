# Checkpoint, Diff, and Rollback

A coding agent changes state. Reliable harnesses create a version-bound baseline before owned edits, present a scoped diff for review, and restore only explicitly selected paths when recovery is requested. Checkpointing is not a license to erase an inconvenient workspace.

The `s13-checkpoint-rollback` lesson uses a real Git repository, but only inside a newly created disposable temporary fixture. It intentionally avoids broad reset, clean, and user-worktree operations.

## L0 · Definition and boundary {#definition}

A checkpoint identifies a known baseline. A diff describes the delta between that baseline and current state. A rollback applies a scoped recovery operation after verifying that the reviewed delta is still current.

> Recovery is safe only when the harness knows which state it owns and which state belongs to the user.

```text
validated clean fixture
        │
        ▼
checkpoint.create ──► bounded edit
        │                  │
        │                  ▼
        └────────── checkpoint.diff
                           │
                    review + fingerprint
                           │
                           ▼
                  checkpoint.rollback
                           │
                    verify final state
```

| Concept | Required identity | Dangerous shortcut |
| --- | --- | --- |
| Repository | canonical root and VCS state | assume current directory |
| Checkpoint | exact baseline revision and cleanliness | vague “before changes” label |
| Owned paths | explicit reviewed path set | all modified files |
| Diff | bytes/patch tied to baseline | cached screen output |
| Rollback | exact path set and expected fingerprint | broad reset or clean |
| External effect | compensating action, if any | pretend Git can undo it |

### What rollback does not cover

Git can restore tracked file content under a repository. It cannot automatically undo network requests, package publication, database mutation, process signals, external messages, credential exposure, generated artifacts outside the repository, or user changes made concurrently. Those effects require idempotency, compensating actions, or explicit incident handling.

### Dirty work is not a checkpoint

Pre-existing user modifications are input state, not agent-owned backup material. A harness must either preserve and model them, isolate its work in another worktree/branch, or stop for a decision. Folding them into an internal checkpoint and later restoring a baseline can destroy work.

> “Return to clean” is not a valid goal when clean means deleting state the user created.

## L1 · Runnable reference {#reference}

Run the lesson and verify the Golden Trace:

```bash
python3 -m curriculum.lessons.s13_checkpoint_rollback.demo
python3 -m curriculum.golden verify s13-checkpoint-rollback
```

The demo creates a fresh temporary directory, initializes Git, commits `status.txt`, and constructs `GitCheckpointManager` against that exact root. This setup is part of the safety contract, not incidental test boilerplate.

```python
fixture = tempfile.TemporaryDirectory(prefix="inside-agents-s13-")
root = Path(fixture.name)
git(root, "init", "-q", "-b", "main")
target = root / "status.txt"
target.write_text("status: pending\n", encoding="utf-8")
git(root, "add", "--", "status.txt")
git(root, "commit", "-q", "-m", "baseline")
```

The tool creates a checkpoint, performs one workspace-bounded replacement, captures before/after hashes, computes a diff for only `status.txt`, and restores only that path.

```python
checkpoint = checkpoints.create("before-review")
workspace.replace_text(
    "status.txt",
    "status: pending",
    "status: reviewed",
)
diff = checkpoints.diff(checkpoint, ("status.txt",))
rollback = checkpoints.rollback(
    checkpoint,
    ("status.txt",),
    expected_patch_sha256=diff.patch_sha256,
)
```

The patch fingerprint closes a time-of-check/time-of-use gap: if the workspace changes after review, the previously reviewed diff is stale and rollback is refused.

### Why the manager uses scoped restore

The implementation invokes Git with explicit repository context and explicit paths. It does not call `git reset --hard`, `git clean`, or an unscoped restore. Those broad commands cannot distinguish agent-owned delta from user work.

### Read the Golden Trace

```text
checkpoint.create
  └── file.patch (before/after SHA-256)
        └── checkpoint.diff (paths + line counts)
              └── checkpoint.rollback (restored paths + clean status)
```

The final tool result includes the reviewed diff summary, rollback status, and final file content. The test verifies the fixture returned to its committed baseline.

### Run the checks

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s13-checkpoint-rollback
```

The lesson proves scoped recovery in its disposable fixture. It does not authorize running rollback against the project checkout or any user repository.

## L2 · Engineering recovery {#engineering}

Production recovery starts before the first mutation. The harness needs a state inventory, ownership model, checkpoint strategy, mutation journal, review snapshot, and post-recovery verification.

### Inventory state by effect domain

```text
filesystem tracked files  → VCS checkpoint + scoped restore
filesystem untracked      → explicit ownership manifest or trash
package/dependency state  → lockfile + reproducible environment rebuild
process state             → terminate/restart with recorded identity
database/API mutation     → transaction, idempotency key, compensating action
messages/publication      → usually irreversible; require stronger approval
```

Do not claim “rollback supported” without naming the domains covered. A Git checkpoint only covers part of filesystem state.

### Preserve pre-existing state

Before editing, record repository root, head revision, branch/worktree identity, staged paths, unstaged paths, untracked paths, and relevant submodules. If dirty state is allowed, snapshot it separately with user-visible ownership. If the implementation cannot do that safely, pause or work in an isolated copy.

### Tie review to exact bytes

A review UI should show the same normalized patch that the rollback or apply operation fingerprints. Path list, binary-file handling, rename detection, line ending rules, and submodule changes must be explicit. After approval and before mutation, recompute the fingerprint.

```python
current = manager.diff(checkpoint, reviewed_paths)
if current.patch_sha256 != reviewed_patch_sha256:
    raise StaleReview("workspace changed after review")
```

### Roll forward versus roll back

Rollback is not always the best recovery. If migrations or external effects occurred, a corrective forward change may be safer than restoring old files. The plan should state reversibility before execution, not discover it after failure.

### Failure modes {#failure-modes}

| Failure | Consequence | Control |
| --- | --- | --- |
| Broad reset/clean | user work destroyed | explicit path allowlist |
| Wrong repository root | unrelated project changed | canonical root identity |
| Dirty state treated as owned | pre-existing edits lost | inventory and ownership manifest |
| Diff changes after review | stale consent applied | patch fingerprint recheck |
| Untracked file omitted | incomplete recovery | explicit untracked-file policy |
| External effect ignored | false “fully rolled back” status | effect-domain journal |
| Concurrent agent edits | one agent undoes another | leases/version checks and path ownership |

### Safety and reliability {#safety}

Rollback is destructive even when its purpose is recovery. Use the smallest reversible operation, show exact targets, and require fresh authority when restoring would overwrite state not created by the active attempt. Prefer trash or an additional backup for material untracked files.

Never construct destructive targets from unresolved model text, broad globs, empty environment variables, home directories, or workspace roots. Resolve targets read-only first and retain a reviewable list.

Cancellation needs a defined policy. Automatically restoring a fully owned disposable fixture can be reasonable; automatically resetting a user's dirty repository is not. Emit cancellation, rollback decision, attempted recovery, and verification as distinct events.

## L3 · Architecture and Agent comparison {#comparison}

This mechanism currently has no Agent mapping that satisfies the Atlas `Snapshot + Claim` threshold. UI features named “undo,” “checkpoint,” or “revert” are not enough to infer implementation scope, VCS behavior, or protection of pre-existing changes.

### Snapshot research dimensions

For each Agent, pin and inspect:

1. checkpoint trigger and storage location;
2. supported state domains;
3. repository/branch/worktree assumptions;
4. handling of staged, unstaged, untracked, ignored, and submodule state;
5. exact path ownership model;
6. diff shown to the user and fingerprinting behavior;
7. concurrent mutation detection;
8. rollback command or compensating action;
9. retention, privacy, and deletion of backups;
10. trace events and user-visible failure states.

A source map may show commands and data structures. A controlled reproduction should use a disposable fixture containing known dirty and concurrent changes. Neither should touch a researcher's real working tree.

### Do not compare only success demos

The critical cases are stale review, user-owned dirty files, untracked material files, rename/symlink behavior, concurrent agents, partial Git failure, and non-filesystem effects. A happy-path revert of one clean file is the entry point, not a production conclusion.

## L4 · Research and measurement {#research}

Checkpoint experiments should publish fixture construction and post-run state so reviewers can verify that intended paths changed and protected paths did not.

### Proposed recovery matrix

Create a disposable repository with:

- one clean tracked target owned by the agent attempt;
- one pre-existing staged user change;
- one pre-existing unstaged user change;
- one untracked material file;
- one ignored build artifact;
- one rename or symlink fixture;
- a simulated concurrent edit after diff review;
- a synthetic external effect recorded in a journal.

Run checkpoint, mutation, diff, stale-review detection, scoped recovery, and verification. Expected outcomes should specify exact file hashes and VCS status before and after each phase.

Measure protected-state survival, owned-state recovery, stale-review rejection, target overreach, time to recover, residual effects, and trace completeness. Any protected-state change is a critical failure, even if the final test suite passes.

### Exercise and acceptance {#exercise}

```bash
python3 -m curriculum.lessons.s13_checkpoint_rollback.demo
python3 -m curriculum.golden verify s13-checkpoint-rollback
python3 -m unittest curriculum.tests.test_course_contract
```

1. mutate `status.txt` after `diff()` and verify stale fingerprint rejection;
2. add a second tracked file and prove rollback touches only the selected path;
3. introduce a pre-existing dirty file and make checkpoint creation refuse it;
4. record an external synthetic effect and report it as not rolled back;
5. assert no broad reset, clean, or unscoped restore command is used.

You understand the mechanism when “rollback complete” can be expanded into exact state domains, owned paths, baseline identity, verified post-state, and explicit residual effects.

### Research checkpoint

> Recovery that cannot state what it preserved is just another uncontrolled mutation.

No formal checkpoint experiment is registered. The course fixture is the controlled baseline and must remain isolated from user workspaces.
