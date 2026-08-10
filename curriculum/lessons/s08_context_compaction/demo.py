from curriculum.harness import (
    AgentRunner,
    ContextCompactor,
    ModelTurn,
    ScriptedModel,
    Tool,
    ToolCall,
    ToolRegistry,
)
from curriculum.lessons.common import lesson_trace, print_run


def summarize_history(messages) -> str:
    return (
        "The user requested an artifact inspection. The artifact was stored as "
        "artifact://large-report and its verified conclusion is: tests remain green."
    )


def build_demo() -> tuple[AgentRunner, object]:
    registry = ToolRegistry()
    registry.register(
        Tool(
            name="inspect_artifact",
            description="Return a deliberately verbose artifact preview.",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "properties": {},
            },
            handler=lambda args: {
                "artifact": "artifact://large-report",
                "preview": "verified-output-" * 32,
            },
        )
    )
    model = ScriptedModel(
        [
            ModelTurn(
                content="I will inspect the artifact.",
                tool_calls=(
                    ToolCall(id="call-artifact", name="inspect_artifact", arguments={}),
                ),
            ),
            ModelTurn(content="The compacted checkpoint preserves the verified conclusion.", stop=True),
        ]
    )
    trace = lesson_trace("s08-context-compaction")
    return (
        AgentRunner(
            model=model,
            tools=registry,
            trace=trace,
            system_prompt="Use explicit artifact handles and preserve verified constraints.",
            compactor=ContextCompactor(
                trigger_chars=260,
                keep_recent_messages=0,
                summarize=summarize_history,
            ),
        ),
        trace,
    )


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Inspect the report, then continue from a compacted checkpoint.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
