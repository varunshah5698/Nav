"""End-to-end analysis: audio file -> windows -> scores -> policy decisions.

Kept free of database and web concerns so it can be unit-tested and run from the
ML CLI as well as from the request worker.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from policy import Action, Policy, evaluate, severity

from .audio import AudioQuality, decode_16k_mono, normalize
from .features import WINDOW_SECONDS, WindowFeatures, build_windows
from .scoring import WindowScore, score_window
from .smoothing import SmoothedWindow, Smoother
from .vad import VadResult, detect


@dataclass(slots=True)
class WindowResult:
    features: WindowFeatures
    score: WindowScore
    smoothed: SmoothedWindow
    policy_features: dict[str, float]
    decision: Any
    decision_payload: dict[str, Any]


@dataclass(slots=True)
class RiskEpisode:
    start_seconds: float
    end_seconds: float
    action: str
    severity: int
    kind: str
    window_indices: list[int]
    evidence: list[dict[str, Any]]
    peak: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "start_seconds": round(self.start_seconds, 3),
            "end_seconds": round(self.end_seconds, 3),
            "action": self.action,
            "severity": self.severity,
            "kind": self.kind,
            "window_indices": self.window_indices,
            "evidence": self.evidence,
            "peak": self.peak,
        }


@dataclass(slots=True)
class CallAnalysis:
    duration_seconds: float
    quality: AudioQuality
    vad: VadResult
    windows: list[WindowResult]
    action: Action
    policy_version: str
    model_version: str
    episodes: list[RiskEpisode]
    timings_ms: dict[str, float]
    speech_seconds: float
    speech_segments: list[dict[str, float]] = field(default_factory=list)

    @property
    def handoff_required(self) -> bool:
        return self.action is Action.HANDOFF_IMMEDIATE

    def summary(self) -> dict[str, Any]:
        counts: dict[str, int] = {
            "calm": 0,
            "engaged": 0,
            "frustrated": 0,
            "distressed": 0,
            "unclear": 0,
        }
        for w in self.windows:
            counts[w.score.state] = counts.get(w.score.state, 0) + 1
        return {
            "duration_seconds": round(self.duration_seconds, 3),
            "speech_seconds": round(self.speech_seconds, 3),
            "window_count": len(self.windows),
            "action": self.action.value,
            "state_counts": counts,
            "episode_count": len(self.episodes),
            "handoff_required": self.handoff_required,
            "timings_ms": self.timings_ms,
            "speech_segments": self.speech_segments,
            "quality": {
                "rms_dbfs": round(self.quality.rms_dbfs, 2),
                "peak_amplitude": round(self.quality.peak_amplitude, 4),
                "clipping_ratio": round(self.quality.clipping_ratio, 5),
                "silent_ratio": round(self.quality.silent_ratio, 4),
            },
        }


def analyze_samples(
    samples,  # np.ndarray, kept loose to avoid numpy import at call sites
    *,
    policy: Policy,
    quality: AudioQuality,
    model_version: str,
    enabled_capabilities: frozenset[str] | set[str] = frozenset(),
    timings: dict[str, float] | None = None,
) -> CallAnalysis:
    timings = dict(timings or {})
    t0 = time.perf_counter()
    vad = detect(samples)
    timings["vad_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    t1 = time.perf_counter()
    windows = build_windows(samples, vad)
    timings["features_ms"] = round((time.perf_counter() - t1) * 1000, 2)

    if not windows:
        raise ValueError(
            f"recording is shorter than the {WINDOW_SECONDS:.0f}s analysis window"
        )

    smoother = Smoother()
    results: list[WindowResult] = []
    score_ms = 0.0
    policy_ms = 0.0

    for features in windows:
        s0 = time.perf_counter()
        score = score_window(features, audio_clipped=quality.is_clipped)
        score_ms += (time.perf_counter() - s0) * 1000

        smoothed = smoother.update(features, score)
        policy_features = smoothed.policy_features()

        p0 = time.perf_counter()
        decision = evaluate(
            policy_features, policy, enabled_capabilities=enabled_capabilities
        )
        policy_ms += (time.perf_counter() - p0) * 1000

        payload = decision.to_dict()
        payload["observed"] = {
            k: round(float(v), 4) for k, v in policy_features.items()
        }
        results.append(
            WindowResult(
                features=features,
                score=score,
                smoothed=smoothed,
                policy_features=policy_features,
                decision=decision,
                decision_payload=payload,
            )
        )

    timings["scoring_ms"] = round(score_ms, 2)
    timings["policy_ms"] = round(policy_ms, 2)
    timings["inference_total_ms"] = round(score_ms + policy_ms, 2)

    call_action = Action.CONTINUE
    for result in results:
        if severity(result.decision.action) > severity(call_action):
            call_action = result.decision.action

    episodes = _build_episodes(results)
    # Windows overlap (3 s window, 1.5 s hop), so summing per-window speech
    # would double-count. VAD counts each frame exactly once.
    speech_seconds = min(vad.speech_seconds, quality.duration_seconds)
    timings["total_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    return CallAnalysis(
        duration_seconds=quality.duration_seconds,
        quality=quality,
        vad=vad,
        windows=results,
        action=call_action,
        policy_version=policy.version,
        model_version=model_version,
        episodes=episodes,
        timings_ms=timings,
        speech_seconds=speech_seconds,
        speech_segments=vad.segments(),
    )


def analyze_file(
    path: str | Path,
    *,
    policy: Policy,
    model_version: str,
    enabled_capabilities: frozenset[str] | set[str] = frozenset(),
) -> tuple[CallAnalysis, Any]:
    timings: dict[str, float] = {}
    t0 = time.perf_counter()
    raw = decode_16k_mono(path)
    timings["decode_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    t1 = time.perf_counter()
    samples, quality = normalize(raw)
    timings["normalize_ms"] = round((time.perf_counter() - t1) * 1000, 2)

    analysis = analyze_samples(
        samples,
        policy=policy,
        quality=quality,
        model_version=model_version,
        enabled_capabilities=enabled_capabilities,
        timings=timings,
    )
    return analysis, samples


def _episode_kind(actions: set[str], rules: set[str]) -> str:
    if Action.HANDOFF_IMMEDIATE.value in actions:
        return "distress"
    if rules and rules <= {"R4"}:
        return "insufficient_evidence"
    return "review"


def _build_episodes(results: list[WindowResult]) -> list[RiskEpisode]:
    """Group contiguous flagged windows into human-readable risk moments.

    Grouping is purely derived from recorded per-window decisions; it never
    invents severity.  A gap of more than one hop separates episodes so that two
    independent moments are not reported as one.
    """
    episodes: list[RiskEpisode] = []
    current: list[WindowResult] = []

    def flush() -> None:
        if not current:
            return
        worst = max(current, key=lambda w: (severity(w.decision.action), w.score.p_distressed))
        rules: dict[str, dict[str, Any]] = {}
        for w in current:
            for hit in w.decision.fired:
                rules[hit.rule_id] = hit.to_dict()
        actions = {w.decision.action.value for w in current}
        peak_arousal = max(w.smoothed.arousal_ema for w in current)
        min_valence = min(w.smoothed.valence_ema for w in current)
        episodes.append(
            RiskEpisode(
                start_seconds=current[0].features.start_seconds,
                end_seconds=current[-1].features.end_seconds,
                action=worst.decision.action.value,
                severity=severity(worst.decision.action),
                kind=_episode_kind(actions, set(rules)),
                window_indices=[w.features.window_index for w in current],
                evidence=sorted(
                    rules.values(),
                    key=lambda e: (-severity(e["action"]), e["rule_id"]),
                ),
                peak={
                    "arousal_ema": round(peak_arousal, 4),
                    "valence_ema": round(min_valence, 4),
                    "p_distressed": round(max(w.score.p_distressed for w in current), 4),
                    "p_frustrated": round(max(w.score.p_frustrated for w in current), 4),
                    "dominant_state": worst.score.state,
                    "quality_status": worst.score.quality_status,
                },
            )
        )

    previous_end: float | None = None
    for result in results:
        flagged = severity(result.decision.action) > 0
        if not flagged:
            flush()
            current = []
            previous_end = result.features.end_seconds
            continue
        gap = (
            previous_end is not None
            and result.features.start_seconds - previous_end > 1.6
        )
        if current and gap:
            flush()
            current = []
        current.append(result)
        previous_end = result.features.end_seconds
    flush()
    return episodes
