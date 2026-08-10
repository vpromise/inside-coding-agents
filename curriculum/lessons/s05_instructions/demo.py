from pathlib import Path

from curriculum.harness import AgentRunner, ModelTurn, ScriptedModel, discover_instructions
from curriculum.harness.context import render_instructions
from curriculum.lessons.common import lesson_trace, print_run


def build_demo() -> tuple[AgentRunner, object]:
    fixture = Path(__file__).parent / "fixture"
    documents = discover_instructions(fixture, fixture / "package")
    prompt = render_instructions(documents)
    model = ScriptedModel(
        [ModelTurn(content="I will preserve tests and use package-local style.", stop=True)]
    )
    trace = lesson_trace("s05-instructions")
    return AgentRunner(model=model, trace=trace, system_prompt=prompt), trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("State the two instructions you will follow.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
