from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from labs.reproduce import (
    ROOT,
    ReproductionError,
    build_reproduction_report,
    main,
    render_report,
    verify_report_file,
)


CONTROLLED_EXPERIMENT = "reference-tool-roundtrip-v1"
PINNED_STATE = {
    "commit": "a" * 40,
    "tracked_worktree_clean": True,
}


class ReproductionReportTests(unittest.TestCase):
    def test_report_rebuilds_every_artifact_with_zero_model_calls(self) -> None:
        report = build_reproduction_report(
            CONTROLLED_EXPERIMENT,
            observed_at="2026-08-10T00:00:00Z",
            repository_state=PINNED_STATE,
        )

        self.assertEqual(report["outcome"], "reproduced")
        self.assertTrue(report["submission_ready"])
        self.assertEqual(report["execution"]["model_calls"], 0)
        self.assertFalse(report["execution"]["network_required"])
        self.assertEqual(report["execution"]["rebuilt_artifact_count"], 4)
        self.assertEqual(report["mismatches"], [])
        self.assertEqual(len(report["report_sha256"]), 64)
        self.assertTrue(all(check["status"] == "pass" for check in report["checks"]))

    def test_report_contains_no_repository_or_user_absolute_path(self) -> None:
        report = build_reproduction_report(
            CONTROLLED_EXPERIMENT,
            observed_at="2026-08-10T00:00:00Z",
            repository_state=PINNED_STATE,
        )
        wire = render_report(report)

        self.assertNotIn(str(ROOT), wire)
        self.assertNotRegex(wire, r"/(?:Users|home)/[^/\s]+")
        self.assertNotIn("remote", wire.lower())

    def test_dirty_source_state_is_not_comparable(self) -> None:
        report = build_reproduction_report(
            CONTROLLED_EXPERIMENT,
            observed_at="2026-08-10T00:00:00Z",
            repository_state={
                "commit": "b" * 40,
                "tracked_worktree_clean": False,
            },
        )

        self.assertEqual(report["outcome"], "not-comparable")
        self.assertFalse(report["submission_ready"])

    def test_native_experiment_cannot_be_relabelled_as_controlled_reproduction(self) -> None:
        experiment_id = "synthetic-native-boundary-v1"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / f"{experiment_id}.experiment.json").write_text(
                json.dumps(
                    {
                        "id": experiment_id,
                        "mode": "native",
                        "status": "draft",
                        "subjects": [{"agent_id": "reference-harness"}],
                    }
                ),
                encoding="utf-8",
            )
            with patch("labs.reproduce.EXPERIMENT_ROOT", root):
                with self.assertRaisesRegex(ReproductionError, "only complete Controlled"):
                    build_reproduction_report(
                        experiment_id,
                        observed_at="2026-08-10T00:00:00Z",
                        repository_state=PINNED_STATE,
                    )

    def test_cli_writes_a_new_report_and_refuses_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "reproduction.json"
            captured_stdout = io.StringIO()
            captured_stderr = io.StringIO()
            with patch("labs.reproduce.git_repository_state", return_value=PINNED_STATE):
                with redirect_stdout(captured_stdout), redirect_stderr(captured_stderr):
                    self.assertEqual(
                        main([CONTROLLED_EXPERIMENT, "--output", str(output)]), 0
                    )
                report = json.loads(output.read_text(encoding="utf-8"))
                self.assertEqual(report["outcome"], "reproduced")
                self.assertEqual(verify_report_file(output)["report_sha256"], report["report_sha256"])
                with redirect_stdout(captured_stdout), redirect_stderr(captured_stderr):
                    self.assertEqual(main(["--verify-report", str(output)]), 0)
                    self.assertEqual(
                        main([CONTROLLED_EXPERIMENT, "--output", str(output)]), 2
                    )

    def test_report_verifier_rejects_an_edited_report(self) -> None:
        report = build_reproduction_report(
            CONTROLLED_EXPERIMENT,
            observed_at="2026-08-10T00:00:00Z",
            repository_state=PINNED_STATE,
        )
        report["outcome"] = "failed"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "edited.json"
            path.write_text(render_report(report), encoding="utf-8")
            with self.assertRaisesRegex(ReproductionError, "digest does not match"):
                verify_report_file(path)


if __name__ == "__main__":
    unittest.main()
