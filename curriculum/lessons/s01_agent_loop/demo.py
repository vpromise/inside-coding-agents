from curriculum.harness import AgentRunner, ModelTurn, ScriptedModel
from curriculum.lessons.common import lesson_trace, print_run


def build_demo() -> tuple[AgentRunner, object]:
    trace = lesson_trace("s01-agent-loop")
    model = ScriptedModel(
        [ModelTurn(content="A harness keeps calling the model until work stops.", stop=True)]
    )
    return AgentRunner(model=model, trace=trace), trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Explain an agent loop in one sentence.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
