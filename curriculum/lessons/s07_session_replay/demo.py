from curriculum.harness import (
    AgentRunner,
    ModelTurn,
    RunResult,
    ScriptedModel,
    SessionJournal,
)
from curriculum.lessons.common import lesson_trace, print_run


class ReplayDemoRunner(AgentRunner):
    def run(self, user_input: str) -> RunResult:
        result = super().run(user_input)
        journal = SessionJournal(result.events)
        self.replay_state = journal.replay()
        self.branch_record = journal.branch(
            fork_sequence=2,
            branch_id="branch-alternative-response",
        )
        replay_event_id = self.trace.emit(
            "session.replay",
            actor_kind="harness",
            actor_id=self.config.agent_id,
            parent_event_id=result.events[-1]["event_id"],
            payload={
                "applied_events": len(self.replay_state.applied_sequences),
                "stop_reason": self.replay_state.stop_reason,
                "fingerprint": self.replay_state.fingerprint,
            },
        )
        self.trace.emit(
            "session.branch",
            actor_kind="harness",
            actor_id=self.config.agent_id,
            parent_event_id=replay_event_id,
            payload={
                "branch_id": self.branch_record.branch_id,
                "parent_run_id": self.branch_record.parent_run_id,
                "fork_sequence": self.branch_record.fork_sequence,
                "inherited_events": len(self.branch_record.inherited_event_ids),
                "parent_fingerprint": self.branch_record.parent_fingerprint,
            },
        )
        return RunResult(
            final_text=result.final_text,
            stop_reason=result.stop_reason,
            messages=result.messages,
            events=tuple(self.trace.events),
        )


def build_demo() -> tuple[AgentRunner, object]:
    trace = lesson_trace("s07-session-replay")
    model = ScriptedModel(
        [ModelTurn(content="Replay derives state; branching preserves its parent.", stop=True)]
    )
    return ReplayDemoRunner(model=model, trace=trace), trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Explain replay and branch lineage in one sentence.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
