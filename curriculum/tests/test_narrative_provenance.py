from __future__ import annotations

import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
V02_CORE_MECHANISMS = {
    "context-budget",
    "context-compaction",
    "memory-retrieval",
    "execution-policy",
    "os-sandbox",
    "checkpoint-rollback",
}
VENDOR_PATTERNS = {
    "codex": re.compile(r"\bCodex\b"),
    "claude-code": re.compile(r"Claude Code"),
    "opencode": re.compile(r"OpenCode"),
    "grok-build": re.compile(r"Grok Build"),
    "pi": re.compile(r"\bPi\b"),
    "reasonix": re.compile(r"\bReasonix\b"),
}
GAP_MARKERS = {
    "en": ("unknown", "evidence gap", "without qualifying mapping", "missing mapping"),
    "zh": ("未知", "证据缺口", "没有合格映射", "缺映射"),
}


def load_records(directory: Path, suffix: str) -> dict[str, dict]:
    return {
        record["id"]: record
        for path in directory.glob(f"*.{suffix}.json")
        for record in [json.loads(path.read_text(encoding="utf-8"))]
    }


def mentioned_vendors(source: str) -> set[str]:
    return {
        agent_id
        for agent_id, pattern in VENDOR_PATTERNS.items()
        if pattern.search(source)
    }


def mention_has_gap_boundary(source: str, pattern: re.Pattern[str], locale: str) -> bool:
    lowered = source.lower()
    markers = tuple(marker.lower() for marker in GAP_MARKERS[locale])
    for match in pattern.finditer(source):
        context = lowered[max(0, match.start() - 240) : match.end() + 240]
        if not any(marker in context for marker in markers):
            return False
    return True


class NarrativeProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalog = json.loads(
            (ROOT / "curriculum/catalog.json").read_text(encoding="utf-8")
        )
        cls.lessons = {lesson["id"]: lesson for lesson in cls.catalog["lessons"]}
        cls.claims = load_records(ROOT / "registry/claims", "claim")
        cls.mechanisms = load_records(ROOT / "registry/mechanisms", "mechanism")
        cls.experiments = load_records(ROOT / "registry/experiments", "experiment")

    def test_vendor_statements_in_lessons_resolve_to_reviewed_claims(self) -> None:
        for lesson_id, lesson in self.lessons.items():
            sources = {
                "en": (ROOT / lesson["content_paths"]["en"]).read_text(
                    encoding="utf-8"
                ),
                "zh": (ROOT / lesson["content_paths"]["zh-CN"]).read_text(
                    encoding="utf-8"
                ),
            }
            mentions = {locale: mentioned_vendors(source) for locale, source in sources.items()}
            with self.subTest(lesson=lesson_id):
                self.assertEqual(mentions["en"], mentions["zh"])
                bridge = lesson["agent_bridge"]
                bridge_claims = [self.claims[claim_id] for claim_id in bridge["claim_ids"]]
                covered_agents = {claim["agent_id"] for claim in bridge_claims}
                self.assertTrue(mentions["en"].issubset(covered_agents))
                self.assertTrue(all(claim["status"] == "reviewed" for claim in bridge_claims))

    def test_vendor_statements_in_mechanisms_use_claims_or_explicit_gaps(self) -> None:
        for mechanism_id, mechanism in self.mechanisms.items():
            source_directory = ROOT / "content" / "mechanisms" / mechanism_id
            if not source_directory.is_dir():
                continue
            implementations = {
                item["agent_id"]: item for item in mechanism["agent_implementations"]
            }
            for locale in ("en", "zh"):
                path = source_directory / f"mechanism.{locale}.md"
                if not path.is_file():
                    continue
                source = path.read_text(encoding="utf-8")
                for agent_id in mentioned_vendors(source):
                    with self.subTest(
                        mechanism=mechanism_id, locale=locale, agent=agent_id
                    ):
                        implementation = implementations.get(agent_id)
                        if implementation is None:
                            self.assertTrue(
                                mention_has_gap_boundary(
                                    source, VENDOR_PATTERNS[agent_id], locale
                                ),
                                "vendor mention without a Claim must be bounded as an explicit evidence gap",
                            )
                            continue
                        claim_records = [
                            self.claims[claim_id]
                            for claim_id in implementation["claim_ids"]
                        ]
                        self.assertTrue(claim_records)
                        self.assertTrue(
                            all(
                                claim["agent_id"] == agent_id
                                and claim["mechanism_id"] == mechanism_id
                                and claim["status"] == "reviewed"
                                for claim in claim_records
                            )
                        )

    def test_core_reference_prose_resolves_to_runnable_lessons_and_experiments(
        self,
    ) -> None:
        for mechanism_id in V02_CORE_MECHANISMS:
            mechanism = self.mechanisms[mechanism_id]
            with self.subTest(mechanism=mechanism_id):
                self.assertTrue(mechanism["reference_lessons"])
                self.assertTrue(mechanism["experiments"])
                for lesson_id in mechanism["reference_lessons"]:
                    lesson = self.lessons[lesson_id]
                    self.assertTrue(lesson["run"].startswith("python3 "))
                    self.assertTrue((ROOT / lesson["golden_trace"]["path"]).is_file())
                for experiment_id in mechanism["experiments"]:
                    experiment = self.experiments[experiment_id]
                    self.assertEqual(experiment["mode"], "controlled")
                    self.assertEqual(experiment["status"], "complete")
                    self.assertEqual(
                        {subject["agent_id"] for subject in experiment["subjects"]},
                        {"reference-harness"},
                    )
                    self.assertTrue(
                        (ROOT / experiment["outputs"]["results_path"]).is_file()
                    )
                    self.assertTrue(
                        (ROOT / experiment["outputs"]["report_path"]).is_file()
                    )


if __name__ == "__main__":
    unittest.main()
