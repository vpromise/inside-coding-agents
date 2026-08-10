"""Generate and verify the deterministic Golden Trace for every lesson.

The committed JSONL files are executable course contracts, not hand-authored
screenshots.  Each one must be reproducible from the same demo that learners
run locally.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from curriculum.harness import AgentRunner, TraceRecorder
from curriculum.lessons.s01_agent_loop.demo import build_demo as build_s01
from curriculum.lessons.s02_events_streaming.demo import build_demo as build_s02
from curriculum.lessons.s03_tool_dispatch.demo import build_demo as build_s03
from curriculum.lessons.s04_workspace_tools.demo import build_demo as build_s04
from curriculum.lessons.s05_instructions.demo import build_demo as build_s05
from curriculum.lessons.s06_context_budget.demo import build_demo as build_s06


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class GoldenCase:
    build: Callable[[], tuple[AgentRunner, TraceRecorder]]
    prompt: str


CASES: dict[str, GoldenCase] = {
    "s01-agent-loop": GoldenCase(
        build=build_s01,
        prompt="Explain an agent loop in one sentence.",
    ),
    "s02-events-streaming": GoldenCase(
        build=build_s02,
        prompt="Stream one observability rule.",
    ),
    "s03-tool-dispatch": GoldenCase(
        build=build_s03,
        prompt="Use the echo tool, then report its result.",
    ),
    "s04-workspace-tools": GoldenCase(
        build=build_s04,
        prompt="Read the fixture README and summarize it.",
    ),
    "s05-instructions": GoldenCase(
        build=build_s05,
        prompt="State the two instructions you will follow.",
    ),
    "s06-context-budget": GoldenCase(
        build=build_s06,
        prompt="Fetch the large result, then explain the budget behavior.",
    ),
}


def load_catalog() -> dict:
    return json.loads((ROOT / "curriculum/catalog.json").read_text(encoding="utf-8"))


def lesson_records() -> dict[str, dict]:
    return {lesson["id"]: lesson for lesson in load_catalog()["lessons"]}


def render_case(lesson_id: str) -> tuple[str, tuple[dict, ...]]:
    case = CASES[lesson_id]
    runner, trace = case.build()
    result = runner.run(case.prompt)
    if result.stop_reason != "completed":
        raise ValueError(f"{lesson_id} stopped with {result.stop_reason}")
    if tuple(trace.events) != result.events:
        raise ValueError(f"{lesson_id} returned events that differ from its recorder")
    return f"{trace.as_jsonl()}\n", result.events


def validate_render(lesson: dict, events: tuple[dict, ...]) -> list[str]:
    trace_contract = lesson["golden_trace"]
    errors: list[str] = []
    if len(events) != trace_contract["expected_event_count"]:
        errors.append(
            f"expected {trace_contract['expected_event_count']} events, observed {len(events)}"
        )
    observed_types = {event["type"] for event in events}
    for event_type in trace_contract["focus_event_types"]:
        if event_type not in observed_types:
            errors.append(f"focus event is missing: {event_type}")
    if any(
        event.get("provenance", {}).get("run_id") != trace_contract["run_id"]
        for event in events
    ):
        errors.append("run_id does not match the catalog contract")
    if [event.get("sequence") for event in events] != list(range(len(events))):
        errors.append("event sequence is not contiguous")
    if any("chain_of_thought" in event.get("payload", {}) for event in events):
        errors.append("trace contains forbidden hidden reasoning")
    return errors


def selected_lessons(lesson_id: str | None) -> list[dict]:
    records = lesson_records()
    if lesson_id is not None:
        if lesson_id not in records or lesson_id not in CASES:
            raise KeyError(f"unknown executable lesson: {lesson_id}")
        return [records[lesson_id]]
    missing_cases = sorted(set(records) - set(CASES))
    if missing_cases:
        raise KeyError(f"missing GoldenCase definitions: {', '.join(missing_cases)}")
    return [records[key] for key in records]


def refresh(lesson_id: str | None = None) -> int:
    for lesson in selected_lessons(lesson_id):
        text, events = render_case(lesson["id"])
        errors = validate_render(lesson, events)
        if errors:
            raise ValueError(f"{lesson['id']}: {'; '.join(errors)}")
        path = ROOT / lesson["golden_trace"]["path"]
        path.write_text(text, encoding="utf-8")
        print(f"GOLDEN_TRACE_REFRESHED lesson={lesson['id']} events={len(events)}")
    return 0


def verify(lesson_id: str | None = None) -> int:
    failed = False
    for lesson in selected_lessons(lesson_id):
        expected, events = render_case(lesson["id"])
        path = ROOT / lesson["golden_trace"]["path"]
        errors = validate_render(lesson, events)
        if not path.is_file():
            errors.append(f"committed trace is missing: {path.relative_to(ROOT)}")
        elif path.read_text(encoding="utf-8") != expected:
            errors.append("committed trace differs from the executable demo")
        if errors:
            failed = True
            print(f"GOLDEN_TRACE_DRIFT lesson={lesson['id']}")
            for error in errors:
                print(f"- {error}")
        else:
            print(f"GOLDEN_TRACE_OK lesson={lesson['id']} events={len(events)}")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("verify", "refresh"))
    parser.add_argument("lesson_id", nargs="?")
    arguments = parser.parse_args()
    try:
        return verify(arguments.lesson_id) if arguments.action == "verify" else refresh(arguments.lesson_id)
    except (KeyError, ValueError) as error:
        print(f"GOLDEN_TRACE_INVALID: {error}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
