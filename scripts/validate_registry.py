#!/usr/bin/env python3
"""Validate v0.1 schemas, content-graph references, traces, and links."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    print(
        "jsonschema is required. Run: uv run --no-project --with "
        "'jsonschema>=4.18,<5' python3 scripts/validate_registry.py",
        file=sys.stderr,
    )
    raise SystemExit(2)


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = ROOT / "registry" / "schemas"
ERRORS: list[str] = []
IGNORED_TREE_PARTS = {
    ".git",
    ".next",
    ".research",
    ".private",
    ".tasks",
    ".codex",
    "node_modules",
    "dist",
    "vendor-upstreams",
}


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        ERRORS.append(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
        return {}


def load_schema(filename: str) -> dict[str, Any]:
    path = SCHEMA_DIR / filename
    schema = load_json(path)
    try:
        Draft202012Validator.check_schema(schema)
    except Exception as exc:
        ERRORS.append(f"invalid schema {path.relative_to(ROOT)}: {exc}")
    return schema


SCHEMAS = {
    "agent": load_schema("agent-profile.schema.json"),
    "claim": load_schema("claim.schema.json"),
    "mechanism": load_schema("mechanism.schema.json"),
    "experiment": load_schema("experiment.schema.json"),
    "experiment_result": load_schema("experiment-result.schema.json"),
    "scenario": load_schema("lab-scenario.schema.json"),
    "trace": load_schema("trace-event.schema.json"),
    "curriculum": load_schema("curriculum-catalog.schema.json"),
}


def validate(instance: Any, schema_name: str, label: str) -> None:
    validator = Draft202012Validator(
        SCHEMAS[schema_name],
        format_checker=FormatChecker(),
    )
    for issue in sorted(validator.iter_errors(instance), key=lambda item: list(item.path)):
        location = ".".join(str(part) for part in issue.path) or "<root>"
        ERRORS.append(f"{label} at {location}: {issue.message}")


def load_entities(directory: str, suffix: str, schema_name: str) -> dict[str, dict[str, Any]]:
    entities: dict[str, dict[str, Any]] = {}
    for path in sorted((ROOT / directory).glob(f"*{suffix}")):
        value = load_json(path)
        validate(value, schema_name, str(path.relative_to(ROOT)))
        entity_id = value.get("id")
        if entity_id in entities:
            ERRORS.append(f"duplicate ID {entity_id} in {directory}")
        elif entity_id:
            entities[entity_id] = value
    return entities


def resolve_repo_path(raw_path: str, label: str) -> Path | None:
    if not raw_path or Path(raw_path).is_absolute():
        ERRORS.append(f"{label} must be a non-empty repository-relative path: {raw_path}")
        return None
    path = (ROOT / raw_path).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        ERRORS.append(f"{label} escapes the repository: {raw_path}")
        return None
    return path


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def sha256_directory(directory: Path) -> str | None:
    if not directory.is_dir():
        return None
    digest = hashlib.sha256()
    paths = sorted(path for path in directory.rglob("*") if path.is_file())
    if not paths:
        return None
    for path in paths:
        if path.is_symlink():
            ERRORS.append(
                f"fixture symlink is not allowed: {path.relative_to(ROOT)}"
            )
            return None
        digest.update(path.relative_to(directory).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def normalized_trace_fingerprint(events: list[dict[str, Any]]) -> str:
    normalized: list[dict[str, Any]] = []
    for source in events:
        event = dict(source)
        event.pop("session_id", None)
        event.pop("timestamp", None)
        provenance = dict(event.get("provenance", {}))
        provenance.pop("run_id", None)
        event["provenance"] = provenance
        normalized.append(event)
    wire = json.dumps(
        normalized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256_text(wire)


agents = load_entities("registry/agents", ".agent.json", "agent")
claims = load_entities("registry/claims", ".claim.json", "claim")
mechanisms = load_entities("registry/mechanisms", ".mechanism.json", "mechanism")
experiments = load_entities("registry/experiments", ".experiment.json", "experiment")

example_paths = {
    "agent": ROOT / "registry/examples/example-agent.agent.json",
    "claim": ROOT / "registry/examples/example-claim.claim.json",
    "mechanism": ROOT / "registry/examples/example-mechanism.mechanism.json",
    "experiment": ROOT / "registry/examples/example-experiment.experiment.json",
}
examples: dict[str, dict[str, Any]] = {}
for kind, path in example_paths.items():
    value = load_json(path)
    validate(value, kind, str(path.relative_to(ROOT)))
    examples[kind] = value

catalog_path = ROOT / "curriculum/catalog.json"
catalog = load_json(catalog_path)
validate(catalog, "curriculum", str(catalog_path.relative_to(ROOT)))

lessons = catalog.get("lessons", [])
lesson_ids = {lesson.get("id") for lesson in lessons}
lesson_numbers = [lesson.get("number") for lesson in lessons]
lesson_slugs = [lesson.get("slug") for lesson in lessons]
if len(lesson_ids) != len(lessons):
    ERRORS.append("curriculum lesson IDs are not unique")
if len(lesson_numbers) != len(set(lesson_numbers)):
    ERRORS.append("curriculum lesson numbers are not unique")
if len(lesson_slugs) != len(set(lesson_slugs)):
    ERRORS.append("curriculum lesson slugs are not unique")

for lesson in lessons:
    lesson_id = lesson.get("id")
    for mechanism_id in lesson.get("mechanism_ids", []):
        if mechanism_id not in mechanisms:
            ERRORS.append(f"lesson {lesson_id} references unknown mechanism {mechanism_id}")
    for path_value in lesson.get("content_paths", {}).values():
        if not (ROOT / path_value).is_file():
            ERRORS.append(f"lesson {lesson_id} content path does not exist: {path_value}")

snapshot_index: dict[str, tuple[str, dict[str, Any]]] = {}
for agent_id, agent in agents.items():
    for snapshot in agent.get("snapshots", []):
        snapshot_id = snapshot.get("id")
        if snapshot_id in snapshot_index:
            ERRORS.append(f"duplicate snapshot ID {snapshot_id}")
        elif snapshot_id:
            snapshot_index[snapshot_id] = (agent_id, snapshot)
        claims_path = snapshot.get("claims_path")
        if claims_path and not (ROOT / claims_path).is_file():
            ERRORS.append(f"snapshot {snapshot_id} claims_path does not exist: {claims_path}")

experiment_results: dict[str, dict[str, Any]] = {}
experiment_trace_roots: dict[str, Path] = {}
for experiment_id, experiment in experiments.items():
    subjects = experiment.get("subjects", [])
    for subject in subjects:
        agent_id = subject.get("agent_id")
        snapshot_id = subject.get("snapshot_id")
        if agent_id not in agents:
            ERRORS.append(f"experiment {experiment_id} references unknown agent {agent_id}")
            continue
        if snapshot_id not in snapshot_index or snapshot_index[snapshot_id][0] != agent_id:
            ERRORS.append(
                f"experiment {experiment_id} references unresolved snapshot {snapshot_id}"
            )
            continue
        snapshot = snapshot_index[snapshot_id][1]
        if subject.get("surface") != snapshot.get("surface"):
            ERRORS.append(
                f"experiment {experiment_id} subject surface {subject.get('surface')} "
                f"does not match snapshot {snapshot_id} surface {snapshot.get('surface')}"
            )

    fixture = experiment.get("fixture", {})
    fixture_path = resolve_repo_path(
        fixture.get("path", ""), f"experiment {experiment_id} fixture"
    )
    if fixture_path is not None:
        fixture_digest = sha256_directory(fixture_path)
        if fixture_digest is None:
            ERRORS.append(
                f"experiment {experiment_id} fixture is missing or empty: {fixture.get('path')}"
            )
        elif fixture_digest != fixture.get("sha256"):
            ERRORS.append(
                f"experiment {experiment_id} fixture digest mismatch: {fixture_digest}"
            )

    scenario_record = experiment.get("scenario", {})
    scenario_path = resolve_repo_path(
        scenario_record.get("path", ""), f"experiment {experiment_id} scenario"
    )
    if scenario_path is None or not scenario_path.is_file():
        ERRORS.append(
            f"experiment {experiment_id} scenario does not exist: {scenario_record.get('path')}"
        )
    else:
        scenario = load_json(scenario_path)
        validate(scenario, "scenario", str(scenario_path.relative_to(ROOT)))
        if scenario.get("id") != experiment_id or scenario.get("experiment_id") != experiment_id:
            ERRORS.append(f"experiment {experiment_id} scenario identity does not match")
        prompt_digest = sha256_text(scenario.get("prompt", ""))
        if prompt_digest != scenario_record.get("prompt_sha256"):
            ERRORS.append(
                f"experiment {experiment_id} prompt digest mismatch: {prompt_digest}"
            )

    outputs = experiment.get("outputs", {})
    traces_path = resolve_repo_path(
        outputs.get("traces_path", ""), f"experiment {experiment_id} traces output"
    )
    results_path = resolve_repo_path(
        outputs.get("results_path", ""), f"experiment {experiment_id} results output"
    )
    report_path_value = outputs.get("report_path")
    report_path = (
        resolve_repo_path(
            report_path_value, f"experiment {experiment_id} report output"
        )
        if report_path_value
        else None
    )
    if traces_path is not None:
        experiment_trace_roots[experiment_id] = traces_path
    if experiment.get("status") == "complete":
        if traces_path is None or not traces_path.exists():
            ERRORS.append(f"complete experiment {experiment_id} has no trace output")
        if results_path is None or not results_path.is_file():
            ERRORS.append(f"complete experiment {experiment_id} has no result output")
        else:
            result = load_json(results_path)
            validate(
                result,
                "experiment_result",
                str(results_path.relative_to(ROOT)),
            )
            experiment_results[experiment_id] = result
            if result.get("experiment_id") != experiment_id:
                ERRORS.append(f"experiment {experiment_id} result identity does not match")
            if result.get("fixture_sha256") != fixture.get("sha256"):
                ERRORS.append(f"experiment {experiment_id} result fixture digest does not match")
            if result.get("prompt_sha256") != scenario_record.get("prompt_sha256"):
                ERRORS.append(f"experiment {experiment_id} result prompt digest does not match")
            runs = result.get("runs", [])
            if len(runs) != experiment.get("repetitions"):
                ERRORS.append(
                    f"experiment {experiment_id} has {len(runs)} result runs, "
                    f"expected {experiment.get('repetitions')}"
                )
            declared_metrics = set(experiment.get("metrics", []))
            repetitions: list[int] = []
            for run in runs:
                repetitions.append(run.get("repetition"))
                if set(run.get("metrics", {})) != declared_metrics:
                    ERRORS.append(
                        f"experiment {experiment_id} run {run.get('run_id')} metrics "
                        "do not match the declaration"
                    )
                expected_status = (
                    "passed" if all(run.get("metrics", {}).values()) else "failed"
                )
                if run.get("status") != expected_status:
                    ERRORS.append(
                        f"experiment {experiment_id} run {run.get('run_id')} status is inconsistent"
                    )
            if sorted(repetitions) != list(range(1, len(runs) + 1)):
                ERRORS.append(f"experiment {experiment_id} result repetitions are inconsistent")
            successful_runs = sum(run.get("status") == "passed" for run in runs)
            summary = result.get("summary", {})
            if summary.get("total_runs") != len(runs):
                ERRORS.append(f"experiment {experiment_id} result total_runs is inconsistent")
            if summary.get("successful_runs") != successful_runs:
                ERRORS.append(
                    f"experiment {experiment_id} result successful_runs is inconsistent"
                )
            if summary.get("failed_runs") != len(runs) - successful_runs:
                ERRORS.append(f"experiment {experiment_id} result failed_runs is inconsistent")
            criteria_passed = all(
                criterion.get("passed") for criterion in result.get("criteria", [])
            )
            expected_passed = successful_runs == len(runs) and criteria_passed
            if summary.get("criteria_passed") != expected_passed:
                ERRORS.append(
                    f"experiment {experiment_id} result criteria_passed is inconsistent"
                )
            expected_result_status = "passed" if expected_passed else "failed"
            if result.get("status") != expected_result_status:
                ERRORS.append(f"experiment {experiment_id} result status is inconsistent")
        if report_path_value and (report_path is None or not report_path.is_file()):
            ERRORS.append(f"complete experiment {experiment_id} has no report output")

claims_by_snapshot: dict[str, set[str]] = defaultdict(set)
for claim_id, claim in claims.items():
    agent_id = claim.get("agent_id")
    snapshot_id = claim.get("snapshot_id")
    mechanism_id = claim.get("mechanism_id")
    if agent_id not in agents:
        ERRORS.append(f"claim {claim_id} references unknown agent {agent_id}")
    if snapshot_id not in snapshot_index or snapshot_index[snapshot_id][0] != agent_id:
        ERRORS.append(f"claim {claim_id} references unresolved snapshot {snapshot_id}")
    else:
        snapshot = snapshot_index[snapshot_id][1]
        if claim.get("surface") != snapshot.get("surface"):
            ERRORS.append(
                f"claim {claim_id} surface {claim.get('surface')} does not match "
                f"snapshot {snapshot_id} surface {snapshot.get('surface')}"
            )
        claims_by_snapshot[snapshot_id].add(claim_id)
    if mechanism_id not in mechanisms:
        ERRORS.append(f"claim {claim_id} references unknown mechanism {mechanism_id}")
    if claim.get("status") == "reviewed" and not claim.get("reviewers"):
        ERRORS.append(f"reviewed claim {claim_id} has no reviewers")
    for evidence in claim.get("evidence", []):
        trace_path = evidence.get("trace_path")
        if trace_path:
            resolved_trace = resolve_repo_path(
                trace_path, f"claim {claim_id} evidence trace"
            )
            if resolved_trace is None or not resolved_trace.is_file():
                ERRORS.append(f"claim {claim_id} evidence trace does not exist: {trace_path}")
        if evidence.get("type") == "reproduced" and evidence.get("experiment_id") not in experiments:
            ERRORS.append(
                f"claim {claim_id} references unknown experiment {evidence.get('experiment_id')}"
            )
        if evidence.get("type") == "source" and snapshot_id in snapshot_index:
            snapshot = snapshot_index[snapshot_id][1]
            source_ref = snapshot.get("source_ref")
            evidence_commit = evidence.get("commit")
            if not source_ref:
                ERRORS.append(f"source claim {claim_id} uses a snapshot without source_ref")
            elif evidence_commit != source_ref.get("commit"):
                ERRORS.append(
                    f"source claim {claim_id} commit does not match snapshot {snapshot_id}"
                )
            if evidence_commit and evidence_commit not in evidence.get("source_url", ""):
                ERRORS.append(f"source claim {claim_id} does not use a commit permalink")

for agent_id, agent in agents.items():
    if agent.get("coverage_tier") in {"A", "B"}:
        overview_stem = ROOT / "content" / "agents" / agent_id / "overview"
        for language in ("zh", "en"):
            path = overview_stem.with_suffix(f".{language}.md")
            if not path.is_file():
                ERRORS.append(f"Tier {agent.get('coverage_tier')} agent {agent_id} lacks {path.relative_to(ROOT)}")
    for snapshot in agent.get("snapshots", []):
        snapshot_id = snapshot.get("id")
        claims_path = snapshot.get("claims_path")
        if claims_path and claims_path.endswith(".claim.json") and (ROOT / claims_path).is_file():
            anchor = load_json(ROOT / claims_path)
            if anchor.get("snapshot_id") != snapshot_id or anchor.get("agent_id") != agent_id:
                ERRORS.append(
                    f"snapshot {snapshot_id} claims_path does not point to one of its claims"
                )
        if agent.get("coverage_tier") in {"A", "B"}:
            analysis_stem = ROOT / "content" / "agents" / agent_id / "snapshots" / snapshot_id / "analysis"
            for language in ("zh", "en"):
                path = analysis_stem.with_suffix(f".{language}.md")
                if not path.is_file():
                    ERRORS.append(f"snapshot {snapshot_id} lacks {path.relative_to(ROOT)}")

known_experiments = set(experiments)
example_experiment_id = examples.get("experiment", {}).get("id")
if example_experiment_id:
    known_experiments.add(example_experiment_id)
claim_reference_count: dict[str, int] = defaultdict(int)
for mechanism_id, mechanism in mechanisms.items():
    for prerequisite in mechanism.get("prerequisites", []):
        if prerequisite not in mechanisms:
            ERRORS.append(f"mechanism {mechanism_id} has unknown prerequisite {prerequisite}")
    for lesson_id in mechanism.get("reference_lessons", []):
        if lesson_id not in lesson_ids:
            ERRORS.append(f"mechanism {mechanism_id} references unknown lesson {lesson_id}")
    for experiment_id in mechanism.get("experiments", []):
        if experiment_id not in known_experiments:
            ERRORS.append(f"mechanism {mechanism_id} references unknown experiment {experiment_id}")
    for implementation in mechanism.get("agent_implementations", []):
        agent_id = implementation.get("agent_id")
        snapshot_id = implementation.get("snapshot_id")
        if agent_id not in agents:
            ERRORS.append(f"mechanism {mechanism_id} references unknown agent {agent_id}")
        if snapshot_id not in snapshot_index or snapshot_index[snapshot_id][0] != agent_id:
            ERRORS.append(f"mechanism {mechanism_id} references unresolved snapshot {snapshot_id}")
        for claim_id in implementation.get("claim_ids", []):
            if claim_id not in claims or claims[claim_id].get("mechanism_id") != mechanism_id:
                ERRORS.append(f"mechanism {mechanism_id} references unresolved claim {claim_id}")
                continue
            claim_reference_count[claim_id] += 1
            claim = claims[claim_id]
            if claim.get("agent_id") != agent_id or claim.get("snapshot_id") != snapshot_id:
                ERRORS.append(
                    f"mechanism {mechanism_id} implementation identity does not match claim {claim_id}"
                )

for claim_id, claim in claims.items():
    if claim.get("status") == "reviewed" and claim_reference_count[claim_id] != 1:
        ERRORS.append(
            f"reviewed claim {claim_id} must appear in exactly one mechanism implementation; "
            f"found {claim_reference_count[claim_id]}"
        )

required_tier_a_categories = {
    "loop",
    "context",
    "tools",
    "safety",
    "reliability",
    "extensibility",
    "orchestration",
    "interfaces",
    "observability",
}
for agent_id, agent in agents.items():
    current_snapshot_ids = {
        snapshot.get("id")
        for snapshot in agent.get("snapshots", [])
        if snapshot.get("freshness") == "current"
    }
    current_claims = [
        claim
        for claim in claims.values()
        if claim.get("agent_id") == agent_id
        and claim.get("snapshot_id") in current_snapshot_ids
        and claim.get("status") == "reviewed"
    ]
    if agent.get("coverage_tier") in {"A", "B"} and not current_claims:
        ERRORS.append(f"Tier {agent.get('coverage_tier')} agent {agent_id} has no reviewed current claim")
    if agent.get("coverage_tier") != "A":
        continue
    categories = {
        mechanisms[claim["mechanism_id"]]["category"]
        for claim in current_claims
        if claim.get("mechanism_id") in mechanisms
    }
    missing_categories = sorted(required_tier_a_categories - categories)
    if missing_categories:
        ERRORS.append(f"Tier A agent {agent_id} lacks reviewed categories: {', '.join(missing_categories)}")
    if not any(snapshot.get("source_ref") for snapshot in agent.get("snapshots", [])):
        ERRORS.append(f"Tier A agent {agent_id} has no pinned source snapshot")
    reproduced = [
        evidence
        for claim in current_claims
        for evidence in claim.get("evidence", [])
        if evidence.get("type") == "reproduced"
        and evidence.get("experiment_id") in experiments
    ]
    if not reproduced:
        ERRORS.append(f"Tier A agent {agent_id} has no reproduced evidence from a real experiment")


def validate_trace(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except Exception as exc:
            ERRORS.append(f"invalid JSONL {path.relative_to(ROOT)}:{line_number}: {exc}")
            continue
        validate(event, "trace", f"{path.relative_to(ROOT)}:{line_number}")
        events.append(event)

    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        group = (
            event.get("session_id", ""),
            event.get("provenance", {}).get("run_id", ""),
        )
        groups[group].append(event)
    for group, group_events in groups.items():
        sequences = [event.get("sequence") for event in group_events]
        if sequences != list(range(len(group_events))):
            ERRORS.append(f"trace {path.relative_to(ROOT)} group {group} has invalid sequence order")
        seen: set[str] = set()
        for event in group_events:
            parent = event.get("parent_event_id")
            if parent and parent not in seen:
                ERRORS.append(
                    f"trace {path.relative_to(ROOT)} event {event.get('event_id')} "
                    f"has unresolved prior parent {parent}"
                )
            event_id = event.get("event_id")
            if event_id in seen:
                ERRORS.append(f"trace {path.relative_to(ROOT)} repeats event_id {event_id}")
            if event_id:
                seen.add(event_id)
    return events


trace_paths = sorted((ROOT / "registry/examples").glob("*.jsonl"))
trace_paths.extend(sorted((ROOT / "labs/results").rglob("*.trace.jsonl")))
trace_events_by_path = {
    str(path.relative_to(ROOT)): validate_trace(path) for path in trace_paths
}
trace_event_count = sum(len(events) for events in trace_events_by_path.values())

for experiment_id, result in experiment_results.items():
    subjects = experiments[experiment_id].get("subjects", [])
    trace_root = experiment_trace_roots.get(experiment_id)
    for run in result.get("runs", []):
        trace_path_value = run.get("trace_path", "")
        trace_path = resolve_repo_path(
            trace_path_value,
            f"experiment {experiment_id} run {run.get('run_id')} trace",
        )
        if trace_path is None:
            continue
        if trace_root is not None:
            try:
                if trace_root.is_dir():
                    trace_path.relative_to(trace_root)
                elif trace_path != trace_root:
                    raise ValueError
            except ValueError:
                ERRORS.append(
                    f"experiment {experiment_id} run trace is outside declared traces_path: "
                    f"{trace_path_value}"
                )
        events = trace_events_by_path.get(trace_path_value)
        if events is None:
            ERRORS.append(
                f"experiment {experiment_id} run trace is missing or undiscovered: {trace_path_value}"
            )
            continue
        if len(events) != run.get("event_count"):
            ERRORS.append(
                f"experiment {experiment_id} run {run.get('run_id')} event_count is inconsistent"
            )
        event_types = [event.get("type") for event in events]
        if event_types != run.get("event_types"):
            ERRORS.append(
                f"experiment {experiment_id} run {run.get('run_id')} event_types are inconsistent"
            )
        for event in events:
            provenance = event.get("provenance", {})
            identity = (
                provenance.get("agent_id"),
                provenance.get("snapshot_id"),
                provenance.get("surface"),
            )
            matching_subjects = [
                subject
                for subject in subjects
                if identity
                == (
                    subject.get("agent_id"),
                    subject.get("snapshot_id"),
                    subject.get("surface"),
                )
            ]
            if not matching_subjects:
                ERRORS.append(
                    f"experiment {experiment_id} trace {trace_path_value} has unknown subject identity"
                )
            elif not any(
                provenance.get("model") == subject.get("model")
                and provenance.get("provider", "unknown")
                == subject.get("provider", "unknown")
                for subject in matching_subjects
            ):
                ERRORS.append(
                    f"experiment {experiment_id} trace {trace_path_value} has wrong model/provider provenance"
                )
            if provenance.get("experiment_id") != experiment_id:
                ERRORS.append(
                    f"experiment {experiment_id} trace {trace_path_value} has wrong experiment provenance"
                )
            if provenance.get("run_id") != run.get("run_id"):
                ERRORS.append(
                    f"experiment {experiment_id} trace {trace_path_value} has wrong run provenance"
                )
            if provenance.get("harness_mode") != experiments[experiment_id].get("mode"):
                ERRORS.append(
                    f"experiment {experiment_id} trace {trace_path_value} has wrong harness mode"
                )
        fingerprint = normalized_trace_fingerprint(events)
        if fingerprint != run.get("deterministic_fingerprint"):
            ERRORS.append(
                f"experiment {experiment_id} run {run.get('run_id')} fingerprint is inconsistent"
            )

for claim_id, claim in claims.items():
    for evidence in claim.get("evidence", []):
        if evidence.get("type") != "reproduced":
            continue
        trace_path_value = evidence.get("trace_path", "")
        events = trace_events_by_path.get(trace_path_value, [])
        experiment_id = evidence.get("experiment_id")
        if events and any(
            event.get("provenance", {}).get("experiment_id") != experiment_id
            for event in events
        ):
            ERRORS.append(
                f"claim {claim_id} reproduced trace provenance does not match experiment {experiment_id}"
            )

link_pattern = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")
link_count = 0
for markdown_path in sorted(ROOT.rglob("*.md")):
    if any(part in IGNORED_TREE_PARTS for part in markdown_path.relative_to(ROOT).parts):
        continue
    markdown = markdown_path.read_text(encoding="utf-8")
    for raw_target in link_pattern.findall(markdown):
        target = raw_target.strip()
        if target.startswith("<") and target.endswith(">"):
            target = target[1:-1]
        target = target.split("#", 1)[0]
        if not target or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target):
            continue
        link_count += 1
        resolved = (markdown_path.parent / target).resolve()
        try:
            resolved.relative_to(ROOT)
        except ValueError:
            ERRORS.append(f"link escapes repository: {markdown_path.relative_to(ROOT)} -> {raw_target}")
            continue
        if not resolved.exists():
            ERRORS.append(f"broken link: {markdown_path.relative_to(ROOT)} -> {raw_target}")

if ERRORS:
    print("VALIDATION_FAILED")
    for error in ERRORS:
        print(f"- {error}")
    raise SystemExit(1)

print("VALIDATION_OK")
print(f"schemas={len(SCHEMAS)}")
print(
    f"agents={len(agents)} claims={len(claims)} "
    f"mechanisms={len(mechanisms)} experiments={len(experiments)}"
)
print(
    f"lessons={len(lesson_ids)} trace_files={len(trace_paths)} "
    f"trace_events={trace_event_count}"
)
print(f"markdown_links={link_count}")
