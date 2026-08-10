from __future__ import annotations

import json
import unittest

from labs.runner import (
    ROOT,
    ExperimentError,
    build_artifacts,
    check_artifacts,
    sha256_directory,
)


EXPERIMENT_ID = "reference-tool-roundtrip-v1"


class ExperimentRunnerTests(unittest.TestCase):
    def test_experiment_id_cannot_escape_registry(self) -> None:
        with self.assertRaises(ExperimentError):
            build_artifacts("../../outside")

    def test_regeneration_matches_committed_artifacts(self) -> None:
        artifacts = build_artifacts(EXPERIMENT_ID)
        self.assertEqual(check_artifacts(artifacts), [])
        self.assertEqual(len(artifacts), 4)

    def test_result_records_two_identical_normalized_runs(self) -> None:
        artifacts = build_artifacts(EXPERIMENT_ID)
        result_path = ROOT / "labs/results" / EXPERIMENT_ID / "result.json"
        result = json.loads(artifacts[result_path])

        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["summary"]["successful_runs"], 2)
        fingerprints = {
            run["deterministic_fingerprint"] for run in result["runs"]
        }
        self.assertEqual(len(fingerprints), 1)
        for run in result["runs"]:
            self.assertEqual(run["event_count"], 9)
            self.assertTrue(all(run["metrics"].values()))

    def test_fixture_digest_matches_experiment_declaration(self) -> None:
        experiment = json.loads(
            (ROOT / "registry/experiments" / f"{EXPERIMENT_ID}.experiment.json").read_text(
                encoding="utf-8"
            )
        )
        fixture = ROOT / experiment["fixture"]["path"]
        self.assertEqual(sha256_directory(fixture), experiment["fixture"]["sha256"])


if __name__ == "__main__":
    unittest.main()
