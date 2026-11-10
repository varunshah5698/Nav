"""Audio pipeline tests against the committed synthetic fixtures.

These fixtures are synthetic signals used only by tests; they are never inserted
into a customer workspace by the test suite.
"""

from __future__ import annotations

import pathlib

import numpy as np
import pytest

from policy import load_policy
from voxml.audio import decode_16k_mono, normalize
from voxml.pipeline import analyze_file
from voxml.scoring import MODEL_VERSION
from voxml.smoothing import EMA_ALPHA

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
AUDIO = REPO_ROOT / "fixtures" / "audio"
POLICY = load_policy(REPO_ROOT / "policy" / "policies" / "v1.yaml")


def analyze(name: str):
    analysis, samples = analyze_file(
        AUDIO / name, policy=POLICY, model_version=MODEL_VERSION
    )
    return analysis, samples


@pytest.fixture(scope="module")
def agitated():
    return analyze("synthetic_agitated_turn.wav")


@pytest.fixture(scope="module")
def silence():
    return analyze("synthetic_silence.wav")


@pytest.fixture(scope="module")
def calm():
    return analyze("synthetic_calm_turn.wav")


def test_audio_is_normalized_to_16k_mono(calm):
    _, samples = calm
    assert samples.dtype == np.float32
    assert len(samples) == pytest.approx(20 * 16_000, rel=0.02)
    assert float(np.max(np.abs(samples))) <= 1.0 + 1e-6

    decoded = decode_16k_mono(AUDIO / "synthetic_calm_turn.wav")
    assert decoded.size > 0
    normalized, quality = normalize(decoded)
    assert 0.0 < quality.peak_amplitude <= 1.0 + 1e-6
    assert normalized.size == decoded.size


def test_windows_use_three_second_length_and_one_and_a_half_second_hop(calm):
    analysis, _ = calm
    starts = [round(w.features.start_seconds, 3) for w in analysis.windows]
    assert starts[0] == 0.0
    diffs = np.diff(starts)
    assert np.allclose(diffs, 1.5, atol=1e-6)
    lengths = [
        round(w.features.end_seconds - w.features.start_seconds, 3)
        for w in analysis.windows[:-1]
    ]
    assert np.allclose(lengths, 3.0, atol=1e-6)
    assert all(len(w.policy_features) >= 8 for w in analysis.windows)


def test_ema_smoothing_matches_the_configured_alpha(calm):
    analysis, _ = calm
    usable = [
        w
        for w in analysis.windows
        if w.score.quality_status != "silence" and w.features.speech_ratio > 0.05
    ]
    assert len(usable) >= 3

    previous = usable[0].smoothed.arousal_ema
    assert previous == pytest.approx(usable[0].score.arousal, abs=1e-9)
    for window in usable[1:]:
        expected = EMA_ALPHA * window.score.arousal + (1 - EMA_ALPHA) * previous
        assert window.smoothed.arousal_ema == pytest.approx(expected, abs=1e-6)
        previous = window.smoothed.arousal_ema


def test_speech_totals_never_exceed_the_recording(agitated, calm):
    for analysis, _ in (agitated, calm):
        assert 0.0 <= analysis.speech_seconds <= analysis.duration_seconds + 1e-6
        for window in analysis.windows:
            assert window.smoothed.speech_seconds_last_30s <= 30.0 + 1e-6


def test_silence_is_scored_as_unclear_and_escalates_to_review(silence):
    analysis, _ = silence
    assert analysis.speech_seconds < 1.0
    assert {w.score.state for w in analysis.windows} == {"unclear"}
    assert analysis.action.value == "REVIEW"
    assert analysis.handoff_required is False
    assert "R4" in {hit.rule_id for w in analysis.windows for hit in w.decision.fired}


def test_agitated_speech_triggers_a_sustained_distress_handoff(agitated):
    analysis, _ = agitated
    assert analysis.action.value == "HANDOFF_IMMEDIATE"
    assert analysis.handoff_required is True

    handoff_windows = [
        w for w in analysis.windows if w.decision.action.value == "HANDOFF_IMMEDIATE"
    ]
    assert handoff_windows, "at least one window must escalate"
    assert handoff_windows[0].features.start_seconds <= 6.0
    assert "R1" in {hit.rule_id for hit in handoff_windows[0].decision.fired}

    assert analysis.episodes
    distress = [e for e in analysis.episodes if e.action == "HANDOFF_IMMEDIATE"]
    assert distress and distress[0].kind == "distress"
    assert distress[0].evidence


def test_calm_speech_does_not_escalate_to_a_handoff(calm):
    analysis, _ = calm
    assert analysis.action.value != "HANDOFF_IMMEDIATE"
    assert analysis.handoff_required is False
    states = {w.score.state for w in analysis.windows}
    assert states & {"calm", "engaged"}
    assert all(
        w.decision.action.value != "HANDOFF_IMMEDIATE" for w in analysis.windows
    )


def test_call_action_is_the_maximum_window_decision(agitated, silence, calm):
    severity = {"CONTINUE": 0, "REVIEW": 1, "HANDOFF_IMMEDIATE": 2}
    for analysis, _ in (agitated, silence, calm):
        window_max = max(severity[w.decision.action.value] for w in analysis.windows)
        assert severity[analysis.action.value] == window_max
