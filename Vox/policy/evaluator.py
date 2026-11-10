"""Deterministic, escalate-only policy evaluator.

Guarantees
----------
1. The returned action is the maximum severity across every rule that fired.
2. No rule can lower an action raised by another rule.
3. Rules that need a disabled capability are skipped, never guessed.
4. A missing numeric feature skips its rule (and is reported), it is not
   silently treated as a calm value.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from .schema import (
    GATED_FEATURES,
    SEVERITY,
    Action,
    Condition,
    Operator,
    Policy,
    Rule,
)


@dataclass(frozen=True, slots=True)
class RuleHit:
    rule_id: str
    description: str
    action: Action
    conditions: tuple[dict[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "description": self.description,
            "action": self.action.value,
            "conditions": list(self.conditions),
        }


@dataclass(frozen=True, slots=True)
class SkippedRule:
    rule_id: str
    reason: str

    def to_dict(self) -> dict[str, str]:
        return {"rule_id": self.rule_id, "reason": self.reason}


@dataclass(frozen=True, slots=True)
class PolicyDecision:
    action: Action
    severity: int
    policy_version: str
    fired: tuple[RuleHit, ...] = field(default_factory=tuple)
    skipped: tuple[SkippedRule, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action.value,
            "severity": self.severity,
            "policy_version": self.policy_version,
            "fired": [h.to_dict() for h in self.fired],
            "skipped": [s.to_dict() for s in self.skipped],
        }


def severity(action: Action | str) -> int:
    return SEVERITY[Action(action)]


def _compare(value: float, op: Operator, threshold: float) -> bool:
    if op is Operator.GTE:
        return value >= threshold
    if op is Operator.LTE:
        return value <= threshold
    if op is Operator.GT:
        return value > threshold
    if op is Operator.LT:
        return value < threshold
    raise AssertionError(f"unhandled operator {op}")  # pragma: no cover


def _condition_satisfied(
    condition: Condition, features: Mapping[str, float]
) -> bool:
    value = features[condition.feature]
    return _compare(float(value), condition.op, float(condition.value))


def evaluate(
    features: Mapping[str, float],
    policy: Policy,
    *,
    enabled_capabilities: frozenset[str] | set[str] = frozenset(),
) -> PolicyDecision:
    """Evaluate every enabled rule and return the maximum severity action."""
    hits: list[RuleHit] = []
    skipped: list[SkippedRule] = []

    for rule in policy.rules:
        if not rule.enabled:
            skipped.append(SkippedRule(rule.id, "rule disabled"))
            continue

        capability = rule.requires_feature
        if capability is None:
            for condition in rule.all_of:
                gated = GATED_FEATURES.get(condition.feature)
                if gated is not None:
                    capability = gated
                    break
        if capability is not None and capability not in enabled_capabilities:
            skipped.append(
                SkippedRule(rule.id, f"capability '{capability}' is not enabled")
            )
            continue

        missing = [c.feature for c in rule.all_of if c.feature not in features]
        if missing:
            skipped.append(
                SkippedRule(rule.id, f"missing feature(s): {', '.join(sorted(missing))}")
            )
            continue

        if all(_condition_satisfied(c, features) for c in rule.all_of):
            hits.append(
                RuleHit(
                    rule_id=rule.id,
                    description=rule.description,
                    action=rule.action,
                    conditions=tuple(
                        {
                            "feature": c.feature,
                            "op": c.op.value,
                            "value": c.value,
                            "observed": float(features[c.feature]),
                        }
                        for c in rule.all_of
                    ),
                )
            )

    # Escalate-only: reduce over the maximum, never the last rule.
    action = Action.CONTINUE
    for hit in hits:
        if SEVERITY[hit.action] > SEVERITY[action]:
            action = hit.action

    return PolicyDecision(
        action=action,
        severity=SEVERITY[action],
        policy_version=policy.version,
        fired=tuple(sorted(hits, key=lambda h: (-SEVERITY[h.action], h.rule_id))),
        skipped=tuple(skipped),
    )


def escalates_to(a: Action | str, b: Action | str) -> bool:
    """True when ``b`` involves at least as much human involvement as ``a``."""
    return severity(b) >= severity(a)


def apply_escalate_only(current: Action | str, proposed: Action | str) -> Action:
    """Combine two actions without ever decreasing severity."""
    current_a = Action(current)
    proposed_a = Action(proposed)
    return proposed_a if severity(proposed_a) > severity(current_a) else current_a


def rule_summary(rule: Rule) -> str:
    parts = []
    for c in rule.all_of:
        op = {"gte": ">=", "lte": "<=", "gt": ">", "lt": "<"}[c.op.value]
        parts.append(f"{c.feature} {op} {c.value:g}")
    return " AND ".join(parts)
