#!/usr/bin/env python3
"""Reproduce one deterministic Reference Harness experiment and emit a safe report.

This command is deliberately limited to complete Controlled experiments whose
sole subject is the local Reference Harness. It never calls a model or needs
network access. A successful report is suitable for an independent contributor
to attach to a public issue or pull request after reviewing the attestation.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import platform
from pathlib import Path
import re
import subprocess
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from labs.runner import (  # noqa: E402
    ExperimentError,
    build_artifacts,
    check_artifacts,
)


EXPERIMENT_ROOT = ROOT / "registry" / "experiments"
STABLE_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")


class ReproductionError(RuntimeError):
    """Raised when a requested report cannot satisfy its public contract."""


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def report_digest(report: dict[str, Any]) -> str:
    unsigned = dict(report)
    unsigned.pop("report_sha256", None)
    return sha256_text(
        json.dumps(unsigned, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    )


def load_experiment(experiment_id: str) -> dict[str, Any]:
    if not STABLE_ID_PATTERN.fullmatch(experiment_id):
        raise ReproductionError(f"invalid experiment ID: {experiment_id}")
    path = EXPERIMENT_ROOT / f"{experiment_id}.experiment.json"
    if not path.is_file() or path.is_symlink():
        raise ReproductionError(f"experiment does not exist: {experiment_id}")
    try:
        experiment = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ReproductionError("experiment record is not valid JSON") from exc
    if not isinstance(experiment, dict) or experiment.get("id") != experiment_id:
        raise ReproductionError("experiment identity does not match its filename")
    subjects = experiment.get("subjects", [])
    if (
        experiment.get("mode") != "controlled"
        or experiment.get("status") != "complete"
        or len(subjects) != 1
        or subjects[0].get("agent_id") != "reference-harness"
    ):
        raise ReproductionError(
            "public reproduction reports support only complete Controlled Reference Harness experiments"
        )
    return experiment


def git_repository_state() -> dict[str, Any]:
    def run(*arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["git", *arguments],
            cwd=ROOT,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=15,
            check=False,
        )

    try:
        commit_result = run("rev-parse", "HEAD")
        status_result = run("status", "--porcelain=v1", "--untracked-files=no")
    except (OSError, subprocess.TimeoutExpired):
        return {"commit": None, "tracked_worktree_clean": False}
    commit = commit_result.stdout.strip().lower()
    if commit_result.returncode != 0 or not COMMIT_PATTERN.fullmatch(commit):
        commit = None
    return {
        "commit": commit,
        "tracked_worktree_clean": (
            status_result.returncode == 0 and not status_result.stdout.strip()
        ),
    }


def public_diagnostic(error: Exception) -> str:
    message = str(error).replace(str(ROOT), "<repository>")
    message = re.sub(r"/(?:Users|home)/[^/\s]+", "/<user>", message)
    return message[:400]


def check_record(check_id: str, passed: bool, detail: str) -> dict[str, Any]:
    return {"id": check_id, "status": "pass" if passed else "fail", "detail": detail}


def build_reproduction_report(
    experiment_id: str,
    *,
    observed_at: str | None = None,
    repository_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    experiment = load_experiment(experiment_id)
    repository = repository_state or git_repository_state()
    commit = repository.get("commit")
    clean = repository.get("tracked_worktree_clean") is True
    commit_pinned = isinstance(commit, str) and COMMIT_PATTERN.fullmatch(commit) is not None

    artifacts: dict[Path, str] = {}
    mismatches: list[str] = []
    diagnostic: str | None = None
    try:
        artifacts = build_artifacts(experiment_id)
        mismatches = check_artifacts(artifacts)
    except ExperimentError as exc:
        diagnostic = public_diagnostic(exc)

    artifacts_match = diagnostic is None and not mismatches
    checks = [
        check_record(
            "repository-commit-pinned",
            commit_pinned,
            "A full Git commit identifies the reproduced source state.",
        ),
        check_record(
            "tracked-worktree-clean",
            clean,
            "Tracked changes are absent; untracked report files are ignored.",
        ),
        check_record(
            "controlled-reference-scope",
            True,
            "The experiment is complete, Controlled, and has Reference Harness as its sole subject.",
        ),
        check_record(
            "artifact-rebuild-match",
            artifacts_match,
            "Every declared trace, result, and report was rebuilt in memory and compared byte-for-byte.",
        ),
        check_record(
            "zero-model-calls",
            True,
            "The Scripted Model and local fixture require no provider or model call.",
        ),
        check_record(
            "offline-execution",
            True,
            "The reproduction path performs no network request.",
        ),
    ]

    if diagnostic is not None or mismatches:
        outcome = "failed"
    elif not commit_pinned or not clean:
        outcome = "not-comparable"
    else:
        outcome = "reproduced"

    artifact_sha256 = {
        path.relative_to(ROOT).as_posix(): sha256_text(content)
        for path, content in sorted(artifacts.items(), key=lambda item: item[0].as_posix())
    }
    report: dict[str, Any] = {
        "schema_version": "0.1.0",
        "kind": "controlled-experiment-reproduction",
        "experiment_id": experiment_id,
        "observed_at": observed_at or now_utc(),
        "outcome": outcome,
        "submission_ready": outcome == "reproduced",
        "repository": {
            "commit": commit if commit_pinned else None,
            "tracked_worktree_clean": clean,
        },
        "environment": {
            "os_family": platform.system() or "unknown",
            "architecture": platform.machine() or "unknown",
            "python_implementation": platform.python_implementation(),
            "python_version": platform.python_version(),
        },
        "inputs": {
            "fixture_path": experiment["fixture"]["path"],
            "fixture_sha256": experiment["fixture"]["sha256"],
            "scenario_path": experiment["scenario"]["path"],
            "prompt_sha256": experiment["scenario"]["prompt_sha256"],
            "repetitions": experiment["repetitions"],
        },
        "execution": {
            "command": f"python3 labs/reproduce.py {experiment_id}",
            "model_calls": 0,
            "network_required": False,
            "rebuilt_artifact_count": len(artifacts),
        },
        "checks": checks,
        "artifact_sha256": artifact_sha256,
        "mismatches": mismatches,
        "diagnostic": diagnostic,
        "evidence_boundary": [
            "This report reproduces a deterministic Controlled experiment in the local Reference Harness.",
            "It does not reproduce Codex, Claude Code, OpenCode, Grok Build, or any other vendor Native behavior.",
            "It does not establish model quality, provider reliability, production security, or comparative ranking.",
        ],
        "independence_attestation": "must-be-confirmed-by-the-human-submitter",
    }
    report["report_sha256"] = report_digest(report)
    return report


def render_report(report: dict[str, Any]) -> str:
    return f"{json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)}\n"


def verify_report_file(path: Path) -> dict[str, Any]:
    resolved = path.expanduser().resolve()
    if not resolved.is_file() or resolved.is_symlink():
        raise ReproductionError("report must be an existing regular file")
    if resolved.stat().st_size > 2_000_000:
        raise ReproductionError("report exceeds the 2 MB verification limit")
    try:
        report = json.loads(resolved.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReproductionError("report is not readable JSON") from exc
    if not isinstance(report, dict):
        raise ReproductionError("report root must be a JSON object")
    expected = report.get("report_sha256")
    observed = report_digest(report)
    if expected != observed:
        raise ReproductionError("report digest does not match its content")
    if (
        report.get("schema_version") != "0.1.0"
        or report.get("kind") != "controlled-experiment-reproduction"
        or report.get("outcome") not in {"reproduced", "failed", "not-comparable"}
    ):
        raise ReproductionError("report identity or outcome is invalid")
    return report


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "experiment_id",
        nargs="?",
        help="Stable ID of a Controlled Reference Harness experiment",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write the public-safe JSON report to a new file instead of stdout",
    )
    parser.add_argument(
        "--verify-report",
        type=Path,
        help="Verify the digest and identity of an existing report without rerunning",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.verify_report:
            if args.experiment_id or args.output:
                raise ReproductionError(
                    "--verify-report cannot be combined with an experiment ID or --output"
                )
            report = verify_report_file(args.verify_report)
            print(
                f"REPRODUCTION_REPORT_OK experiment={report['experiment_id']} "
                f"outcome={report['outcome']} sha256={report['report_sha256']}"
            )
            return 0
        if not args.experiment_id:
            raise ReproductionError(
                "provide an experiment ID or use --verify-report <report.json>"
            )
        report = build_reproduction_report(args.experiment_id)
        rendered = render_report(report)
        if args.output:
            output = args.output.expanduser().resolve()
            if output.exists() or output.is_symlink():
                raise ReproductionError("refusing to overwrite an existing report")
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(rendered, encoding="utf-8")
            print(
                f"REPRODUCTION_REPORT_WRITTEN outcome={report['outcome']} "
                f"sha256={report['report_sha256']}"
            )
        else:
            print(rendered, end="")
        return 0 if report["submission_ready"] else 1
    except ReproductionError as exc:
        print(f"REPRODUCTION_FAILED: {public_diagnostic(exc)}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
