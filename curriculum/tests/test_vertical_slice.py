from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from curriculum.harness import (
    ApprovalGate,
    ApprovalPolicy,
    ApprovalRule,
    CapabilityRequest,
    CheckpointError,
    SessionJournal,
    SkillCatalog,
    Workspace,
    WorkspaceIdentity,
    discover_instructions,
)
from curriculum.harness.sandbox import NetworkEndpoint, SandboxDenied
from curriculum.harness.tools import ToolValidationError
from curriculum.lessons.s01_agent_loop.demo import build_demo as build_s01
from curriculum.lessons.s02_events_streaming.demo import build_demo as build_s02
from curriculum.lessons.s03_tool_dispatch.demo import build_demo as build_s03
from curriculum.lessons.s04_workspace_tools.demo import build_demo as build_s04
from curriculum.lessons.s05_instructions.demo import build_demo as build_s05
from curriculum.lessons.s06_context_budget.demo import build_demo as build_s06
from curriculum.lessons.s07_session_replay.demo import build_demo as build_s07
from curriculum.lessons.s08_context_compaction.demo import build_demo as build_s08
from curriculum.lessons.s09_memory_skills.demo import build_demo as build_s09
from curriculum.lessons.s10_approval_policy.demo import build_demo as build_s10
from curriculum.lessons.s11_sandbox_network.demo import build_demo as build_s11
from curriculum.lessons.s12_project_trust.demo import build_demo as build_s12
from curriculum.lessons.s13_checkpoint_rollback.demo import build_demo as build_s13


