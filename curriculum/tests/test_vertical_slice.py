from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from curriculum.harness import Workspace, discover_instructions
from curriculum.harness.tools import ToolValidationError
from curriculum.lessons.s01_agent_loop.demo import build_demo as build_s01
from curriculum.lessons.s02_events_streaming.demo import build_demo as build_s02
from curriculum.lessons.s03_tool_dispatch.demo import build_demo as build_s03
from curriculum.lessons.s04_workspace_tools.demo import build_demo as build_s04
from curriculum.lessons.s05_instructions.demo import build_demo as build_s05
from curriculum.lessons.s06_context_budget.demo import build_demo as build_s06


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


if __name__ == "__main__":
    unittest.main()
