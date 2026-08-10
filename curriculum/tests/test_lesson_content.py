from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REQUIRED_ANCHORS = (
    "learn",
    "problem",
    "mental-model",
    "build",
    "run",
    "failure-modes",
    "exercises",
    "deep-dive",
    "checkpoint",
)


class LongFormLessonContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = json.loads((ROOT / "curriculum/catalog.json").read_text())

    def test_every_lesson_is_a_bilingual_long_form_tutorial(self):
        for lesson in self.catalog["lessons"]:
            with self.subTest(lesson=lesson["id"]):
                self.assertGreaterEqual(lesson["estimated_minutes"], 20)
                self.assertIn(lesson["difficulty"], {"beginner", "intermediate", "advanced"})
                self.assertTrue((ROOT / lesson["code_path"]).is_file())

                localized_sources = {
                    locale: (ROOT / path).read_text(encoding="utf-8")
                    for locale, path in lesson["content_paths"].items()
                }
                for locale, source in localized_sources.items():
                    with self.subTest(lesson=lesson["id"], locale=locale):
                        minimum_characters = 6_000 if locale == "zh-CN" else 9_000
                        self.assertGreaterEqual(len(source), minimum_characters)
                        self.assertGreaterEqual(source.count("```") // 2, 5)
                        self.assertGreaterEqual(source.count("\n| ---"), 1)
                        self.assertGreaterEqual(source.count("\n> "), 2)
                        self.assertGreaterEqual(source.count("\n### "), 8)
                        for anchor in REQUIRED_ANCHORS:
                            self.assertIn(f"{{#{anchor}}}", source)

                anchor_sets = [
                    re.findall(r"\{#([a-z0-9-]+)\}", source)
                    for source in localized_sources.values()
                ]
                self.assertEqual(anchor_sets[0], anchor_sets[1])
                self.assertEqual(len(anchor_sets[0]), len(set(anchor_sets[0])))


if __name__ == "__main__":
    unittest.main()
