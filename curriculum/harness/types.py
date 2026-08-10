"""Provider-neutral messages and model turns.

The reference harness intentionally keeps these types smaller than any vendor API.
Provider adapters can translate their native request and response objects at the
boundary without leaking those objects into the agent loop.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, Sequence

JsonObject = dict[str, Any]
Role = Literal["system", "user", "assistant", "tool"]


@dataclass(frozen=True)
class ToolCall:
    """A validated-looking request produced by a model, before authorization."""

    id: str
    name: str
    arguments: JsonObject


@dataclass(frozen=True)
class ModelTurn:
    """One scripted model turn.

    ``chunks`` models streaming without tying the course to a provider protocol.
    When chunks are present, their concatenation is the assistant message.
    """

    content: str = ""
    tool_calls: tuple[ToolCall, ...] = field(default_factory=tuple)
    chunks: tuple[str, ...] = field(default_factory=tuple)
    stop: bool = False

    @property
    def resolved_content(self) -> str:
        return "".join(self.chunks) if self.chunks else self.content


@dataclass(frozen=True)
class Message:
    role: Role
    content: str
    name: str | None = None
    tool_call_id: str | None = None

    def to_wire(self) -> JsonObject:
        value: JsonObject = {"role": self.role, "content": self.content}
        if self.name is not None:
            value["name"] = self.name
        if self.tool_call_id is not None:
            value["tool_call_id"] = self.tool_call_id
        return value


class Model(Protocol):
    def respond(
        self,
        messages: Sequence[Message],
        tools: Sequence[JsonObject],
    ) -> ModelTurn:
        """Return the next assistant turn."""
