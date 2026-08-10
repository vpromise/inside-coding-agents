#!/usr/bin/env python3
"""Check declared Agent snapshot freshness against the review window.

The check is intentionally offline and deterministic with ``--as-of``. It can
identify snapshots whose age contradicts a ``current`` declaration, but it
never edits Claims or infers an upstream breaking change.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import date, datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WINDOW_DAYS = 90
VALID_STATES = {"current", "needs-review", "stale", "historical"}


@dataclass(frozen=True)
class FreshnessAssessment:
    agent_id: str
    snapshot_id: str
    observed_at: str
    as_of: str
    age_days: int
    window_days: int
    declared_state: str
    computed_state: str
    review_due_at: str
    violation: str | None


def parse_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label} must be an ISO date") from error


def assess_snapshot(
    agent_id: str,
    snapshot: dict[str, Any],
    *,
    as_of: date,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> FreshnessAssessment:
    observed = parse_date(snapshot.get("observed_at"), "observed_at")
    declared = snapshot.get("freshness")
    if declared not in VALID_STATES:
        raise ValueError(f"invalid freshness state: {declared}")
    age_days = (as_of - observed).days
    due_ordinal = observed.toordinal() + window_days
    review_due = date.fromordinal(due_ordinal)

    violation = None
    if age_days < 0:
        computed = declared
        violation = "observation date is in the future"
    elif declared == "historical":
        computed = "historical"
    elif age_days > window_days:
        computed = "stale"
        if declared == "current":
            violation = (
                f"declared current but {age_days} days old; "
                f"review window is {window_days} days"
            )
    else:
        # Manual needs-review/stale signals may represent known upstream drift
        # and are deliberately more conservative than the age-only calculation.
        computed = declared

    return FreshnessAssessment(
        agent_id=agent_id,
        snapshot_id=snapshot["id"],
        observed_at=observed.isoformat(),
        as_of=as_of.isoformat(),
        age_days=age_days,
        window_days=window_days,
        declared_state=declared,
        computed_state=computed,
        review_due_at=review_due.isoformat(),
        violation=violation,
    )


def assess_registry(
    root: Path = ROOT,
    *,
    as_of: date,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> list[FreshnessAssessment]:
    assessments: list[FreshnessAssessment] = []
    for path in sorted((root / "registry/agents").glob("*.agent.json")):
        profile = json.loads(path.read_text(encoding="utf-8"))
        for snapshot in profile["snapshots"]:
            assessments.append(
                assess_snapshot(
                    profile["id"],
                    snapshot,
                    as_of=as_of,
                    window_days=window_days,
                )
            )
    if not assessments:
        raise ValueError("no Agent snapshots found")
    return assessments


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--as-of",
        default=datetime.now(timezone.utc).date().isoformat(),
        help="ISO date used for a deterministic assessment (default: UTC today)",
    )
    parser.add_argument("--window-days", type=int, default=DEFAULT_WINDOW_DAYS)
    parser.add_argument("--json", action="store_true", dest="as_json")
    arguments = parser.parse_args()
    if arguments.window_days < 1:
        parser.error("--window-days must be positive")

    try:
        as_of = parse_date(arguments.as_of, "--as-of")
        assessments = assess_registry(
            as_of=as_of,
            window_days=arguments.window_days,
        )
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"FRESHNESS_INVALID: {error}")
        return 2

    violations = [item for item in assessments if item.violation]
    counts = {
        state: sum(item.computed_state == state for item in assessments)
        for state in sorted(VALID_STATES)
    }
    if arguments.as_json:
        print(
            json.dumps(
                {
                    "as_of": as_of.isoformat(),
                    "window_days": arguments.window_days,
                    "status": "failed" if violations else "ok",
                    "counts": counts,
                    "assessments": [asdict(item) for item in assessments],
                },
                indent=2,
                sort_keys=True,
            )
        )
    elif violations:
        print(f"FRESHNESS_FAILED as_of={as_of.isoformat()} violations={len(violations)}")
        for item in violations:
            print(f"- {item.agent_id}/{item.snapshot_id}: {item.violation}")
    else:
        rendered_counts = " ".join(f"{key}={value}" for key, value in counts.items())
        print(
            f"FRESHNESS_OK as_of={as_of.isoformat()} "
            f"snapshots={len(assessments)} {rendered_counts}"
        )
    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
