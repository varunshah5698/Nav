"""Safety properties of the deterministic decision layer.

The central promise of VoxSafe is that evidence of distress can only move a
decision toward more human involvement, never away from it.  These tests try to
falsify that promise across generated feature combinations instead of checking a
few hand-picked examples.
"""

from __future__ import annotations

import pathlib

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from policy import PolicyError, load_policy, parse_policy
from policy.evaluator import apply_escalate_only, evaluate, severity
from policy.schema import Action

POLICY_PATH = pathlib.Path(__file__).resolve().parents[2] / "policy" / "policies" / "v1.yaml"
POLICY = load_policy(POLICY_PATH)

BASE_FEATURES = {
    "arousal": 0.4,
    "valence": -0.1,
    "dominance": 0.2,
    "arousal_ema": 0.4,
    "valence_ema": -0.1,
    "dominance_ema": 0.2,
    "arousal_std": 0.1,
    "p_calm": 0.3,
    "p_engaged": 0.3,
    "p_frustrated": 0.2,
    "p_distressed": 0.2,
    "p_unclear": 0.0,
    "consecutive_high_arousal_windows": 1,
    "speech_seconds_last_30s": 20.0,
    "speech_ratio": 0.8,
    "rms_db": -20.0,
    "f0_std_semitones": 2.0,
}


def _severity(features: dict[str, float]) -> int:
    return severity(evaluate(features, POLICY).action)


unit = st.floats(min_value=-1.0, max_value=1.0, allow_nan=False, allow_infinity=False)
probability = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)
windows = st.integers(min_value=0, max_value=25)
speech_seconds = st.floats(min_value=0.0, max_value=60.0, allow_nan=False)


@settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
)
@given(
    arousal=unit,
    valence=unit,
    p_distressed=probability,
    p_frustrated=probability,
    high_run=windows,
    speech=speech_seconds,
    arousal_delta=st.floats(min_value=0.0, max_value=2.0),
    valence_delta=st.floats(min_value=0.0, max_value=2.0),
    distress_delta=probability,
    frustration_delta=probability,
    run_delta=windows,
    speech_delta=speech_seconds,
)
def test_distress_evidence_can_only_escalate(
    arousal,
    valence,
    p_distressed,
    p_frustrated,
    high_run,
    speech,
    arousal_delta,
    valence_delta,
    distress_delta,
    frustration_delta,
    run_delta,
    speech_delta,
):
    base = {
        **BASE_FEATURES,
        "arousal_ema": arousal,
        "valence_ema": valence,
        "p_distressed": p_distressed,
        "p_frustrated": p_frustrated,
        "consecutive_high_arousal_windows": high_run,
        "speech_seconds_last_30s": speech,
    }

    escalated = {
        **base,
        # More arousal, more negative valence, higher distress and frustration
        # probabilities, longer high-arousal runs, less usable speech.
        "arousal_ema": min(1.0, arousal + arousal_delta),
        "valence_ema": max(-1.0, valence - valence_delta),
        "p_distressed": min(1.0, p_distressed + distress_delta),
        "p_frustrated": min(1.0, p_frustrated + frustration_delta),
        "consecutive_high_arousal_windows": high_run + run_delta,
        "speech_seconds_last_30s": max(0.0, speech - speech_delta),
    }

    assert _severity(escalated) >= _severity(base)


@settings(max_examples=300, deadline=None)
@given(
    arousal=unit,
    valence=unit,
    p_distressed=probability,
    p_frustrated=probability,
    high_run=windows,
    speech=speech_seconds,
)
def test_action_is_the_maximum_of_fired_rules(
    arousal, valence, p_distressed, p_frustrated, high_run, speech
):
    features = {
        **BASE_FEATURES,
        "arousal_ema": arousal,
        "valence_ema": valence,
        "p_distressed": p_distressed,
        "p_frustrated": p_frustrated,
        "consecutive_high_arousal_windows": high_run,
        "speech_seconds_last_30s": speech,
    }
    decision = evaluate(features, POLICY)
    fired_severities = [severity(hit.action) for hit in decision.fired]
    expected = max(fired_severities) if fired_severities else 0
    assert decision.severity == expected
    assert severity(decision.action) == expected


def test_escalate_only_combination_is_commutative_and_monotone():
    actions = list(Action)
    for left in actions:
        for right in actions:
            combined = apply_escalate_only(left, right)
            assert severity(combined) >= severity(left)
            assert severity(combined) >= severity(right)
            assert combined == apply_escalate_only(right, left)


def test_missing_feature_skips_the_rule_instead_of_assuming_calm():
    features = {k: v for k, v in BASE_FEATURES.items() if k != "valence_ema"}
    decision = evaluate(features, POLICY)
    skipped = {s.rule_id for s in decision.skipped}
    assert "R1" in skipped
    assert any("valence_ema" in s.reason for s in decision.skipped if s.rule_id == "R1")


def test_insufficient_speech_is_never_treated_as_calm():
    features = {**BASE_FEATURES, "speech_seconds_last_30s": 0.0}
    decision = evaluate(features, POLICY)
    assert decision.action is Action.REVIEW
    assert "R4" in {hit.rule_id for hit in decision.fired}


def test_credibility_is_disabled_by_default_and_never_decisive():
    features = {**BASE_FEATURES, "cred_ema": 0.0}
    assert evaluate(features, POLICY).action is Action.CONTINUE

    enabled = evaluate(features, POLICY, enabled_capabilities={"credibility"})
    assert enabled.action is Action.REVIEW
    assert "R5" in {hit.rule_id for hit in enabled.fired}


def test_credibility_rule_cannot_trigger_immediate_handoff():
    document = {
        "version": "test-bad",
        "description": "invalid policy",
        "rules": [
            {
                "id": "R9",
                "description": "credibility as a handoff trigger",
                "action": "HANDOFF_IMMEDIATE",
                "all_of": [{"feature": "cred_ema", "op": "lte", "value": 0.3}],
            }
        ],
    }
    with pytest.raises(PolicyError):
        parse_policy(document)


def test_policy_rejects_unknown_features():
    document = {
        "version": "test-unknown",
        "description": "unknown feature",
        "rules": [
            {
                "id": "R9",
                "description": "uses a feature outside the allow-list",
                "action": "REVIEW",
                "all_of": [{"feature": "borrower_income", "op": "lte", "value": 1}],
            }
        ],
    }
    with pytest.raises(PolicyError):
        parse_policy(document)


def test_shipped_policy_gates_credibility_behind_a_disabled_capability():
    """R5 exists in the document but cannot fire without the capability."""
    ids = {rule.id for rule in POLICY.rules}
    assert ids == {"R1", "R2", "R3", "R4", "R5"}
    assert next(r for r in POLICY.rules if r.id == "R1").action is Action.HANDOFF_IMMEDIATE

    r5 = next(r for r in POLICY.rules if r.id == "R5")
    assert r5.action is Action.REVIEW
    assert r5.requires_feature == "credibility"
    assert "R5" in {s.rule_id for s in evaluate(BASE_FEATURES, POLICY).skipped}
