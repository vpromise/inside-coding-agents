"""Instruction discovery and explicit context-budget policies."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

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
