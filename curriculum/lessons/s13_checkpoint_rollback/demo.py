import hashlib
import os
import subprocess
import tempfile
from pathlib import Path

from curriculum.harness import (
    AgentRunner,
    ApprovalGate,
    ApprovalPolicy,
    ApprovalRule,
    GitCheckpointManager,
    ModelTurn,
    ScriptedModel,
    Tool,
    ToolCall,
    ToolRegistry,
    Workspace,
)
from curriculum.lessons.common import lesson_trace, print_run


def _git(root: Path, *args: str, commit: bool = False) -> None:
    environment = {
        "PATH": os.environ.get("PATH", ""),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_TERMINAL_PROMPT": "0",
    }
    if commit:
        environment.update(
            {
                "GIT_AUTHOR_NAME": "Inside Coding Agents",
                "GIT_AUTHOR_EMAIL": "course@example.invalid",
                "GIT_AUTHOR_DATE": "2026-08-10T00:00:00Z",
                "GIT_COMMITTER_NAME": "Inside Coding Agents",
                "GIT_COMMITTER_EMAIL": "course@example.invalid",
                "GIT_COMMITTER_DATE": "2026-08-10T00:00:00Z",
            }
        )
    completed = subprocess.run(
        ["git", *args],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "fixture git command failed")


def build_demo() -> tuple[AgentRunner, object]:
    fixture = tempfile.TemporaryDirectory(prefix="inside-agents-s13-")
    root = Path(fixture.name)
    _git(root, "init", "-q", "-b", "main")
    target = root / "status.txt"
    target.write_text("status: pending\n", encoding="utf-8")
    _git(root, "add", "--", "status.txt")
    _git(root, "commit", "-q", "-m", "baseline", commit=True)

    workspace = Workspace(root)
    checkpoints = GitCheckpointManager(root)
    trace = lesson_trace("s13-checkpoint-rollback")

    def review_then_rollback(args):
        checkpoint = checkpoints.create("before-review")
        checkpoint_event = trace.emit(
            "checkpoint.create",
            actor_kind="harness",
            actor_id="git-checkpoint",
            parent_event_id=trace.events[-1]["event_id"],
            payload={
                "checkpoint_id": checkpoint.id,
                "label": checkpoint.label,
                "clean_baseline": True,
            },
        )
        before = target.read_text(encoding="utf-8")
        workspace.replace_text("status.txt", "status: pending", args["replacement"])
        after = target.read_text(encoding="utf-8")
        patch_event = trace.emit(
            "file.patch",
            actor_kind="tool",
            actor_id="review_then_rollback",
            parent_event_id=checkpoint_event,
            payload={
                "path": "status.txt",
                "before_sha256": hashlib.sha256(before.encode("utf-8")).hexdigest(),
                "after_sha256": hashlib.sha256(after.encode("utf-8")).hexdigest(),
            },
        )
        diff = checkpoints.diff(checkpoint, ("status.txt",))
        diff_event = trace.emit(
            "checkpoint.diff",
            actor_kind="harness",
            actor_id="git-checkpoint",
            parent_event_id=patch_event,
            payload={
                "checkpoint_id": checkpoint.id,
                "paths": list(diff.paths),
                "additions": diff.additions,
                "deletions": diff.deletions,
            },
        )
        rollback = checkpoints.rollback(
            checkpoint,
            ("status.txt",),
            expected_patch_sha256=diff.patch_sha256,
        )
        trace.emit(
            "checkpoint.rollback",
            actor_kind="harness",
            actor_id="git-checkpoint",
            parent_event_id=diff_event,
            payload={
                "checkpoint_id": rollback.checkpoint_id,
                "restored_paths": list(rollback.restored_paths),
                "clean": rollback.clean,
            },
        )
        return {
            "reviewed_diff": {
                "paths": list(diff.paths),
                "additions": diff.additions,
                "deletions": diff.deletions,
            },
            "rolled_back": rollback.clean,
            "final_content": target.read_text(encoding="utf-8"),
        }

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="review_then_rollback",
            description="Apply one scoped edit, inspect its Git diff, then restore it.",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "required": ["replacement"],
                "properties": {"replacement": {"type": "string"}},
            },
            handler=review_then_rollback,
        )
    )
    gate = ApprovalGate(
        ApprovalPolicy(
            (
                ApprovalRule(
                    id="allow-scoped-checkpoint-demo",
                    tool_names=("review_then_rollback",),
                    effect="allow",
                    reason="The action is confined to an explicit disposable fixture path.",
                ),
            )
        )
    )
    model = ScriptedModel(
        [
            ModelTurn(
                content="I will checkpoint, review the exact diff, and roll back.",
                tool_calls=(
                    ToolCall(
                        id="call-checkpoint-rollback",
                        name="review_then_rollback",
                        arguments={"replacement": "status: reviewed"},
                    ),
                ),
            ),
            ModelTurn(
                content="The reviewed change was rolled back to the clean checkpoint.",
                stop=True,
            ),
        ]
    )
    runner = AgentRunner(
        model=model,
        tools=registry,
        trace=trace,
        approval_gate=gate,
    )
    runner.fixture = fixture
    runner.workspace = workspace
    runner.checkpoints = checkpoints
    runner.target = target
    return runner, trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Review the status edit, then return the fixture to baseline.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
