"""Energy / spectral voice-activity detection.

Silero VAD is the production target, but it requires torch and a downloaded
model artifact.  This module provides a deterministic, dependency-light VAD that
is used for the baseline: adaptive noise floor, spectral flatness, zero-crossing
rate and median smoothing.  It is intentionally conservative — silence is
reported as silence rather than being scored as calm speech.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from .audio import TARGET_SAMPLE_RATE

FRAME_LENGTH = 640  # 40 ms
HOP_LENGTH = 160  # 10 ms
MIN_SPEECH_SECONDS = 0.12
ABS_FLOOR_DBFS = -55.0
#: Minimum separation between the low and high energy classes for the split to
#: be considered meaningful. Below this the recording has no usable dynamic
#: range (steady hum, constant noise) and we refuse to call it speech.
MIN_CLASS_SEPARATION_DB = 5.0


@dataclass(frozen=True, slots=True)
class VadResult:
    frame_speech: np.ndarray  # bool per frame
    frame_rms_db: np.ndarray  # float per frame
    frame_flatness: np.ndarray
    frame_zcr: np.ndarray
    speech_ratio: float
    speech_seconds: float
    noise_floor_dbfs: float

    def segments(self) -> list[dict[str, float]]:
        """Contiguous speech segments in seconds."""
        out: list[dict[str, float]] = []
        start: int | None = None
        for i, is_speech in enumerate(self.frame_speech):
            if is_speech and start is None:
                start = i
            elif not is_speech and start is not None:
                out.append(self._segment(start, i))
                start = None
        if start is not None:
            out.append(self._segment(start, len(self.frame_speech)))
        return out

    @staticmethod
    def _segment(start: int, end: int) -> dict[str, float]:
        return {
            "start": (start * HOP_LENGTH) / TARGET_SAMPLE_RATE,
            "end": (end * HOP_LENGTH) / TARGET_SAMPLE_RATE,
        }


def _frames(samples: np.ndarray) -> np.ndarray:
    if samples.size < FRAME_LENGTH:
        pad = np.zeros(FRAME_LENGTH - samples.size, dtype=np.float32)
        return np.concatenate([samples, pad])[None, :]
    count = 1 + (samples.size - FRAME_LENGTH) // HOP_LENGTH
    idx = (
        np.arange(count)[:, None] * HOP_LENGTH
        + np.arange(FRAME_LENGTH)[None, :]
    )
    return samples[idx]


def _median_smooth(mask: np.ndarray, width: int = 5) -> np.ndarray:
    if mask.size < width:
        return mask
    kernel = np.ones(width)
    counts = np.convolve(mask.astype(np.float64), kernel, mode="same")
    return counts >= (width // 2 + 1)


def _otsu_threshold(values: np.ndarray, bins: int = 128) -> float:
    """Deterministic Otsu split of frame energy (dB) into noise/speech classes."""
    lo = float(np.min(values))
    hi = float(np.max(values))
    if not math.isfinite(lo) or not math.isfinite(hi) or hi - lo < 1e-6:
        return hi

    hist, edges = np.histogram(values, bins=bins, range=(lo, hi))
    hist = hist.astype(np.float64)
    total = hist.sum()
    if total <= 0:
        return hi
    centres = (edges[:-1] + edges[1:]) / 2.0
    weight_bg = np.cumsum(hist)
    weight_fg = total - weight_bg
    cum_mean = np.cumsum(hist * centres)
    mean_bg = cum_mean / np.maximum(weight_bg, 1e-9)
    mean_fg = (cum_mean[-1] - cum_mean) / np.maximum(weight_fg, 1e-9)
    between = weight_bg * weight_fg * (mean_bg - mean_fg) ** 2
    between[~np.isfinite(between)] = -1.0
    idx = int(np.argmax(between))
    return float(centres[idx])


def detect(samples: np.ndarray) -> VadResult:
    frames = _frames(samples)
    window = np.hanning(FRAME_LENGTH).astype(np.float32)

    weighted = frames * window
    rms = np.sqrt(np.mean(np.square(frames, dtype=np.float64), axis=1))
    rms_db = 20.0 * np.log10(np.maximum(rms, 1e-9))

    # Zero crossing rate
    signs = np.signbit(frames)
    zcr = np.mean(signs[:, 1:] != signs[:, :-1], axis=1)

    spectrum = np.abs(np.fft.rfft(weighted, axis=1)) + 1e-10
    power = spectrum**2
    flatness = np.exp(np.mean(np.log(power), axis=1)) / np.mean(power, axis=1)

    # Adaptive split between the quiet and active classes in this recording.
    noise_floor = float(np.percentile(rms_db, 5))
    otsu = _otsu_threshold(rms_db)
    threshold = max(otsu, ABS_FLOOR_DBFS)

    high = rms_db[rms_db > threshold]
    low = rms_db[rms_db <= threshold]
    separation_ok = (
        high.size > 0
        and low.size > 0
        and (float(np.mean(high)) - float(np.mean(low))) >= MIN_CLASS_SEPARATION_DB
    )

    candidate = (
        (rms_db > threshold)
        & (zcr < 0.32)
        & (flatness < 0.55)
    )
    if not separation_ok:
        candidate = np.zeros_like(candidate)

    # A sustained floor of quiet frames inside the recording confirms the
    # threshold is not simply "everything is loud".
    mask = _median_smooth(candidate.astype(np.float64) >= 1, width=5)

    # Remove runs shorter than the minimum speech duration.
    min_frames = max(1, int(MIN_SPEECH_SECONDS * TARGET_SAMPLE_RATE / HOP_LENGTH))
    cleaned = np.zeros_like(mask)
    start: int | None = None
    for i, flag in enumerate(mask):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            if i - start >= min_frames:
                cleaned[start:i] = True
            start = None
    if start is not None and mask.size - start >= min_frames:
        cleaned[start:] = True

    speech_frames = int(np.count_nonzero(cleaned))
    speech_seconds = speech_frames * HOP_LENGTH / TARGET_SAMPLE_RATE
    return VadResult(
        frame_speech=cleaned,
        frame_rms_db=rms_db,
        frame_flatness=flatness,
        frame_zcr=zcr,
        speech_ratio=speech_frames / max(1, cleaned.size),
        speech_seconds=speech_seconds,
        noise_floor_dbfs=noise_floor,
    )


def slice_frames(vad: VadResult, start_sample: int, end_sample: int) -> slice:
    start = start_sample // HOP_LENGTH
    end = max(start + 1, end_sample // HOP_LENGTH)
    return slice(start, min(end, vad.frame_speech.size))