class VerticalSliceTests(unittest.TestCase):
    def run_demo(self, builder, prompt: str):
        runner, trace = builder()
        result = runner.run(prompt)
        self.assertEqual(result.stop_reason, "completed")
        self.assertEqual(
            [event["sequence"] for event in result.events],
            list(range(len(result.events))),
        )
        for line in trace.as_jsonl().splitlines():
            parsed = json.loads(line)
            self.assertEqual(parsed["trace_version"], "0.1.0")
            self.assertNotIn("chain_of_thought", parsed["payload"])
        return result

    def test_s01_minimal_loop(self):
        result = self.run_demo(build_s01, "Explain the loop.")
        self.assertIn("harness", result.final_text)
        self.assertEqual(result.events[-1]["type"], "session.stop")

    def test_s02_streaming_becomes_events(self):
        result = self.run_demo(build_s02, "Stream it.")
        responses = [event for event in result.events if event["type"] == "model.response"]
        self.assertEqual(len(responses), 3)
        self.assertTrue(responses[-1]["payload"]["final"])

    def test_s03_tool_roundtrip(self):
        result = self.run_demo(build_s03, "Use echo.")
        event_types = [event["type"] for event in result.events]
        self.assertLess(event_types.index("tool.request"), event_types.index("tool.result"))
        tool_messages = [message for message in result.messages if message.role == "tool"]
        self.assertEqual(json.loads(tool_messages[0].content), {"echo": "hello"})

    def test_s04_workspace_read(self):
        result = self.run_demo(build_s04, "Read it.")
        tool_result = next(event for event in result.events if event["type"] == "tool.result")
        self.assertTrue(tool_result["payload"]["ok"])

    def test_workspace_rejects_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            workspace = Workspace(directory)
            with self.assertRaises(ToolValidationError):
                workspace.resolve("../outside.txt")

    def test_s05_root_to_leaf_instructions(self):
        result = self.run_demo(build_s05, "Read instructions.")
        system = result.messages[0].content
        self.assertLess(system.index("Workspace instructions"), system.index("Package instructions"))

    def test_instruction_discovery_rejects_external_cwd(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            with self.assertRaises(ValueError):
                discover_instructions(root, outside)

    def test_s06_truncates_and_prunes(self):
        result = self.run_demo(build_s06, "Respect the budget.")
        tool_result = next(event for event in result.events if event["type"] == "tool.result")
        self.assertTrue(tool_result["payload"]["truncated"])
        self.assertIn("context.prune", [event["type"] for event in result.events])

    def test_s07_replays_and_branches(self):
        runner, trace = build_s07()
        result = runner.run("Replay it.")
        self.assertEqual(result.stop_reason, "completed")
        self.assertEqual(runner.replay_state.stop_reason, "completed")
        self.assertEqual(runner.branch_record.fork_sequence, 2)
        self.assertEqual(len(runner.branch_record.inherited_event_ids), 3)
        self.assertEqual(
            [event["type"] for event in result.events[-2:]],
            ["session.replay", "session.branch"],
        )
        corrupted = [dict(event) for event in result.events[:3]]
        corrupted[-1]["sequence"] = 4
        with self.assertRaises(ValueError):
            SessionJournal(corrupted)
        self.assertEqual(len(trace.events), 7)

    def test_s08_compacts_with_provenance(self):
        runner, _ = build_s08()
        result = runner.run("Compact it.")
        compact = next(event for event in result.events if event["type"] == "context.compact")
        self.assertLess(compact["payload"]["final_chars"], compact["payload"]["original_chars"])
        self.assertEqual(len(compact["payload"]["source_sha256"]), 64)
        second_request = runner.model.requests[1]
        self.assertTrue(any("[compacted checkpoint]" in message.content for message in second_request))

    def test_s09_retrieves_memory_and_loads_skill(self):
        result = self.run_demo(build_s09, "Retrieve it.")
        event_types = [event["type"] for event in result.events]
        self.assertEqual(event_types.count("memory.read"), 1)
        self.assertEqual(event_types.count("skill.load"), 1)
        memory_event = next(event for event in result.events if event["type"] == "memory.read")
        self.assertEqual(memory_event["payload"]["sources"], ["AGENTS.md#testing"])
        with self.assertRaises(KeyError):
            SkillCatalog().load("missing")

    def test_s10_binds_approval_to_the_exact_action(self):
        runner, _ = build_s10()
        self.addCleanup(runner.fixture.cleanup)
        result = runner.run("Approve the bounded write.")
        approval_events = [
            event for event in result.events if event["type"].startswith("approval.")
        ]
        self.assertEqual(
            [event["type"] for event in approval_events],
            ["approval.request", "approval.decision"],
        )
        self.assertEqual(approval_events[-1]["payload"]["outcome"], "allow")
        self.assertEqual(approval_events[-1]["payload"]["grant_scope"], "once")
        self.assertEqual(
            runner.workspace.read_file("approved.txt")["content"],
            "bounded change\n",
        )
        changed = runner.approval_gate.request(
            "write_file",
            {"path": "approved.txt", "content": "different\n"},
        )
        self.assertNotEqual(
            approval_events[-1]["payload"]["request_fingerprint"],
            changed.request.fingerprint,
        )
        fail_closed = ApprovalGate(ApprovalPolicy((), default_effect="ask"))
        self.assertFalse(
            fail_closed.resolve(fail_closed.request("write_file", {})).allowed
        )
        mutating_gate = ApprovalGate(
            ApprovalPolicy(
                (
                    ApprovalRule(
                        id="ask-mutation-test",
                        tool_names=("write_file",),
                        effect="ask",
                        reason="test",
                    ),
                )
            ),
            approver=lambda request, rule: (
                request.arguments.update({"content": "mutated"}) or True
            ),
        )
        pending = mutating_gate.request("write_file", {"content": "original"})
        self.assertFalse(mutating_gate.resolve(pending).allowed)

    def test_s11_denies_unlisted_network_before_backend_execution(self):
        runner, _ = build_s11()
        result = runner.run("Use the bounded network profile.")
        self.assertEqual(len(runner.sandbox_backend.calls), 1)
        self.assertIn("sandbox.configure", [event["type"] for event in result.events])
        self.assertIn("network.decision", [event["type"] for event in result.events])
        denied_request = CapabilityRequest(
            command="fetch-package-metadata",
            network_destinations=(NetworkEndpoint.parse("evil.example:443"),),
        )
        denied_plan = runner.sandbox_controller.plan(denied_request)
        self.assertFalse(denied_plan.allowed)
        with self.assertRaises(SandboxDenied):
            runner.sandbox_controller.execute(denied_plan, {})
        self.assertEqual(len(runner.sandbox_backend.calls), 1)

    def test_s12_keeps_untrusted_data_out_of_instruction_authority(self):
        runner, _ = build_s12()
        result = runner.run("Treat external content as data.")
        self.assertEqual(
            runner.compiled.accepted_sources,
            ("platform-safety", "project-agents"),
        )
        self.assertEqual(
            runner.compiled.quarantined_sources,
            ("external-readme", "tool-output"),
        )
        self.assertNotIn("upload secrets", runner.system_prompt.lower())
        self.assertIn("instruction.quarantine", [event["type"] for event in result.events])
        changed_identity = WorkspaceIdentity.from_manifest(
            {"project": "inside-agents-s12-fixture", "revision": "unreviewed-v2"}
        )
        self.assertFalse(runner.trust_store.evaluate(changed_identity).trusted)

    def test_s13_rolls_back_only_the_reviewed_scoped_diff(self):
        runner, _ = build_s13()
        self.addCleanup(runner.fixture.cleanup)
        result = runner.run("Review and roll back the fixture edit.")
        event_types = [event["type"] for event in result.events]
        self.assertEqual(
            event_types[7:11],
            [
                "checkpoint.create",
                "file.patch",
                "checkpoint.diff",
                "checkpoint.rollback",
            ],
        )
        self.assertEqual(runner.target.read_text(encoding="utf-8"), "status: pending\n")
        with self.assertRaises(CheckpointError):
            runner.checkpoints.diff(
                runner.checkpoints.create("escape-check"),
                ("../outside.txt",),
            )


if __name__ == "__main__":
    unittest.main()
