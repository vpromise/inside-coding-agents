#!/usr/bin/env python3
"""Run deterministic, registry-backed controlled experiments.

The runner writes only declared files below ``labs/results``. ``--check`` rebuilds
artifacts in memory and compares them with the committed outputs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from curriculum.harness import (  # noqa: E402
    AgentConfig,
    AgentRunner,
    ModelTurn,
    ScriptedModel,
    ToolCall,
    TraceRecorder,
    Workspace,
    workspace_tool_registry,
)


RUNNER_ID = "reference-experiment-runner"
RUNNER_VERSION = "0.1.0"
STABLE_ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class ExperimentError(RuntimeError):
    """Raised when an experiment input or declared output is inconsistent."""


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def resolve_declared_path(relative_path: str, *, label: str, within: Path) -> Path:
    candidate = Path(relative_path)
    if not relative_path or candidate.is_absolute():
        raise ExperimentError(f"{label} must be a non-empty repository-relative path")
    resolved = (ROOT / candidate).resolve()
    try:
        resolved.relative_to(within.resolve())
    except ValueError as exc:
        raise ExperimentError(f"{label} must stay inside {within.relative_to(ROOT)}") from exc
    return resolved


def sha256_directory(directory: Path) -> str:
    """Hash sorted relative paths and bytes with NUL separators."""

    if not directory.is_dir():
        raise ExperimentError(f"fixture directory does not exist: {directory.relative_to(ROOT)}")
    digest = hashlib.sha256()
    paths = sorted(path for path in directory.rglob("*") if path.is_file())
    if not paths:
        raise ExperimentError("fixture directory has no files")
    for path in paths:
        if path.is_symlink():
            raise ExperimentError(f"fixture symlinks are not allowed: {path.relative_to(directory)}")
        relative = path.relative_to(directory).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ExperimentError(f"cannot load {path.relative_to(ROOT)}: {exc}") from exc
    if not isinstance(value, dict):
        raise ExperimentError(f"expected an object in {path.relative_to(ROOT)}")
    return value


def parse_timestamp(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ExperimentError(f"invalid scenario timestamp: {value}") from exc


def build_turns(scenario: dict[str, Any]) -> list[ModelTurn]:
    return [
        ModelTurn(
            content=turn["content"],
            stop=turn["stop"],
            tool_calls=tuple(
                ToolCall(
                    id=call["id"],
                    name=call["name"],
                    arguments=call["arguments"],
                )
                for call in turn["tool_calls"]
            ),
        )
        for turn in scenario["turns"]
    ]


def normalized_trace_fingerprint(events: list[dict[str, Any]]) -> str:
    normalized: list[dict[str, Any]] = []
    for source in events:
        event = deepcopy(source)
        event.pop("session_id", None)
        event.pop("timestamp", None)
        provenance = event.get("provenance", {})
        provenance.pop("run_id", None)
        normalized.append(event)
    wire = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256_text(wire)


def render_json(value: dict[str, Any]) -> str:
    return f"{json.dumps(value, ensure_ascii=False, indent=2)}\n"


def render_trace(events: list[dict[str, Any]]) -> str:
    return "".join(
        f"{json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n"
        for event in events
    )


def run_once(
    *,
    experiment: dict[str, Any],
    scenario: dict[str, Any],
    fixture_path: Path,
    repetition: int,
    fixture_sha256: str,
    trace_output_directory: Path,
) -> tuple[dict[str, Any], str]:
    run_id = f"{experiment['id']}-run-{repetition:03d}"
    session_id = f"{experiment['id']}-session-{repetition:03d}"
    subject = experiment["subjects"][0]
    start = parse_timestamp(scenario["run_started_at"]) + timedelta(
        seconds=scenario["repetition_interval_seconds"] * (repetition - 1)
    )

    with TemporaryDirectory(prefix="lah-experiment-") as temporary:
        workspace_path = Path(temporary) / "workspace"
        shutil.copytree(fixture_path, workspace_path)
        trace = TraceRecorder(
            session_id=session_id,
            start=start,
            provenance={
                "agent_id": subject["agent_id"],
                "snapshot_id": subject["snapshot_id"],
                "surface": subject["surface"],
                "harness_mode": experiment["mode"],
                "run_id": run_id,
                "experiment_id": experiment["id"],
                "model": subject["model"],
                "provider": subject.get("provider", "unknown"),
            },
        )
        runner = AgentRunner(
            model=ScriptedModel(build_turns(scenario)),
            trace=trace,
            tools=workspace_tool_registry(Workspace(workspace_path), allow_writes=False),
            system_prompt=scenario["system_prompt"],
            config=AgentConfig(
                agent_id=subject["agent_id"],
                model_id=subject["model"],
                max_turns=len(scenario["turns"]) + 1,
            ),
        )
        run_result = runner.run(scenario["prompt"])
        events = list(run_result.events)
        workspace_unchanged = sha256_directory(workspace_path) == fixture_sha256

    event_types = [event["type"] for event in events]
    tool_results = [event for event in events if event["type"] == "tool.result"]
    expected_tool = scenario["expected"]["tool_result"]
    matching_tool_result = any(
        event["payload"].get("ok") is True
        and event["payload"].get("tool") == expected_tool["tool"]
        and event["payload"].get("result", {}).get("path") == expected_tool["path"]
        and event["payload"].get("result", {}).get("content") == expected_tool["content"]
        for event in tool_results
    )
    request_positions = [index for index, event in enumerate(events) if event["type"] == "tool.request"]
    result_positions = [index for index, event in enumerate(events) if event["type"] == "tool.result"]
    request_before_result = bool(
        request_positions and result_positions and request_positions[0] < result_positions[0]
    )
    metrics = {
        "event-order-valid": event_types == scenario["expected"]["event_types"],
        "tool-result-recorded": matching_tool_result and request_before_result,
        "final-answer-match": run_result.final_text == scenario["expected"]["final_text"]
        and run_result.stop_reason == scenario["expected"]["stop_reason"],
        "fixture-unchanged": workspace_unchanged,
        "deterministic-replay": False,
    }
    trace_path = trace_output_directory / f"run-{repetition:03d}.trace.jsonl"
    record = {
        "run_id": run_id,
        "repetition": repetition,
        "status": "failed",
        "trace_path": trace_path.relative_to(ROOT).as_posix(),
        "event_count": len(events),
        "event_types": event_types,
        "final_text": run_result.final_text,
        "stop_reason": run_result.stop_reason,
        "metrics": metrics,
        "deterministic_fingerprint": normalized_trace_fingerprint(events),
        "redaction": {"status": "clean", "fields": []},
    }
    return record, render_trace(events)


def build_artifacts(experiment_id: str) -> dict[Path, str]:
    if not STABLE_ID_PATTERN.fullmatch(experiment_id):
        raise ExperimentError(f"invalid experiment ID: {experiment_id}")
    experiment_path = ROOT / "registry" / "experiments" / f"{experiment_id}.experiment.json"
    experiment = load_json(experiment_path)
    if experiment.get("id") != experiment_id:
        raise ExperimentError("experiment record identity does not match its filename")
    scenario_path = resolve_declared_path(
        experiment["scenario"]["path"],
        label="scenario path",
        within=ROOT / "labs" / "scenarios",
    )
    fixture_path = resolve_declared_path(
        experiment["fixture"]["path"],
        label="fixture path",
        within=ROOT / "labs" / "fixtures",
    )
    result_root = ROOT / "labs" / "results"
    trace_output_directory = resolve_declared_path(
        experiment["outputs"]["traces_path"],
        label="trace output path",
        within=result_root,
    )
    result_path = resolve_declared_path(
        experiment["outputs"]["results_path"],
        label="result output path",
        within=result_root,
    )
    if not experiment["outputs"].get("report_path"):
        raise ExperimentError("reference runner requires a declared report output path")
    report_path = resolve_declared_path(
        experiment["outputs"]["report_path"],
        label="report output path",
        within=result_root,
    )
    scenario = load_json(scenario_path)

    if scenario.get("experiment_id") != experiment_id or scenario.get("id") != experiment_id:
        raise ExperimentError("scenario identity does not match the experiment")
    fixture_sha256 = sha256_directory(fixture_path)
    if fixture_sha256 != experiment["fixture"]["sha256"]:
        raise ExperimentError(
            f"fixture digest mismatch: expected {experiment['fixture']['sha256']}, got {fixture_sha256}"
        )
    prompt_sha256 = sha256_text(scenario["prompt"])
    if prompt_sha256 != experiment["scenario"]["prompt_sha256"]:
        raise ExperimentError(
            f"prompt digest mismatch: expected {experiment['scenario']['prompt_sha256']}, got {prompt_sha256}"
        )
    if len(experiment["subjects"]) != 1:
        raise ExperimentError("reference runner currently requires exactly one subject")

    run_records: list[dict[str, Any]] = []
    artifacts: dict[Path, str] = {}
    for repetition in range(1, experiment["repetitions"] + 1):
        record, trace_text = run_once(
            experiment=experiment,
            scenario=scenario,
            fixture_path=fixture_path,
            repetition=repetition,
            fixture_sha256=fixture_sha256,
            trace_output_directory=trace_output_directory,
        )
        run_records.append(record)
        artifacts[ROOT / record["trace_path"]] = trace_text

    fingerprints = {record["deterministic_fingerprint"] for record in run_records}
    deterministic_replay = len(run_records) > 1 and len(fingerprints) == 1
    for record in run_records:
        record["metrics"]["deterministic-replay"] = deterministic_replay
        declared_metrics = experiment["metrics"]
        if set(record["metrics"]) != set(declared_metrics):
            raise ExperimentError("runner metrics do not match the experiment declaration")
        record["status"] = (
            "passed" if all(record["metrics"][metric] for metric in declared_metrics) else "failed"
        )

    successful_runs = sum(record["status"] == "passed" for record in run_records)
    criteria_passed = successful_runs == len(run_records)
    result = {
        "schema_version": "0.1.0",
        "experiment_id": experiment_id,
        "generated_at": scenario["result_generated_at"],
        "runner": {
            "id": RUNNER_ID,
            "version": RUNNER_VERSION,
            "command": f"python3 labs/runner.py {experiment_id} --check",
        },
        "status": "passed" if criteria_passed else "failed",
        "summary": {
            "total_runs": len(run_records),
            "successful_runs": successful_runs,
            "failed_runs": len(run_records) - successful_runs,
            "criteria_passed": criteria_passed,
        },
        "criteria": [
            {"statement": statement, "passed": criteria_passed}
            for statement in experiment["success_criteria"]
        ],
        "fixture_sha256": fixture_sha256,
        "prompt_sha256": prompt_sha256,
        "runs": run_records,
        "limitations": experiment["limitations"],
    }
    artifacts[result_path] = render_json(result)
    artifacts[report_path] = render_report(experiment, result)

    if sha256_directory(fixture_path) != fixture_sha256:
        raise ExperimentError("canonical fixture changed during the run")
    return artifacts


def render_report(experiment: dict[str, Any], result: dict[str, Any]) -> str:
    status = result["status"].upper()
    run_lines = "\n".join(
        f"- `{run['run_id']}`: {run['status']}, {run['event_count']} events, "
        f"fingerprint `{run['deterministic_fingerprint']}`"
        for run in result["runs"]
    )
    metric_lines = "\n".join(
        f"- `{metric}`: {'pass' if all(run['metrics'][metric] for run in result['runs']) else 'fail'}"
        for metric in experiment["metrics"]
    )
    limitation_lines = "\n".join(f"- {item}" for item in experiment["limitations"])
    return f"""# {experiment['title']}

