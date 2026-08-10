from curriculum.harness import AgentRunner, ModelTurn, ScriptedModel
from curriculum.lessons.common import lesson_trace, print_run


def build_demo() -> tuple[AgentRunner, object]:
    trace = lesson_trace("s02-events-streaming")
    model = ScriptedModel(
        [ModelTurn(chunks=("Observe ", "events, ", "not hidden state."), stop=True)]
    )
    return AgentRunner(model=model, trace=trace), trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Stream one observability rule.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
