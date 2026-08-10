from curriculum.harness import (
    AgentRunner,
    ContextBudget,
    ModelTurn,
    ScriptedModel,
    Tool,
    ToolCall,
    ToolRegistry,
)
from curriculum.lessons.common import lesson_trace, print_run


def build_demo() -> tuple[AgentRunner, object]:
    registry = ToolRegistry()
    registry.register(
        Tool(
            name="large_result",
            description="Return a deliberately oversized synthetic payload.",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "properties": {},
            },
            handler=lambda args: {"content": "context-data-" * 80},
        )
    )
    model = ScriptedModel(
        [
            ModelTurn(
                tool_calls=(
                    ToolCall(id="call-large", name="large_result", arguments={}),
                )
            ),
            ModelTurn(content="The harness truncated the oversized result.", stop=True),
        ]
    )
    trace = lesson_trace("s06-context-budget")
    return (
        AgentRunner(
            model=model,
            tools=registry,
            trace=trace,
            system_prompt="Keep tool output bounded. " * 8,
            budget=ContextBudget(max_input_chars=300, max_tool_output_chars=180),
        ),
        trace,
    )


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Fetch the large result, then explain the budget behavior.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
