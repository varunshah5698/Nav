"""Timeline smoothing and rolling evidence features.

The policy engine consumes *smoothed* features and calibrated probabilities, not
raw per-window noise.  Windows with no usable speech do not update the moving
average: carrying the previous estimate forward is more honest than resetting to
neutral, and rule R4 separately forces review while evidence is insufficient.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .features import HOP_SECONDS, WindowFeatures
from .scoring import WindowScore

EMA_ALPHA = 0.3
#: A window counts as "high arousal" for run-length purposes when the smoothed
#: arousal is at or above this value. R1 additionally requires >= 0.70 smoothed
#: arousal plus negative valence before it fires.
HIGH_AROUSAL_EMA = 0.55
SPEECH_WINDOW_SECONDS = 30.0


@dataclass(slots=True)
class SmoothedWindow:
    features: WindowFeatures
    score: WindowScore
    arousal_ema: float
    valence_ema: float
    dominance_ema: float
    consecutive_high_arousal_windows: int
    speech_seconds_last_30s: float
    arousal_std: float

    def policy_features(self) -> dict[str, float]:
        return {
            "arousal": self.score.arousal,
            "valence": self.score.valence,
            "dominance": self.score.dominance,
            "arousal_ema": round(self.arousal_ema, 4),
            "valence_ema": round(self.valence_ema, 4),
            "dominance_ema": round(self.dominance_ema, 4),
            "arousal_std": round(self.arousal_std, 4),
            "p_calm": self.score.p_calm,
            "p_engaged": self.score.p_engaged,
            "p_frustrated": self.score.p_frustrated,
            "p_distressed": self.score.p_distressed,
            "p_unclear": self.score.p_unclear,
            "consecutive_high_arousal_windows": float(
                self.consecutive_high_arousal_windows
            ),
            "speech_seconds_last_30s": round(self.speech_seconds_last_30s, 3),
            "speech_ratio": self.score.speech_ratio,
            "rms_db": self.features.rms_dbfs,
            "f0_std_semitones": self.features.f0_std_semitones,
        }


@dataclass(slots=True)
class Smoother:
    alpha: float = EMA_ALPHA
    _ema: dict[str, float] = field(default_factory=lambda: {})
    _high_run: int = 0
    _history: list[tuple[float, float]] = field(default_factory=list)  # (end_s, speech_s)
    _arousal_window: list[float] = field(default_factory=list)

    def update(self, features: WindowFeatures, score: WindowScore) -> SmoothedWindow:
        usable = score.quality_status not in {"silence"} and features.speech_ratio > 0.05

        if usable:
            if not self._ema:
                self._ema = {
                    "arousal": score.arousal,
                    "valence": score.valence,
                    "dominance": score.dominance,
                }
            else:
                for axis in ("arousal", "valence", "dominance"):
                    raw = getattr(score, axis)
                    self._ema[axis] = self.alpha * raw + (1 - self.alpha) * self._ema[axis]
        elif not self._ema:
            self._ema = {"arousal": 0.0, "valence": 0.0, "dominance": 0.0}

        arousal_ema = self._ema["arousal"]
        if usable and arousal_ema >= HIGH_AROUSAL_EMA:
            self._high_run += 1
        elif usable:
            self._high_run = 0

        # Windows overlap by one hop, so each window contributes only its hop's
        # worth of speech. Summing the full window length would double-count
        # and could hide an R4 (insufficient evidence) escalation.
        window_speech = features.speech_ratio * HOP_SECONDS
        self._history.append((features.end_seconds, window_speech))
        cutoff = features.end_seconds - SPEECH_WINDOW_SECONDS
        self._history = [(end, s) for end, s in self._history if end > cutoff]
        speech_seconds = float(sum(s for _, s in self._history))

        self._arousal_window.append(score.arousal)
        self._arousal_window = self._arousal_window[-6:]
        arousal_std = float(np.std(self._arousal_window)) if len(self._arousal_window) > 1 else 0.0

        return SmoothedWindow(
            features=features,
            score=score,
            arousal_ema=arousal_ema,
            valence_ema=self._ema["valence"],
            dominance_ema=self._ema["dominance"],
            consecutive_high_arousal_windows=self._high_run,
            speech_seconds_last_30s=speech_seconds,
            arousal_std=arousal_std,
        )
