"""Normalized, redaction-aware Trace 0.1 recorder."""

from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping


class TraceRecorder:
    """Record deterministic events compatible with trace-event.schema.json."""

    def __init__(
        self,
        *,
        session_id: str,
        provenance: Mapping[str, Any],
        start: datetime | None = None,
    ) -> None:
        self.session_id = session_id
        self.provenance = dict(provenance)
        self.start = start or datetime(2026, 8, 10, tzinfo=timezone.utc)
        self.events: list[dict[str, Any]] = []

    def emit(
        self,
        event_type: str,
        *,
        actor_kind: str,
        actor_id: str,
        payload: Mapping[str, Any] | None = None,
        parent_event_id: str | None = None,
        duration_ms: float | None = None,
        redaction: Mapping[str, Any] | None = None,
    ) -> str:
        sequence = len(self.events)
        event_id = f"evt-{sequence:03d}"
        timestamp = (self.start + timedelta(seconds=sequence)).isoformat()
        timestamp = timestamp.replace("+00:00", "Z")
        event: dict[str, Any] = {
            "trace_version": "0.1.0",
            "event_id": event_id,
            "session_id": self.session_id,
            "sequence": sequence,
            "timestamp": timestamp,
            "type": event_type,
            "actor": {"kind": actor_kind, "id": actor_id},
            "payload": deepcopy(dict(payload or {})),
            "provenance": deepcopy(self.provenance),
            "redaction": deepcopy(
                dict(redaction or {"status": "clean", "fields": []})
            ),
        }
        if parent_event_id is not None:
            event["parent_event_id"] = parent_event_id
        if duration_ms is not None:
            event["duration_ms"] = duration_ms
        self.events.append(event)
        return event_id

    def as_jsonl(self) -> str:
        return "\n".join(
            json.dumps(event, ensure_ascii=False, separators=(",", ":"))
            for event in self.events
        )
