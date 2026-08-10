from __future__ import annotations

import json
import unittest
from pathlib import Path

from curriculum.golden import CASES, render_case, validate_render


ROOT = Path(__file__).resolve().parents[2]


class CourseContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = json.loads(
            (ROOT / "curriculum/catalog.json").read_text(encoding="utf-8")
        )
        cls.claim_ids = {
            json.loads(path.read_text(encoding="utf-8"))["id"]
            for path in (ROOT / "registry/claims").glob("*.claim.json")
        }

    def test_lessons_form_an_explicit_incremental_chain(self):
        previous_id = None
        for lesson in self.catalog["lessons"]:
            with self.subTest(lesson=lesson["id"]):
                contract = lesson["change_contract"]
                self.assertEqual(contract["previous_lesson_id"], previous_id)
                self.assertTrue(contract["adds"])
                self.assertTrue(contract["preserves"])
                previous_id = lesson["id"]

    def test_every_lesson_has_a_reproducible_golden_trace(self):
        self.assertEqual(
            set(CASES),
            {lesson["id"] for lesson in self.catalog["lessons"]},
        )
        for lesson in self.catalog["lessons"]:
            with self.subTest(lesson=lesson["id"]):
                expected, events = render_case(lesson["id"])
                self.assertEqual(validate_render(lesson, events), [])
                trace_path = ROOT / lesson["golden_trace"]["path"]
                self.assertEqual(trace_path.read_text(encoding="utf-8"), expected)

    def test_agent_bridges_resolve_claims_or_declare_a_gap(self):
        for lesson in self.catalog["lessons"]:
            with self.subTest(lesson=lesson["id"]):
                bridge = lesson["agent_bridge"]
                if bridge["relationship"] == "gap":
                    self.assertEqual(bridge["claim_ids"], [])
                else:
                    self.assertGreaterEqual(len(bridge["claim_ids"]), 1)
                self.assertTrue(set(bridge["claim_ids"]).issubset(self.claim_ids))

    def test_exercise_checks_are_safe_repository_commands(self):
        for lesson in self.catalog["lessons"]:
            check_ids = [check["id"] for check in lesson["exercise_checks"]]
            self.assertEqual(len(check_ids), len(set(check_ids)))
            for check in lesson["exercise_checks"]:
                with self.subTest(lesson=lesson["id"], check=check["id"]):
                    self.assertTrue(check["command"].startswith("python3 "))
                    self.assertNotIn("/Users/", check["command"])
                    self.assertNotIn("--allow-model-call", check["command"])


if __name__ == "__main__":
    unittest.main()
