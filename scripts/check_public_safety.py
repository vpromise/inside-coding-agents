#!/usr/bin/env python3
"""Fail when repository candidates contain private or credential-like data.

The scanner intentionally reports only a rule name and location. It never
prints the matched value, which keeps the safety check itself from leaking a
secret into CI or an agent transcript.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRECTORIES = {
    ".git",
    ".next",
    ".private",
    ".research",
    ".tasks",
    ".venv",
    ".vinext",
    ".wrangler",
    "__pycache__",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "private-notes",
    "vendor-upstreams",
}
MAX_TEXT_BYTES = 2_000_000


SECRET_RULES = (
    (
        "private-key",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    ),
    ("github-token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b")),
    ("openai-key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b")),
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")),
    ("slack-token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}\b")),
    (
        "credential-in-url",
        re.compile(r"https?://[^\s/:@]+:[^\s/@]+@", re.IGNORECASE),
    ),
    (
        "credential-assignment",
        re.compile(
            r"(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd)\b"
            r"\s*[:=]\s*[\"']?(?!null\b|none\b|false\b|true\b|redacted\b|example\b|placeholder\b|<)"
            r"[A-Za-z0-9_./+=-]{16,}"
        ),
    ),
    ("personal-macos-path", re.compile("/" + r"Users/[^/\s]+/")),
    ("personal-linux-path", re.compile("/" + r"home/[^/\s]+/")),
    ("sites-project-id", re.compile(r"\bappg(?:prj|dep|ver)_[A-Za-z0-9_~-]{12,}\b")),
)

PINNED_ACTION_PATTERN = re.compile(r"^[^@\s]+@[0-9a-f]{40}$")
USES_PATTERN = re.compile(r"^\s*-?\s*uses:\s*([^\s#]+)")


def github_workflow_rule(path: Path, line: str) -> str | None:
    if path.parts[:2] != (".github", "workflows"):
        return None
    stripped = line.strip()
    if stripped.startswith("pull_request_target:"):
        return "unsafe-pull-request-target"
    if stripped == "permissions: write-all":
        return "workflow-write-all-permissions"
    match = USES_PATTERN.match(line)
    if not match:
        return None
    action = match.group(1)
    if action.startswith("./"):
        return None
    if not PINNED_ACTION_PATTERN.fullmatch(action):
        return "unpinned-github-action"
    return None


def run_git(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        ["git", *arguments],
        cwd=ROOT,
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def is_git_repository() -> bool:
    return run_git("rev-parse", "--is-inside-work-tree", check=False).returncode == 0


def staged_paths() -> list[Path]:
    output = run_git(
        "diff",
        "--cached",
        "--name-only",
        "--diff-filter=ACMR",
        "-z",
    ).stdout
    return [Path(value.decode("utf-8")) for value in output.split(b"\0") if value]


def tracked_paths() -> list[Path]:
    output = run_git("ls-files", "-z").stdout
    return [Path(value.decode("utf-8")) for value in output.split(b"\0") if value]


def working_tree_paths() -> list[Path]:
    paths: list[Path] = []
    for directory, child_directories, filenames in os.walk(ROOT):
        child_directories[:] = [
            child for child in child_directories if child not in SKIP_DIRECTORIES
        ]
        base = Path(directory)
        for filename in filenames:
            paths.append((base / filename).relative_to(ROOT))
    return paths


def read_candidate(path: Path, staged: bool) -> bytes | None:
    if staged:
        result = run_git("show", f":{path.as_posix()}", check=False)
        return result.stdout if result.returncode == 0 else None
    absolute = ROOT / path
    if not absolute.is_file() or absolute.is_symlink():
        return None
    if absolute.stat().st_size > MAX_TEXT_BYTES:
        return None
    return absolute.read_bytes()


def forbidden_path_reason(path: Path) -> str | None:
    normalized = path.as_posix()
    name = path.name.lower()
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        return "local-environment-file"
    if name in {"tasks.local.md", "plan.local.md"}:
        return "private-plan-file"
    if ".private." in name or ".unredacted." in name:
        return "private-or-unredacted-file"
    if any(part in SKIP_DIRECTORIES for part in path.parts):
        return "ignored-private-or-generated-directory"
    return None


def scan(paths: Iterable[Path], staged: bool) -> list[tuple[Path, int, str]]:
    violations: list[tuple[Path, int, str]] = []
    for path in sorted(set(paths), key=lambda item: item.as_posix()):
        path_reason = forbidden_path_reason(path)
        if path_reason:
            violations.append((path, 0, path_reason))
            continue

        raw = read_candidate(path, staged)
        if raw is None or len(raw) > MAX_TEXT_BYTES or b"\0" in raw:
            continue
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue

        for line_number, line in enumerate(text.splitlines(), start=1):
            workflow_rule = github_workflow_rule(path, line)
            if workflow_rule:
                violations.append((path, line_number, workflow_rule))
            for rule_name, pattern in SECRET_RULES:
                if pattern.search(line):
                    violations.append((path, line_number, rule_name))
    return violations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--staged",
        action="store_true",
        help="scan the exact Git index rather than tracked/working files",
    )
    arguments = parser.parse_args()

    repository = is_git_repository()
    if arguments.staged and not repository:
        parser.error("--staged requires an initialized Git repository")

    if arguments.staged:
        paths = staged_paths()
        scope = "staged files"
    elif repository:
        paths = tracked_paths()
        scope = "tracked files"
    else:
        paths = working_tree_paths()
        scope = "repository candidates"

    violations = scan(paths, arguments.staged)
    if violations:
        print(f"PUBLIC_SAFETY_FAILED scope={scope} violations={len(violations)}")
        for path, line_number, rule_name in violations:
            location = f"{path}:{line_number}" if line_number else str(path)
            print(f"- {location}: {rule_name}")
        print("Matched values are intentionally omitted. Remove or redact before committing.")
        return 1

    print(f"PUBLIC_SAFETY_OK scope={scope} files={len(paths)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
