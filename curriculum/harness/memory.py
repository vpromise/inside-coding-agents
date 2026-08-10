"""Small provenance-aware memory and lazy skill catalog for s09."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MemoryRecord:
    id: str
    content: str
    scope: str
    source: str


class MemoryStore:
    def __init__(self) -> None:
        self._records: dict[str, MemoryRecord] = {}

    def remember(self, record: MemoryRecord) -> None:
        if record.id in self._records:
            raise ValueError(f"memory already exists: {record.id}")
        if not record.content.strip() or not record.source.strip():
            raise ValueError("memory content and source must be non-empty")
        self._records[record.id] = record

    def search(self, query: str, *, limit: int = 3) -> tuple[MemoryRecord, ...]:
        terms = {term for term in query.lower().split() if term}
        ranked: list[tuple[int, str, MemoryRecord]] = []
        for record in self._records.values():
            haystack = f"{record.id} {record.content} {record.scope}".lower()
            score = sum(term in haystack for term in terms)
            if score:
                ranked.append((score, record.id, record))
        ranked.sort(key=lambda item: (-item[0], item[1]))
        return tuple(item[2] for item in ranked[: max(0, limit)])


@dataclass(frozen=True)
class SkillDefinition:
    id: str
    description: str
    instructions: str
    tool_names: tuple[str, ...] = ()


class SkillCatalog:
    def __init__(self) -> None:
        self._skills: dict[str, SkillDefinition] = {}

    def register(self, skill: SkillDefinition) -> None:
        if skill.id in self._skills:
            raise ValueError(f"skill already exists: {skill.id}")
        self._skills[skill.id] = skill

    def descriptors(self) -> tuple[dict[str, str], ...]:
        return tuple(
            {"id": skill.id, "description": skill.description}
            for skill in self._skills.values()
        )

    def load(self, skill_id: str) -> SkillDefinition:
        try:
            return self._skills[skill_id]
        except KeyError as exc:
            raise KeyError(f"unknown skill: {skill_id}") from exc
