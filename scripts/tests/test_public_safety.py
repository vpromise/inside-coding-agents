from __future__ import annotations

import unittest
from pathlib import Path

from scripts.check_public_safety import github_workflow_rule


WORKFLOW = Path(".github/workflows/ci.yml")


class GitHubWorkflowSafetyTests(unittest.TestCase):
    def test_accepts_immutable_action_commit(self) -> None:
        line = "uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1"
        self.assertIsNone(github_workflow_rule(WORKFLOW, line))

    def test_accepts_repository_local_action(self) -> None:
        self.assertIsNone(github_workflow_rule(WORKFLOW, "uses: ./actions/validate"))

    def test_rejects_moving_action_tag(self) -> None:
        self.assertEqual(
            github_workflow_rule(WORKFLOW, "uses: actions/checkout@v7"),
            "unpinned-github-action",
        )

    def test_rejects_pull_request_target(self) -> None:
        self.assertEqual(
            github_workflow_rule(WORKFLOW, "pull_request_target:"),
            "unsafe-pull-request-target",
        )

    def test_ignores_non_workflow_yaml(self) -> None:
        self.assertIsNone(
            github_workflow_rule(Path("docs/example.yml"), "uses: actions/checkout@v7")
        )


if __name__ == "__main__":
    unittest.main()
