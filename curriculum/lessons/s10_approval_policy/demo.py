import tempfile

from curriculum.harness import (
    AgentRunner,
    ApprovalGate,
    ApprovalPolicy,
    ApprovalRule,
    ModelTurn,
    ScriptedModel,
    ToolCall,
    Workspace,
    workspace_tool_registry,
)
from curriculum.lessons.common import lesson_trace, print_run


def build_demo() -> tuple[AgentRunner, object]:
    fixture = tempfile.TemporaryDirectory(prefix="inside-agents-s10-")
    workspace = Workspace(fixture.name)
    approvals = []

    def approve_exact_write(request, rule) -> bool:
        approvals.append((request.fingerprint, rule.id))
        return request.arguments == {
            "path": "approved.txt",
            "content": "bounded change\n",
        }

    gate = ApprovalGate(
        ApprovalPolicy(
            (
                ApprovalRule(
                    id="read-without-prompt",
                    tool_names=("read_file",),
                    effect="allow",
                    reason="Workspace reads are allowed by this lesson policy.",
                ),
                ApprovalRule(
                    id="ask-before-write",
                    tool_names=("write_file",),
                    effect="ask",
                    reason="A fresh decision is required for each exact write.",
                ),
                ApprovalRule(
                    id="deny-command",
                    tool_names=("run_command",),
                    effect="deny",
                    reason="Command execution is outside the s10 capability set.",
                ),
            )
        ),
        approver=approve_exact_write,
    )
    model = ScriptedModel(
        [
            ModelTurn(
                content="I need approval for this bounded write.",
                tool_calls=(
                    ToolCall(
                        id="call-approved-write",
                        name="write_file",
                        arguments={
                            "path": "approved.txt",
                            "content": "bounded change\n",
                        },
                    ),
                ),
            ),
            ModelTurn(
                content="The exact approved write completed.",
                stop=True,
            ),
        ]
    )
    trace = lesson_trace("s10-approval-policy")
    runner = AgentRunner(
        model=model,
        tools=workspace_tool_registry(workspace, allow_writes=True),
        trace=trace,
        approval_gate=gate,
    )
    runner.fixture = fixture
    runner.workspace = workspace
    runner.approvals = approvals
    runner.approval_gate = gate
    return runner, trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Write only approved.txt with the proposed bounded content.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
