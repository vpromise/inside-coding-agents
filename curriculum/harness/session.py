"""Append-only session replay and branch primitives for s07."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Sequence


@dataclass(frozen=True)
class ReplayState:
    session_id: str
    run_id: str
    applied_sequences: tuple[int, ...]
    user_messages: tuple[str, ...]
    assistant_messages: tuple[str, ...]
    tool_results: tuple[dict[str, Any], ...]
    stop_reason: str | None
    fingerprint: str


@dataclass(frozen=True)
class SessionBranch:
    branch_id: str
    parent_session_id: str
    parent_run_id: str
    fork_sequence: int
    inherited_event_ids: tuple[str, ...]
    parent_fingerprint: str


class SessionJournal:
    """Validate and project one normalized, append-only event stream."""

    def __init__(self, events: Sequence[dict[str, Any]]) -> None:
        if not events:
            raise ValueError("a session journal needs at least one event")
        self.events = tuple(events)
        sequences = [event.get("sequence") for event in self.events]
        if sequences != list(range(len(self.events))):
            raise ValueError("event sequence must be contiguous and start at zero")
        session_ids = {event.get("session_id") for event in self.events}
        run_ids = {
            event.get("provenance", {}).get("run_id") for event in self.events
        }
        if len(session_ids) != 1 or len(run_ids) != 1:
            raise ValueError("a journal cannot mix sessions or runs")

    @staticmethod
    def _fingerprint(events: Sequence[dict[str, Any]]) -> str:
        wire = json.dumps(
            events,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(wire.encode("utf-8")).hexdigest()

    def replay(self, *, until_sequence: int | None = None) -> ReplayState:
        if until_sequence is not None and not 0 <= until_sequence < len(self.events):
            raise ValueError("until_sequence is outside the journal")
        selected = self.events[
            : len(self.events) if until_sequence is None else until_sequence + 1
        ]
        users: list[str] = []
        assistants: list[str] = []
        tool_results: list[dict[str, Any]] = []
        stop_reason: str | None = None
        for event in selected:
            event_type = event["type"]
            payload = event.get("payload", {})
            if event_type == "user.message":
                users.append(str(payload.get("content", "")))
            elif event_type == "model.response":
                if "content" in payload:
                    assistants.append(str(payload["content"]))
                elif payload.get("final") is True:
                    assistants.append(str(payload.get("accumulated", "")))
            elif event_type == "tool.result":
                tool_results.append(dict(payload))
            elif event_type == "session.stop":
                stop_reason = str(payload.get("reason", "unknown"))
        first = selected[0]
        return ReplayState(
            session_id=str(first["session_id"]),
            run_id=str(first["provenance"]["run_id"]),
            applied_sequences=tuple(event["sequence"] for event in selected),
            user_messages=tuple(users),
            assistant_messages=tuple(assistants),
            tool_results=tuple(tool_results),
            stop_reason=stop_reason,
            fingerprint=self._fingerprint(selected),
        )

    def branch(self, *, fork_sequence: int, branch_id: str) -> SessionBranch:
        if not branch_id.strip():
            raise ValueError("branch_id must be non-empty")
        parent = self.replay(until_sequence=fork_sequence)
        selected = self.events[: fork_sequence + 1]
        return SessionBranch(
            branch_id=branch_id,
            parent_session_id=parent.session_id,
            parent_run_id=parent.run_id,
            fork_sequence=fork_sequence,
            inherited_event_ids=tuple(str(event["event_id"]) for event in selected),
            parent_fingerprint=parent.fingerprint,
        )
