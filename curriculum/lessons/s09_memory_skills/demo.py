from curriculum.harness import (
    AgentRunner,
    MemoryRecord,
    MemoryStore,
    ModelTurn,
    ScriptedModel,
    SkillCatalog,
    SkillDefinition,
    Tool,
    ToolCall,
    ToolRegistry,
)
from curriculum.lessons.common import lesson_trace, print_run


def build_demo() -> tuple[AgentRunner, object]:
    trace = lesson_trace("s09-memory-skills")
    memory = MemoryStore()
    memory.remember(
        MemoryRecord(
            id="project-test-policy",
            content="Run the focused test before the full suite.",
            scope="workspace",
            source="AGENTS.md#testing",
        )
    )
    skills = SkillCatalog()
    skills.register(
        SkillDefinition(
            id="test-first",
            description="Choose focused checks before broad regression tests.",
            instructions="Run the smallest relevant test, inspect failure, then widen coverage.",
            tool_names=("run_command",),
        )
    )

    def search_memory(args):
        matches = memory.search(args["query"])
        parent = trace.events[-1]["event_id"]
        trace.emit(
            "memory.read",
            actor_kind="harness",
            actor_id="workspace-memory",
            parent_event_id=parent,
            payload={
                "query": args["query"],
                "match_ids": [record.id for record in matches],
                "sources": [record.source for record in matches],
            },
        )
        return {
            "matches": [
                {"id": record.id, "content": record.content, "source": record.source}
                for record in matches
            ]
        }

    def load_skill(args):
        skill = skills.load(args["skill_id"])
        parent = trace.events[-1]["event_id"]
        trace.emit(
            "skill.load",
            actor_kind="harness",
            actor_id="skill-catalog",
            parent_event_id=parent,
            payload={"skill_id": skill.id, "tool_names": list(skill.tool_names)},
        )
        return {
            "id": skill.id,
            "instructions": skill.instructions,
            "tool_names": list(skill.tool_names),
        }

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="memory_search",
            description="Retrieve source-attributed workspace memory on demand.",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "required": ["query"],
                "properties": {"query": {"type": "string"}},
            },
            handler=search_memory,
        )
    )
    registry.register(
        Tool(
            name="load_skill",
            description="Load full skill instructions only after selecting a descriptor.",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "required": ["skill_id"],
                "properties": {"skill_id": {"type": "string"}},
            },
            handler=load_skill,
        )
    )
    model = ScriptedModel(
        [
            ModelTurn(
                tool_calls=(
                    ToolCall(
                        id="call-memory",
                        name="memory_search",
                        arguments={"query": "project test policy"},
                    ),
                    ToolCall(
                        id="call-skill",
                        name="load_skill",
                        arguments={"skill_id": "test-first"},
                    ),
                )
            ),
            ModelTurn(
                content="I will run the focused test first, then widen coverage.",
                stop=True,
            ),
        ]
    )
    return AgentRunner(model=model, tools=registry, trace=trace), trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Recall the project testing rule and load the relevant skill.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
