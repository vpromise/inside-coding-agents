"""Fail-closed approval primitives for the safety track."""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Callable, Literal, Mapping, Sequence

from .types import JsonObject


PolicyEffect = Literal["allow", "ask", "deny"]
DecisionOutcome = Literal["allow", "deny"]


@dataclass(frozen=True)
class ActionRequest:
    tool: str
    arguments: JsonObject

    @property
    def fingerprint(self) -> str:
        wire = json.dumps(
            {"tool": self.tool, "arguments": self.arguments},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(wire.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ApprovalRule:
    id: str
    tool_names: tuple[str, ...]
    effect: PolicyEffect
    reason: str

    def matches(self, request: ActionRequest) -> bool:
        return request.tool in self.tool_names


@dataclass(frozen=True)
class PendingApproval:
    request: ActionRequest
    rule: ApprovalRule


@dataclass(frozen=True)
class ApprovalDecision:
    request_fingerprint: str
    outcome: DecisionOutcome
    policy_effect: PolicyEffect
    rule_id: str
    reason: str
    source: Literal["policy", "approver", "fail-closed"]
    grant_scope: Literal["none", "once"]

    @property
    def allowed(self) -> bool:
        return self.outcome == "allow"


class ApprovalPolicy:
    def __init__(
        self,
        rules: Sequence[ApprovalRule],
        *,
        default_effect: PolicyEffect = "deny",
    ) -> None:
        if default_effect not in ("allow", "ask", "deny"):
            raise ValueError("default approval effect must be allow, ask, or deny")
        ids = [rule.id for rule in rules]
        if any(not rule.id.strip() for rule in rules):
            raise ValueError("approval rule ids must be non-empty")
        if len(ids) != len(set(ids)):
            raise ValueError("approval rule ids must be unique")
        self.rules = tuple(rules)
        self.default_effect = default_effect

    def evaluate(self, request: ActionRequest) -> ApprovalRule:
        for rule in self.rules:
            if rule.matches(request):
                return rule
        return ApprovalRule(
            id=f"default-{self.default_effect}",
            tool_names=(),
            effect=self.default_effect,
            reason="No explicit approval rule matched the requested tool.",
        )


Approver = Callable[[ActionRequest, ApprovalRule], bool]


class ApprovalGate:
    """Keep policy evaluation separate from a fresh human-style decision."""

    def __init__(
        self,
        policy: ApprovalPolicy,
        *,
        approver: Approver | None = None,
    ) -> None:
        self.policy = policy
        self.approver = approver

    def request(self, tool: str, arguments: Mapping[str, object]) -> PendingApproval:
        action = ActionRequest(tool=tool, arguments=deepcopy(dict(arguments)))
        return PendingApproval(request=action, rule=self.policy.evaluate(action))

    def resolve(self, pending: PendingApproval) -> ApprovalDecision:
        request = pending.request
        rule = pending.rule
        if rule.effect == "allow":
            return ApprovalDecision(
                request_fingerprint=request.fingerprint,
                outcome="allow",
                policy_effect=rule.effect,
                rule_id=rule.id,
                reason=rule.reason,
                source="policy",
                grant_scope="none",
            )
        if rule.effect == "deny":
            return ApprovalDecision(
                request_fingerprint=request.fingerprint,
                outcome="deny",
                policy_effect=rule.effect,
                rule_id=rule.id,
                reason=rule.reason,
                source="policy",
                grant_scope="none",
            )
        if self.approver is None:
            return ApprovalDecision(
                request_fingerprint=request.fingerprint,
                outcome="deny",
                policy_effect=rule.effect,
                rule_id=rule.id,
                reason="Approval was required, but no approver was available.",
                source="fail-closed",
                grant_scope="none",
            )
        fingerprint = request.fingerprint
        approved = self.approver(request, rule)
        if request.fingerprint != fingerprint:
            return ApprovalDecision(
                request_fingerprint=fingerprint,
                outcome="deny",
                policy_effect=rule.effect,
                rule_id=rule.id,
                reason="The approval request mutated while a decision was pending.",
                source="fail-closed",
                grant_scope="none",
            )
        return ApprovalDecision(
            request_fingerprint=fingerprint,
            outcome="allow" if approved else "deny",
            policy_effect=rule.effect,
            rule_id=rule.id,
            reason=rule.reason if approved else "The approver rejected this exact request.",
            source="approver",
            grant_scope="once" if approved else "none",
        )