- Status: `{status}`
- Mode: `{experiment['mode']}`
- Experiment: `{experiment['id']}`

## Question

{experiment['question']}

## Reproduction

```bash
python3 labs/runner.py {experiment['id']} --check
```

The command rebuilds the expected artifacts in memory and exits non-zero if a committed trace, result, fixture digest, prompt digest, or report differs.

## Result

{result['summary']['successful_runs']} of {result['summary']['total_runs']} repetitions passed all declared metrics.

{run_lines}

## Metrics

{metric_lines}

## Input digests

- Fixture: `{result['fixture_sha256']}`
- Prompt: `{result['prompt_sha256']}`

## Evidence boundary

{limitation_lines}
"""


def write_artifacts(artifacts: dict[Path, str]) -> None:
    for path, content in artifacts.items():
        if path.is_symlink():
            raise ExperimentError(f"refusing to overwrite symlink: {path.relative_to(ROOT)}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def check_artifacts(artifacts: dict[Path, str]) -> list[str]:
    mismatches: list[str] = []
    for path, expected in artifacts.items():
        if not path.is_file():
            mismatches.append(f"missing {path.relative_to(ROOT)}")
            continue
        if path.read_text(encoding="utf-8") != expected:
            mismatches.append(f"outdated {path.relative_to(ROOT)}")
    return mismatches


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment_id", help="Stable ID from registry/experiments")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Compare regenerated artifacts without writing files",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        artifacts = build_artifacts(args.experiment_id)
        if args.check:
            mismatches = check_artifacts(artifacts)
            if mismatches:
                print("EXPERIMENT_CHECK_FAILED")
                for mismatch in mismatches:
                    print(f"- {mismatch}")
                return 1
            print(f"EXPERIMENT_CHECK_OK {args.experiment_id} ({len(artifacts)} artifacts)")
            return 0
        write_artifacts(artifacts)
        print(f"EXPERIMENT_RUN_OK {args.experiment_id} ({len(artifacts)} artifacts)")
        return 0
    except ExperimentError as exc:
        print(f"EXPERIMENT_FAILED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
