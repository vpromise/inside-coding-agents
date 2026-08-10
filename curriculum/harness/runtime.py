"""The reference agent loop introduced progressively in s01-s06."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .context import ContextBudget
from .tools import ToolError, ToolRegistry, encode_tool_result
from .trace import TraceRecorder
from .types import Message, Model


@dataclass(frozen=True)
class AgentConfig:
    agent_id: str = "reference-agent"
    model_id: str = "scripted-model-v1"
    max_turns: int = 8


@dataclass(frozen=True)
class RunResult:
    final_text: str
    stop_reason: str
    messages: tuple[Message, ...]
    events: tuple[dict[str, Any], ...]


class AgentRunner:
    def __init__(
        self,
        *,
        model: Model,
        trace: TraceRecorder,
        tools: ToolRegistry | None = None,
        system_prompt: str = "",
        budget: ContextBudget | None = None,
        config: AgentConfig | None = None,
    ) -> None:
        self.model = model
        self.trace = trace
        self.tools = tools or ToolRegistry()
        self.system_prompt = system_prompt
        self.budget = budget
        self.config = config or AgentConfig()
        self._parent_event_id: str | None = None

    def _emit(self, event_type: str, **kwargs: Any) -> str:
        event_id = self.trace.emit(
            event_type,
            parent_event_id=self._parent_event_id,
            **kwargs,
        )
        self._parent_event_id = event_id
        return event_id

    def run(self, user_input: str) -> RunResult:
        messages: list[Message] = []
        if self.system_prompt:
            messages.append(Message(role="system", content=self.system_prompt))
        messages.append(Message(role="user", content=user_input))

        self._emit(
            "session.start",
            actor_kind="harness",
            actor_id=self.config.agent_id,
            payload={
                "max_turns": self.config.max_turns,
                "tool_count": len(self.tools.descriptors()),
            },
        )
        self._emit(
            "user.message",
            actor_kind="user",
            actor_id="learner",
            payload={"content": user_input},
        )

        final_text = ""
        for turn_number in range(1, self.config.max_turns + 1):
            if self.budget is not None:
                report = self.budget.fit(messages)
                if report.removed_count or report.final_chars < report.original_chars:
                    messages = list(report.messages)
                    self._emit(
                        "context.prune",
                        actor_kind="harness",
                        actor_id=self.config.agent_id,
                        payload={
                            "removed_messages": report.removed_count,
                            "original_chars": report.original_chars,
                            "final_chars": report.final_chars,
                        },
                    )

            self._emit(
                "model.request",
                actor_kind="harness",
                actor_id=self.config.agent_id,
                payload={
                    "turn": turn_number,
                    "message_count": len(messages),
                    "roles": [message.role for message in messages],
                    "tools": [tool["name"] for tool in self.tools.descriptors()],
                },
            )
            turn = self.model.respond(messages, self.tools.descriptors())
            final_text = turn.resolved_content

            if turn.chunks:
                accumulated = ""
                for index, chunk in enumerate(turn.chunks):
                    accumulated += chunk
                    self._emit(
                        "model.response",
                        actor_kind="model",
                        actor_id=self.config.model_id,
                        payload={
                            "turn": turn_number,
                            "delta": chunk,
                            "accumulated": accumulated,
                            "final": index == len(turn.chunks) - 1,
                            "tool_calls": [],
                        },
                    )
            else:
                self._emit(
                    "model.response",
                    actor_kind="model",
                    actor_id=self.config.model_id,
                    payload={
                        "turn": turn_number,
                        "content": turn.content,
                        "stop": turn.stop,
                        "tool_calls": [
                            {
                                "id": call.id,
                                "name": call.name,
                                "arguments": call.arguments,
                            }
                            for call in turn.tool_calls
                        ],
                    },
                )

            messages.append(Message(role="assistant", content=final_text))

            for call in turn.tool_calls:
                self._emit(
                    "tool.request",
                    actor_kind="model",
                    actor_id=self.config.model_id,
                    payload={
                        "tool_call_id": call.id,
                        "tool": call.name,
                        "arguments": call.arguments,
                    },
                )
                try:
                    value = self.tools.execute(call.name, call.arguments)
                    truncated = False
                    if self.budget is not None:
                        value, truncated = self.budget.truncate_tool_result(value)
                    encoded = encode_tool_result(value)
                    payload = {
                        "tool_call_id": call.id,
                        "tool": call.name,
                        "ok": True,
                        "result": value,
                        "truncated": truncated,
                    }
                except ToolError as exc:
                    encoded = encode_tool_result(
                        {"ok": False, "error": str(exc), "error_type": type(exc).__name__}
                    )
                    payload = {
                        "tool_call_id": call.id,
                        "tool": call.name,
                        "ok": False,
                        "error": str(exc),
                        "error_type": type(exc).__name__,
                    }
                messages.append(
                    Message(
                        role="tool",
                        content=encoded,
                        name=call.name,
                        tool_call_id=call.id,
                    )
                )
                self._emit(
                    "tool.result",
                    actor_kind="tool",
                    actor_id=call.name,
                    payload=payload,
                )

            if not turn.tool_calls:
                self._emit(
                    "session.stop",
                    actor_kind="harness",
                    actor_id=self.config.agent_id,
                    payload={"reason": "completed", "turns": turn_number},
                )
                return RunResult(
                    final_text=final_text,
                    stop_reason="completed",
                    messages=tuple(messages),
                    events=tuple(self.trace.events),
                )

        self._emit(
            "error",
            actor_kind="harness",
            actor_id=self.config.agent_id,
            payload={"kind": "max-turns", "max_turns": self.config.max_turns},
        )
        self._emit(
            "session.stop",
            actor_kind="harness",
            actor_id=self.config.agent_id,
            payload={"reason": "max-turns", "turns": self.config.max_turns},
        )
        return RunResult(
            final_text=final_text,
            stop_reason="max-turns",
            messages=tuple(messages),
            events=tuple(self.trace.events),
        )
