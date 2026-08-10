from pathlib import Path

from curriculum.harness import (
    AgentRunner,
    ModelTurn,
    ScriptedModel,
    ToolCall,
    Workspace,
    workspace_tool_registry,
)
from curriculum.lessons.common import lesson_trace, print_run


def build_demo() -> tuple[AgentRunner, object]:
    workspace = Workspace(Path(__file__).parent / "fixture")
    registry = workspace_tool_registry(workspace)
    model = ScriptedModel(
        [
            ModelTurn(
                tool_calls=(
                    ToolCall(
                        id="call-readme",
                        name="read_file",
                        arguments={"path": "README.md"},
                    ),
                )
            ),
            ModelTurn(content="The fixture describes a bounded workspace.", stop=True),
        ]
    )
    trace = lesson_trace("s04-workspace-tools")
    return AgentRunner(model=model, tools=registry, trace=trace), trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Read the fixture README and summarize it.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
