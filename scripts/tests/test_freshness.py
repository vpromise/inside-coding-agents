from __future__ import annotations

from datetime import date
import unittest

from scripts.check_freshness import assess_snapshot


class FreshnessTests(unittest.TestCase):
    def snapshot(self, freshness: str = "current", observed_at: str = "2026-08-10"):
        return {
            "id": "example-2026-08-10-source",
            "observed_at": observed_at,
            "freshness": freshness,
        }

    def test_current_snapshot_inside_window_passes(self) -> None:
        result = assess_snapshot(
            "example",
            self.snapshot(),
            as_of=date(2026, 11, 8),
        )

        self.assertEqual(result.age_days, 90)
        self.assertEqual(result.computed_state, "current")
        self.assertIsNone(result.violation)

    def test_current_snapshot_outside_window_requires_review(self) -> None:
        result = assess_snapshot(
            "example",
            self.snapshot(),
            as_of=date(2026, 11, 9),
        )

        self.assertEqual(result.computed_state, "stale")
        self.assertIn("declared current", result.violation or "")

    def test_manual_warning_is_preserved_inside_window(self) -> None:
        result = assess_snapshot(
            "example",
            self.snapshot(freshness="needs-review"),
            as_of=date(2026, 8, 11),
        )

        self.assertEqual(result.computed_state, "needs-review")
        self.assertIsNone(result.violation)

    def test_historical_snapshot_is_not_reclassified(self) -> None:
        result = assess_snapshot(
            "example",
            self.snapshot(freshness="historical", observed_at="2020-01-01"),
            as_of=date(2026, 8, 10),
        )

        self.assertEqual(result.computed_state, "historical")
        self.assertIsNone(result.violation)

    def test_future_observation_fails(self) -> None:
        result = assess_snapshot(
            "example",
            self.snapshot(observed_at="2026-08-11"),
            as_of=date(2026, 8, 10),
        )

        self.assertIn("future", result.violation or "")


if __name__ == "__main__":
    unittest.main()
