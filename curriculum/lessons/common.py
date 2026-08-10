from __future__ import annotations

from curriculum.harness import TraceRecorder


def lesson_trace(lesson_id: str) -> TraceRecorder:
    return TraceRecorder(
        session_id=f"session-{lesson_id}",
        provenance={
            "agent_id": "reference-agent",
            "snapshot_id": "reference-agent-2026-08-10-python",
            "surface": "sdk",
            "harness_mode": "fake",
            "run_id": f"run-{lesson_id}-golden",
            "experiment_id": "reference-foundations-golden",
            "model": "scripted-model-v1",
            "provider": "local-fixture",
        },
    )


def print_run(result_text: str, trace: TraceRecorder) -> None:
    print(f"FINAL: {result_text}")
    print("TRACE:")
    print(trace.as_jsonl())
