"""Deterministic model doubles for lessons and tests."""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Sequence

from .types import JsonObject, Message, ModelTurn


class ScriptedModel:
    """Return predeclared turns in order; no API key or network is required."""

    def __init__(self, turns: Iterable[ModelTurn]) -> None:
        self._turns = deque(turns)
        self.requests: list[tuple[Message, ...]] = []

    def respond(
        self,
        messages: Sequence[Message],
        tools: Sequence[JsonObject],
    ) -> ModelTurn:
        del tools
        self.requests.append(tuple(messages))
        if not self._turns:
            return ModelTurn(
                content="The scripted model has no remaining turns.",
                stop=True,
            )
        return self._turns.popleft()
