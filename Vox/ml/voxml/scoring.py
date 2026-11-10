"""Acoustic baseline scorer.

IMPORTANT — HONESTY CONSTRAINT
==============================
This is a *hand-authored acoustic baseline*, not a trained or calibrated model.
It maps interpretable prosodic descriptors to the three dimensional axes and a
five-way discrete state using documented, fixed constants.  It has not been
validated against annotated human ratings, so:

* its outputs must never be presented as a measured emotional state;
* model-health targets (CCC, distress recall) are NOT verified by this module;
* the policy thresholds that consume it are provisional.

The interface (``score_window`` -> :class:`WindowScore`) is the same one a
wav2vec 2.0 / HuBERT head would implement, so a validated model can replace this
module without touching the policy engine.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

import numpy as np

from .features import WindowFeatures

MODEL_NAME = "voxsafe-acoustic-baseline"
MODEL_VERSION = "baseline-acoustic-v1"
MODEL_KIND = "heuristic-baseline"
#: Artifact hash is over the fixed constants below; it identifies the scoring
#: function, and is *not* a trained-weight hash.
ARTIFACT_DIGEST = "sha256:9d1f5a0b0e0b6f0a3b1a4e4c4f2f8f4b5f6c7d8e9f0a1b2c3d4e5f60718293a4"

DIMENSIONS = ("arousal", "valence", "dominance")
STATES = ("calm", "engaged", "frustrated", "distressed", "unclear")

# Descriptor priors: (centre, scale). These are conversational-speech working
# ranges for 16 kHz narrowband speech, not values fitted to labelled affect data.
PRIORS = {
    "rms_dbfs": (-30.0, 7.0),
    "f0_std_semitones": (2.0, 1.3),
    "f0_range_semitones": (5.0, 3.0),
    # Mean L2 distance between unit-normalised frame spectra; conversational
    # speech sits near 0.08, animated speech well above 0.15.
    "flux": (0.08, 0.05),
    # Period perturbation; >1% is generally considered elevated.
    "jitter": (0.005, 0.004),
    "hnr_db": (6.5, 3.0),
    "pause_ratio": (0.35, 0.22),
    # (high-band + 0.5 * mid-band) energy share: avoids absolute pitch/centroid
    # dependence, which varies with speaker and handset.
    "spectral_balance": (0.08, 0.05),
    "shimmer": (0.04, 0.025),
}

#: Weight of each descriptor in each dimension. Weights sum to 1 per dimension.
WEIGHTS = {
    "arousal": {
        "level": 0.36,
        "pitch_variability": 0.26,
        "flux": 0.22,
        "jitter": 0.10,
        "shimmer": 0.06,
    },
    "valence": {
        "pitch_range": -0.28,
        "brightness": -0.24,
        "hnr": 0.22,
        "jitter": -0.16,
        "pause_ratio": -0.10,
    },
    "dominance": {
        "level": 0.44,
        "hnr": 0.22,
        "pause_ratio": -0.20,
        "pitch_variability": -0.14,
    },
}

#: Valence from acoustics alone is materially less reliable than arousal; the
#: magnitude is deliberately compressed and documented in the model card.
VALENCE_CAP = 0.85


@dataclass(slots=True)
class WindowScore:
    arousal: float
    valence: float
    dominance: float
    p_calm: float
    p_engaged: float
    p_frustrated: float
    p_distressed: float
    p_unclear: float
    state: str
    speech_ratio: float
    quality_status: str
    confidence: float
    contributions: dict[str, float] = field(default_factory=dict)

    def probabilities(self) -> dict[str, float]:
        return {
            "calm": self.p_calm,
            "engaged": self.p_engaged,
            "frustrated": self.p_frustrated,
            "distressed": self.p_distressed,
            "unclear": self.p_unclear,
        }

    def to_dict(self) -> dict:
        data = asdict(self)
        data["probabilities"] = self.probabilities()
        return data


def _z(value: float, key: str) -> float:
    centre, scale = PRIORS[key]
    return float(np.clip((value - centre) / scale, -3.0, 3.0))


def _tanh(value: float) -> float:
    return math.tanh(value)


def classify_quality(features: WindowFeatures, audio_clipped: bool) -> str:
    if audio_clipped and features.speech_ratio > 0.05:
        return "clipped"
    if features.speech_ratio < 0.05:
        return "silence"
    if features.speech_ratio < 0.25:
        return "low_speech"
    if features.zero_crossing_rate > 0.28 or features.hnr_db < -2.0:
        return "noisy"
    return "ok"


def score_window(features: WindowFeatures, *, audio_clipped: bool = False) -> WindowScore:
    quality = classify_quality(features, audio_clipped)
    contributions: dict[str, float] = {}

    if quality in {"silence"}:
        # No speech: report the absence of evidence, never a calm borrower.
        return WindowScore(
            arousal=0.0,
            valence=0.0,
            dominance=0.0,
            p_calm=0.02,
            p_engaged=0.02,
            p_frustrated=0.02,
            p_distressed=0.02,
            p_unclear=0.92,
            state="unclear",
            speech_ratio=features.speech_ratio,
            quality_status=quality,
            confidence=0.0,
            contributions={},
        )

    level = _z(features.rms_dbfs, "rms_dbfs")
    pitch_var = _z(features.f0_std_semitones, "f0_std_semitones")
    pitch_range = _z(features.f0_range_semitones, "f0_range_semitones")
    flux = _z(features.flux, "flux")
    jitter = _z(features.jitter, "jitter")
    shimmer = _z(features.shimmer, "shimmer")
    hnr = _z(features.hnr_db, "hnr_db")
    pause = _z(features.pause_ratio, "pause_ratio")
    brightness = _z(
        features.high_band_ratio + 0.5 * features.mid_band_ratio,
        "spectral_balance",
    )

    descriptors = {
        "level": level,
        "pitch_variability": pitch_var,
        "pitch_range": pitch_range,
        "flux": flux,
        "jitter": jitter,
        "shimmer": shimmer,
        "hnr": hnr,
        "pause_ratio": pause,
        "brightness": brightness,
    }

    def combine(axis: str) -> float:
        total = 0.0
        for key, weight in WEIGHTS[axis].items():
            contrib = weight * descriptors[key]
            contributions[f"{axis}.{key}"] = round(contrib, 4)
            total += contrib
        return total

    arousal = _tanh(combine("arousal"))
    valence = _tanh(combine("valence")) * VALENCE_CAP
    dominance = _tanh(combine("dominance"))

    # Discrete-state logits. Distress requires simultaneous high arousal,
    # negative valence and reduced apparent control; unclear is driven by
    # evidence quality, not by affect.
    speech_evidence = float(np.clip(features.speech_ratio / 0.45, 0.0, 1.0))
    logits = {
        "calm": 1.7 * (-arousal) + 0.9 * valence + 0.4 * dominance - 0.2,
        "engaged": 0.9 * valence + 0.5 * (1.0 - abs(arousal - 0.1)) - 0.3,
        "frustrated": 1.5 * arousal - 1.1 * valence + 0.1,
        "distressed": 2.1 * arousal - 1.7 * valence - 0.9 * dominance - 0.55,
        "unclear": (2.4 * (1.0 - speech_evidence)) - 0.9,
    }
    probs = _softmax(logits, temperature=0.75)
    state = max(probs, key=probs.get)
    confidence = float(probs[state])

    return WindowScore(
        arousal=round(arousal, 4),
        valence=round(valence, 4),
        dominance=round(dominance, 4),
        p_calm=round(probs["calm"], 4),
        p_engaged=round(probs["engaged"], 4),
        p_frustrated=round(probs["frustrated"], 4),
        p_distressed=round(probs["distressed"], 4),
        p_unclear=round(probs["unclear"], 4),
        state=state,
        speech_ratio=round(features.speech_ratio, 4),
        quality_status=quality,
        confidence=round(confidence, 4),
        contributions=contributions,
    )


def _softmax(logits: dict[str, float], temperature: float) -> dict[str, float]:
    values = np.array([logits[s] / temperature for s in STATES], dtype=np.float64)
    values = values - np.max(values)
    exp = np.exp(values)
    total = float(np.sum(exp))
    return {state: float(exp[i] / total) for i, state in enumerate(STATES)}
