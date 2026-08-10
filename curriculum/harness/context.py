"""Instruction discovery and explicit context-budget policies."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Sequence

from .types import Message


@dataclass(frozen=True)
class InstructionDocument:
    path: str
    content: str


def _inside(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def discover_instructions(
    workspace_root: str | Path,
    cwd: str | Path,
    *,
    filename: str = "AGENTS.md",
    max_bytes_per_file: int = 32_000,
) -> tuple[InstructionDocument, ...]:
    """Load root-to-leaf instruction files without leaving the workspace."""

    root = Path(workspace_root).resolve()
    current = Path(cwd).resolve()
    if not _inside(root, current):
        raise ValueError("cwd must be inside workspace_root")

    directories = [root]
    cursor = root
    for part in current.relative_to(root).parts:
        cursor = cursor / part
        directories.append(cursor)

    documents: list[InstructionDocument] = []
    for directory in directories:
        candidate = directory / filename
        if not candidate.is_file():
            continue
        raw = candidate.read_bytes()
        if len(raw) > max_bytes_per_file:
            raw = raw[:max_bytes_per_file]
        documents.append(
            InstructionDocument(
                path=candidate.relative_to(root).as_posix(),
                content=raw.decode("utf-8", errors="replace"),
            )
        )
    return tuple(documents)


def render_instructions(documents: Sequence[InstructionDocument]) -> str:
    return "\n\n".join(
        f"# Instructions from {document.path}\n{document.content.strip()}"
        for document in documents
    )


@dataclass(frozen=True)
class BudgetReport:
    messages: tuple[Message, ...]
    removed_count: int
    original_chars: int
    final_chars: int


@dataclass(frozen=True)
class ContextBudget:
    """Character-based teaching proxy for provider token budgets."""

    max_input_chars: int = 8_000
    max_tool_output_chars: int = 2_000

    def truncate_tool_result(self, value: Any) -> tuple[Any, bool]:
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True)
        if len(encoded) <= self.max_tool_output_chars:
            return value, False
        preview_size = max(0, self.max_tool_output_chars - 96)
        return {
            "truncated": True,
            "original_chars": len(encoded),
            "preview": encoded[:preview_size],
        }, True

    def fit(self, messages: Sequence[Message]) -> BudgetReport:
        original_chars = sum(len(message.content) for message in messages)
        if original_chars <= self.max_input_chars:
            return BudgetReport(
                messages=tuple(messages),
                removed_count=0,
                original_chars=original_chars,
                final_chars=original_chars,
            )

        system = [message for message in messages[:1] if message.role == "system"]
        remaining = list(messages[len(system) :])
        kept_reversed: list[Message] = []
        used = sum(len(message.content) for message in system)
        for message in reversed(remaining):
            if kept_reversed and used + len(message.content) > self.max_input_chars:
                continue
            if not kept_reversed and used + len(message.content) > self.max_input_chars:
                room = max(0, self.max_input_chars - used)
                message = Message(
                    role=message.role,
                    content=message.content[-room:] if room else "",
                    name=message.name,
                    tool_call_id=message.tool_call_id,
                )
            kept_reversed.append(message)
            used += len(message.content)

        kept = tuple(system + list(reversed(kept_reversed)))
        final_chars = sum(len(message.content) for message in kept)
        return BudgetReport(
            messages=kept,
            removed_count=max(0, len(messages) - len(kept)),
            original_chars=original_chars,
            final_chars=final_chars,
        )


@dataclass(frozen=True)
class CompactionReport:
    messages: tuple[Message, ...]
    summary: str
    dropped_count: int
    original_chars: int
    final_chars: int
    source_sha256: str


@dataclass(frozen=True)
class ContextCompactor:
    """Inject a deterministic summarizer at an explicit context threshold."""

    trigger_chars: int
    keep_recent_messages: int
    summarize: Callable[[Sequence[Message]], str]

    def should_compact(self, messages: Sequence[Message]) -> bool:
        return sum(len(message.content) for message in messages) > self.trigger_chars

    def compact(self, messages: Sequence[Message]) -> CompactionReport:
        system = tuple(messages[:1]) if messages[:1] and messages[0].role == "system" else ()
        remaining = tuple(messages[len(system) :])
        keep_count = min(max(0, self.keep_recent_messages), len(remaining))
        dropped = remaining if keep_count == 0 else remaining[:-keep_count]
        recent = () if keep_count == 0 else remaining[-keep_count:]
        if not dropped:
            raise ValueError("compaction has no older messages to summarize")
        summary = self.summarize(dropped).strip()
        if not summary:
            raise ValueError("compaction summary must be non-empty")
        source_wire = json.dumps(
            [message.to_wire() for message in dropped],
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        compacted = (
            *system,
            Message(
                role="assistant",
                content=f"[compacted checkpoint]\n{summary}",
            ),
            *recent,
        )
        return CompactionReport(
            messages=tuple(compacted),
            summary=summary,
            dropped_count=len(dropped),
            original_chars=sum(len(message.content) for message in messages),
            final_chars=sum(len(message.content) for message in compacted),
            source_sha256=hashlib.sha256(source_wire.encode("utf-8")).hexdigest(),
        )
