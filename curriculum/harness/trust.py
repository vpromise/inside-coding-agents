"""Project identity, explicit trust grants, and instruction/data separation."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Literal, Mapping, Sequence


InstructionAuthority = Literal[
    "platform",
    "project",
    "external-data",
    "tool-output",
]


@dataclass(frozen=True)
class WorkspaceIdentity:
    fingerprint: str

    @classmethod
    def from_manifest(cls, manifest: Mapping[str, str]) -> "WorkspaceIdentity":
        wire = json.dumps(
            dict(manifest),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return cls(fingerprint=hashlib.sha256(wire.encode("utf-8")).hexdigest())


@dataclass(frozen=True)
class TrustGrant:
    workspace_fingerprint: str
    policy_version: str
    granted_by: str


@dataclass(frozen=True)
class TrustDecision:
    workspace_fingerprint: str
    trusted: bool
    reason: str
    policy_version: str | None


class ProjectTrustStore:
    def __init__(self) -> None:
        self._grants: dict[str, TrustGrant] = {}

    def grant(self, identity: WorkspaceIdentity, *, policy_version: str, granted_by: str) -> TrustGrant:
        if not policy_version.strip() or not granted_by.strip():
            raise ValueError("trust grants require policy version and grant source")
        grant = TrustGrant(
            workspace_fingerprint=identity.fingerprint,
            policy_version=policy_version,
            granted_by=granted_by,
        )
        self._grants[identity.fingerprint] = grant
        return grant

    def evaluate(self, identity: WorkspaceIdentity) -> TrustDecision:
        grant = self._grants.get(identity.fingerprint)
        if grant is None:
            return TrustDecision(
                workspace_fingerprint=identity.fingerprint,
                trusted=False,
                reason="No trust grant matches this exact workspace identity.",
                policy_version=None,
            )
        return TrustDecision(
            workspace_fingerprint=identity.fingerprint,
            trusted=True,
            reason=f"Explicit grant from {grant.granted_by} matches this workspace.",
            policy_version=grant.policy_version,
        )


@dataclass(frozen=True)
class InstructionCandidate:
    id: str
    authority: InstructionAuthority
    content: str
    workspace_fingerprint: str | None = None


@dataclass(frozen=True)
class CompiledInstructions:
    system_prompt: str
    accepted_sources: tuple[str, ...]
    quarantined_sources: tuple[str, ...]
    injection_signals: tuple[str, ...]


class InstructionCompiler:
    """Accept sources by authority; heuristics only annotate, never authorize."""

    SIGNALS = (
        "ignore previous",
        "override system",
        "upload secrets",
        "disable sandbox",
    )

    def compile(
        self,
        candidates: Sequence[InstructionCandidate],
        *,
        trust: TrustDecision,
    ) -> CompiledInstructions:
        accepted: list[InstructionCandidate] = []
        quarantined: list[InstructionCandidate] = []
        signals: list[str] = []
        for candidate in candidates:
            lowered = candidate.content.lower()
            signals.extend(
                f"{candidate.id}:{signal}"
                for signal in self.SIGNALS
                if signal in lowered
            )
            if candidate.authority == "platform":
                accepted.append(candidate)
            elif (
                candidate.authority == "project"
                and trust.trusted
                and candidate.workspace_fingerprint == trust.workspace_fingerprint
            ):
                accepted.append(candidate)
            else:
                quarantined.append(candidate)

        prompt = "\n\n".join(
            f"[instruction-source:{candidate.id}]\n{candidate.content.strip()}"
            for candidate in accepted
            if candidate.content.strip()
        )
        return CompiledInstructions(
            system_prompt=prompt,
            accepted_sources=tuple(candidate.id for candidate in accepted),
            quarantined_sources=tuple(candidate.id for candidate in quarantined),
            injection_signals=tuple(signals),
        )
