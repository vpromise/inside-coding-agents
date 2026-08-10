"""Portable sandbox contracts with an explicitly simulated teaching backend."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any, Mapping, Protocol, Sequence


class SandboxDenied(RuntimeError):
    pass


@dataclass(frozen=True, order=True)
class NetworkEndpoint:
    host: str
    port: int

    @classmethod
    def parse(cls, value: str) -> "NetworkEndpoint":
        host, separator, raw_port = value.lower().rpartition(":")
        if not separator or not host or not raw_port.isdigit():
            raise ValueError("network endpoint must be an exact host:port pair")
        port = int(raw_port)
        if not 1 <= port <= 65_535:
            raise ValueError("network endpoint port is outside 1..65535")
        if any(token in host for token in ("/", "*", "@")):
            raise ValueError("network endpoint host must not contain URL or wildcard syntax")
        return cls(host=host, port=port)

    def render(self) -> str:
        return f"{self.host}:{self.port}"


@dataclass(frozen=True)
class SandboxBackendCapabilities:
    filesystem_isolation: bool
    network_isolation: bool
    process_isolation: bool


@dataclass(frozen=True)
class SandboxProfile:
    id: str
    allowed_commands: tuple[str, ...]
    network_allowlist: tuple[NetworkEndpoint, ...] = ()


@dataclass(frozen=True)
class CapabilityRequest:
    command: str
    read_paths: tuple[str, ...] = ()
    write_paths: tuple[str, ...] = ()
    network_destinations: tuple[NetworkEndpoint, ...] = ()


@dataclass(frozen=True)
class SandboxPlan:
    profile_id: str
    request: CapabilityRequest
    allowed: bool
    reasons: tuple[str, ...]
    required_capabilities: tuple[str, ...]


class SandboxBackend(Protocol):
    capabilities: SandboxBackendCapabilities

    def run(self, plan: SandboxPlan, payload: Mapping[str, Any]) -> Any:
        """Execute an already authorized plan inside the backend boundary."""


class SandboxController:
    def __init__(self, profile: SandboxProfile, backend: SandboxBackend) -> None:
        self.profile = profile
        self.backend = backend

    @staticmethod
    def _valid_relative_path(value: str) -> bool:
        path = PurePosixPath(value)
        return bool(value) and not path.is_absolute() and ".." not in path.parts

    def plan(self, request: CapabilityRequest) -> SandboxPlan:
        reasons: list[str] = []
        required = ["process"]
        if request.command not in self.profile.allowed_commands:
            reasons.append(f"command is not allowed: {request.command}")
        if not self.backend.capabilities.process_isolation:
            reasons.append("backend cannot attest process isolation")

        paths = (*request.read_paths, *request.write_paths)
        if paths:
            required.append("filesystem")
            if not all(self._valid_relative_path(path) for path in paths):
                reasons.append("filesystem paths must remain relative and traversal-free")
            if not self.backend.capabilities.filesystem_isolation:
                reasons.append("backend cannot attest filesystem isolation")

        if request.network_destinations:
            required.append("network")
            allowed_endpoints = set(self.profile.network_allowlist)
            denied = sorted(set(request.network_destinations) - allowed_endpoints)
            if denied:
                reasons.append(
                    "network destination is not allowlisted: "
                    + ", ".join(endpoint.render() for endpoint in denied)
                )
            if not self.backend.capabilities.network_isolation:
                reasons.append("backend cannot attest network isolation")

        return SandboxPlan(
            profile_id=self.profile.id,
            request=request,
            allowed=not reasons,
            reasons=tuple(reasons),
            required_capabilities=tuple(required),
        )

    def execute(self, plan: SandboxPlan, payload: Mapping[str, Any]) -> Any:
        if plan.profile_id != self.profile.id:
            raise SandboxDenied("sandbox plan belongs to another profile")
        if not plan.allowed:
            raise SandboxDenied("; ".join(plan.reasons))
        return self.backend.run(plan, payload)


class SimulatedSandboxBackend:
    """No-effect backend for lessons; its attestation is not an OS sandbox claim."""

    capabilities = SandboxBackendCapabilities(
        filesystem_isolation=True,
        network_isolation=True,
        process_isolation=True,
    )

    def __init__(self) -> None:
        self.calls: list[SandboxPlan] = []

    def run(self, plan: SandboxPlan, payload: Mapping[str, Any]) -> dict[str, Any]:
        if not plan.allowed:
            raise SandboxDenied("the simulated backend received a denied plan")
        self.calls.append(plan)
        return {
            "backend": "simulated-no-effects",
            "command": plan.request.command,
            "network": [
                endpoint.render() for endpoint in plan.request.network_destinations
            ],
            "payload": dict(payload),
        }
