from curriculum.harness import (
    AgentRunner,
    ApprovalGate,
    ApprovalPolicy,
    ApprovalRule,
    CapabilityRequest,
    ModelTurn,
    NetworkEndpoint,
    SandboxController,
    SandboxProfile,
    ScriptedModel,
    SimulatedSandboxBackend,
    Tool,
    ToolCall,
    ToolRegistry,
)
from curriculum.lessons.common import lesson_trace, print_run


def build_demo() -> tuple[AgentRunner, object]:
    trace = lesson_trace("s11-sandbox-network")
    backend = SimulatedSandboxBackend()
    controller = SandboxController(
        SandboxProfile(
            id="dependency-readonly",
            allowed_commands=("fetch-package-metadata",),
            network_allowlist=(NetworkEndpoint.parse("packages.example.invalid:443"),),
        ),
        backend,
    )

    def fetch_package(args):
        endpoint = NetworkEndpoint.parse(f"{args['host']}:443")
        request = CapabilityRequest(
            command="fetch-package-metadata",
            network_destinations=(endpoint,),
        )
        plan = controller.plan(request)
        configure_id = trace.emit(
            "sandbox.configure",
            actor_kind="harness",
            actor_id="sandbox-controller",
            parent_event_id=trace.events[-1]["event_id"],
            payload={
                "profile_id": plan.profile_id,
                "backend": "simulated-no-effects",
                "required_capabilities": list(plan.required_capabilities),
                "allowed": plan.allowed,
            },
        )
        trace.emit(
            "network.decision",
            actor_kind="harness",
            actor_id="network-policy",
            parent_event_id=configure_id,
            payload={
                "destinations": [
                    destination.render()
                    for destination in plan.request.network_destinations
                ],
                "allowed": plan.allowed,
                "reasons": list(plan.reasons),
            },
        )
        return controller.execute(
            plan,
            {"package": args["package"], "status": "metadata-only"},
        )

    registry = ToolRegistry()
    registry.register(
        Tool(
            name="fetch_package_metadata",
            description="Fetch package metadata through a bounded network profile.",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "required": ["host", "package"],
                "properties": {
                    "host": {"type": "string"},
                    "package": {"type": "string"},
                },
            },
            handler=fetch_package,
        )
    )
    gate = ApprovalGate(
        ApprovalPolicy(
            (
                ApprovalRule(
                    id="allow-bounded-metadata-fetch",
                    tool_names=("fetch_package_metadata",),
                    effect="allow",
                    reason="The semantic capability is allowed; the sandbox still enforces it.",
                ),
            )
        )
    )
    model = ScriptedModel(
        [
            ModelTurn(
                content="I will request metadata through the bounded profile.",
                tool_calls=(
                    ToolCall(
                        id="call-package-metadata",
                        name="fetch_package_metadata",
                        arguments={
                            "host": "packages.example.invalid",
                            "package": "reference-harness",
                        },
                    ),
                ),
            ),
            ModelTurn(
                content="The allowed destination returned simulated metadata.",
                stop=True,
            ),
        ]
    )
    runner = AgentRunner(
        model=model,
        tools=registry,
        trace=trace,
        approval_gate=gate,
    )
    runner.sandbox_controller = controller
    runner.sandbox_backend = backend
    return runner, trace


def main() -> None:
    runner, trace = build_demo()
    result = runner.run("Inspect package metadata without contacting any other host.")
    print_run(result.final_text, trace)


if __name__ == "__main__":
    main()
