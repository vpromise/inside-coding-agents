"""Scoped Git checkpoint, diff, and rollback primitives for s13."""

from __future__ import annotations

import hashlib
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


class CheckpointError(RuntimeError):
    pass


@dataclass(frozen=True)
class GitCheckpoint:
    id: str
    label: str
    commit: str
    tree: str
    repository_token: str


@dataclass(frozen=True)
class GitDiff:
    checkpoint_id: str
    paths: tuple[str, ...]
    patch: str
    patch_sha256: str
    additions: int
    deletions: int


@dataclass(frozen=True)
class RollbackReport:
    checkpoint_id: str
    restored_paths: tuple[str, ...]
    clean: bool


class GitCheckpointManager:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        top_level = Path(self._git("rev-parse", "--show-toplevel").strip()).resolve()
        if top_level != self.root:
            raise CheckpointError("checkpoint root must be the exact Git top level")
        git_dir = self._git("rev-parse", "--absolute-git-dir").strip()
        self._repository_token = hashlib.sha256(git_dir.encode("utf-8")).hexdigest()

    def _git(self, *args: str) -> str:
        environment = {
            "PATH": os.environ.get("PATH", ""),
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_TERMINAL_PROMPT": "0",
        }
        completed = subprocess.run(
            ["git", *args],
            cwd=self.root,
            env=environment,
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip()
            raise CheckpointError(message or f"git {' '.join(args)} failed")
        return completed.stdout

    def _validate_paths(self, paths: Sequence[str]) -> tuple[str, ...]:
        if not paths:
            raise CheckpointError("rollback and diff require at least one explicit path")
        normalized: list[str] = []
        for value in paths:
            candidate = (self.root / value).resolve()
            try:
                relative = candidate.relative_to(self.root)
            except ValueError as exc:
                raise CheckpointError("checkpoint path escapes the repository") from exc
            if not relative.parts:
                raise CheckpointError("repository root is too broad for scoped rollback")
            normalized.append(relative.as_posix())
        return tuple(dict.fromkeys(normalized))

    def _require_own_checkpoint(self, checkpoint: GitCheckpoint) -> None:
        if checkpoint.repository_token != self._repository_token:
            raise CheckpointError("checkpoint belongs to another repository")

    def create(self, label: str, *, require_clean: bool = True) -> GitCheckpoint:
        if not label.strip():
            raise CheckpointError("checkpoint label must be non-empty")
        if require_clean and self._git("status", "--porcelain=v1").strip():
            raise CheckpointError("refusing to checkpoint a dirty working tree")
        commit = self._git("rev-parse", "HEAD").strip()
        tree = self._git("rev-parse", "HEAD^{tree}").strip()
        safe_label = "-".join(label.lower().split())
        return GitCheckpoint(
            id=f"checkpoint-{safe_label}",
            label=label,
            commit=commit,
            tree=tree,
            repository_token=self._repository_token,
        )

    def diff(self, checkpoint: GitCheckpoint, paths: Sequence[str]) -> GitDiff:
        self._require_own_checkpoint(checkpoint)
        scoped_paths = self._validate_paths(paths)
        patch = self._git(
            "diff",
            "--no-ext-diff",
            "--binary",
            checkpoint.commit,
            "--",
            *scoped_paths,
        )
        numstat = self._git(
            "diff",
            "--numstat",
            checkpoint.commit,
            "--",
            *scoped_paths,
        )
        additions = 0
        deletions = 0
        for line in numstat.splitlines():
            added, removed, _ = line.split("\t", 2)
            if added.isdigit():
                additions += int(added)
            if removed.isdigit():
                deletions += int(removed)
        return GitDiff(
            checkpoint_id=checkpoint.id,
            paths=scoped_paths,
            patch=patch,
            patch_sha256=hashlib.sha256(patch.encode("utf-8")).hexdigest(),
            additions=additions,
            deletions=deletions,
        )

    def rollback(
        self,
        checkpoint: GitCheckpoint,
        paths: Sequence[str],
        *,
        expected_patch_sha256: str | None = None,
    ) -> RollbackReport:
        self._require_own_checkpoint(checkpoint)
        scoped_paths = self._validate_paths(paths)
        current = self.diff(checkpoint, scoped_paths)
        if expected_patch_sha256 is not None and current.patch_sha256 != expected_patch_sha256:
            raise CheckpointError("working tree changed after the reviewed diff")
        self._git(
            "restore",
            "--source",
            checkpoint.commit,
            "--worktree",
            "--staged",
            "--",
            *scoped_paths,
        )
        clean = not self._git("status", "--porcelain=v1", "--", *scoped_paths).strip()
        return RollbackReport(
            checkpoint_id=checkpoint.id,
            restored_paths=scoped_paths,
            clean=clean,
        )
