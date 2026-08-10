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


CONTROLLED_EXPERIMENT_IDS = (
    "reference-tool-roundtrip-v1",
    "reference-stream-normalization-v1",
    "reference-context-budget-v1",
    "reference-session-replay-v1",
    "reference-context-compaction-v1",
    "reference-memory-retrieval-v1",
    "reference-approval-binding-v1",
    "reference-sandbox-network-v1",
    "reference-project-trust-v1",
    "reference-checkpoint-rollback-v1",
)


class ExperimentRunnerTests(unittest.TestCase):
    def test_experiment_id_cannot_escape_registry(self) -> None:
        with self.assertRaises(ExperimentError):
            build_artifacts("../../outside")

    def test_regeneration_matches_committed_artifacts(self) -> None:
        for experiment_id in CONTROLLED_EXPERIMENT_IDS:
            with self.subTest(experiment_id=experiment_id):
                artifacts = build_artifacts(experiment_id)
                self.assertEqual(check_artifacts(artifacts), [])
                self.assertEqual(len(artifacts), 4)

    def test_result_records_two_identical_normalized_runs(self) -> None:
        for experiment_id in CONTROLLED_EXPERIMENT_IDS:
            with self.subTest(experiment_id=experiment_id):
                artifacts = build_artifacts(experiment_id)
                result_path = ROOT / "labs/results" / experiment_id / "result.json"
                result = json.loads(artifacts[result_path])

                self.assertEqual(result["status"], "passed")
                self.assertEqual(result["summary"]["successful_runs"], 2)
                fingerprints = {
                    run["deterministic_fingerprint"] for run in result["runs"]
                }
                self.assertEqual(len(fingerprints), 1)
                for run in result["runs"]:
                    self.assertTrue(all(run["metrics"].values()))

    def test_fixture_digest_matches_experiment_declaration(self) -> None:
        for experiment_id in CONTROLLED_EXPERIMENT_IDS:
            with self.subTest(experiment_id=experiment_id):
                experiment = json.loads(
                    (
                        ROOT
                        / "registry/experiments"
                        / f"{experiment_id}.experiment.json"
                    ).read_text(encoding="utf-8")
                )
                fixture = ROOT / experiment["fixture"]["path"]
                self.assertEqual(
                    sha256_directory(fixture), experiment["fixture"]["sha256"]
                )

    def test_registry_has_exactly_ten_complete_controlled_reference_experiments(self) -> None:
        registered = set()
        for path in sorted((ROOT / "registry/experiments").glob("*.experiment.json")):
            experiment = json.loads(path.read_text(encoding="utf-8"))
            if (
                experiment["mode"] == "controlled"
                and experiment["status"] == "complete"
                and experiment["subjects"][0]["agent_id"] == "reference-harness"
            ):
                registered.add(experiment["id"])

        self.assertEqual(registered, set(CONTROLLED_EXPERIMENT_IDS))


if __name__ == "__main__":
    unittest.main()
