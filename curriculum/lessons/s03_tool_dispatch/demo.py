from curriculum.harness import (
    AgentRunner,
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
            name="echo",
            description="Return the supplied text.",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "required": ["text"],
                "properties": {"text": {"type": "string"}},
            },
            handler=lambda args: {"echo": args["text"]},
        )
    )
    model = ScriptedModel(
        [
            ModelTurn(
                tool_calls=(
                    ToolCall(id="call-001", name="echo", arguments={"text": "hello"}),
                )
            ),
            ModelTurn(content="The echo tool returned hello.", stop=True),
        ]
    )
    trace = lesson_trace("s03-tool-dispatch")
    return AgentRunner(model=model, tools=registry, trace=trace), trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Use the echo tool, then report its result.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
