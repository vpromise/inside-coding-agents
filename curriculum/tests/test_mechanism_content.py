from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
V02_CORE_MECHANISMS = (
    "context-budget",
    "context-compaction",
    "memory-retrieval",
    "execution-policy",
    "os-sandbox",
    "checkpoint-rollback",
)
REQUIRED_ANCHORS = (
    "definition",
    "reference",
    "engineering",
    "failure-modes",
    "safety",
    "comparison",
    "research",
    "exercise",
)


class MechanismContentTests(unittest.TestCase):
    def test_v02_core_mechanisms_are_bilingual_deep_dives(self):
        for mechanism_id in V02_CORE_MECHANISMS:
            localized_sources: dict[str, str] = {}
            for locale in ("zh", "en"):
                path = (
                    ROOT
                    / "content"
                    / "mechanisms"
                    / mechanism_id
                    / f"mechanism.{locale}.md"
                )
                with self.subTest(mechanism=mechanism_id, locale=locale):
                    self.assertTrue(path.is_file())
                    source = path.read_text(encoding="utf-8")
                    localized_sources[locale] = source
                    minimum_characters = 5_000 if locale == "zh" else 10_000
                    self.assertGreaterEqual(len(source), minimum_characters)
                    self.assertGreaterEqual(source.count("```") // 2, 8)
                    self.assertGreaterEqual(source.count("\n| ---"), 1)
                    self.assertGreaterEqual(source.count("\n> "), 3)
                    self.assertGreaterEqual(source.count("\n### "), 12)
                    for anchor in REQUIRED_ANCHORS:
                        self.assertIn(f"{{#{anchor}}}", source)

            anchor_sets = [
                re.findall(r"\{#([a-z0-9-]+)\}", localized_sources[locale])
                for locale in ("zh", "en")
            ]
            self.assertEqual(anchor_sets[0], anchor_sets[1])
            self.assertEqual(list(REQUIRED_ANCHORS), anchor_sets[0])

    def test_v02_core_layer_status_matches_published_articles(self):
        for mechanism_id in V02_CORE_MECHANISMS:
            path = (
                ROOT
                / "registry"
                / "mechanisms"
                / f"{mechanism_id}.mechanism.json"
            )
            record = json.loads(path.read_text(encoding="utf-8"))
            with self.subTest(mechanism=mechanism_id):
                self.assertEqual(
                    record["reader_layer_status"],
                    {layer: "complete" for layer in ("L0", "L1", "L2", "L3", "L4")},
                )


if __name__ == "__main__":
    unittest.main()
