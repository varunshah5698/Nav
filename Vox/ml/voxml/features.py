"""Window-level acoustic descriptors.

These are deliberately interpretable prosodic features rather than a learned
embedding: the baseline scorer must be explainable and the pipeline must be
runnable on CPU with no downloaded encoder.  A wav2vec 2.0 encoder can replace
the descriptor block later without changing the policy contract, because the
policy layer only consumes the named features below.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass

import numpy as np

from .audio import TARGET_SAMPLE_RATE
from .vad import FRAME_LENGTH, HOP_LENGTH, VadResult

WINDOW_SECONDS = 3.0
HOP_SECONDS = 1.5
WINDOW_SAMPLES = int(WINDOW_SECONDS * TARGET_SAMPLE_RATE)
HOP_SAMPLES = int(HOP_SECONDS * TARGET_SAMPLE_RATE)
MIN_F0_HZ = 60.0
MAX_F0_HZ = 400.0


@dataclass(frozen=True, slots=True)
class WindowFeatures:
    window_index: int
    start_seconds: float
    end_seconds: float
    speech_ratio: float
    rms_dbfs: float
    f0_mean_hz: float
    f0_std_semitones: float
    f0_range_semitones: float
    f0_slope_semitones: float
    centroid_khz: float
    flux: float
    hnr_db: float
    jitter: float
    shimmer: float
    pause_ratio: float
    low_band_ratio: float
    mid_band_ratio: float
    high_band_ratio: float
    zero_crossing_rate: float
    voiced_ratio: float

    def to_dict(self) -> dict[str, float | int]:
        return asdict(self)


def _semitones(hz: np.ndarray) -> np.ndarray:
    return 12.0 * np.log2(np.maximum(hz, 1e-6) / 100.0)


def _pitch_track(
    samples: np.ndarray, frame_speech: np.ndarray
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Autocorrelation F0 + harmonicity for speech frames.

    Returns (f0_hz, hnr_db, periodicity) arrays aligned with the frame index.
    """
    frame_count = frame_speech.size
    f0 = np.full(frame_count, np.nan, dtype=np.float64)
    hnr = np.full(frame_count, np.nan, dtype=np.float64)
    periodic = np.zeros(frame_count, dtype=np.float64)

    min_lag = max(2, int(TARGET_SAMPLE_RATE / MAX_F0_HZ))
    max_lag = int(TARGET_SAMPLE_RATE / MIN_F0_HZ)

    for i in range(frame_count):
        if not frame_speech[i]:
            continue
        start = i * HOP_LENGTH
        frame = samples[start : start + FRAME_LENGTH].astype(np.float64)
        if frame.size < FRAME_LENGTH:
            frame = np.pad(frame, (0, FRAME_LENGTH - frame.size))
        frame = frame - np.mean(frame)
        energy = float(np.dot(frame, frame))
        if energy < 1e-8:
            continue

        spectrum = np.fft.rfft(frame, n=2 * FRAME_LENGTH)
        autocorr = np.fft.irfft(np.abs(spectrum) ** 2)[: frame.size]
        if autocorr[0] <= 0:
            continue
        autocorr = autocorr / autocorr[0]
        upper = min(max_lag, autocorr.size - 1)
        if upper <= min_lag:
            continue
        segment = autocorr[min_lag : upper + 1]
        lag = int(np.argmax(segment)) + min_lag
        peak = float(autocorr[lag])
        if not math.isfinite(peak) or peak <= 0.0:
            continue
        # Parabolic interpolation around the peak for sub-sample accuracy.
        if 0 < lag < autocorr.size - 1:
            alpha, beta, gamma = autocorr[lag - 1], autocorr[lag], autocorr[lag + 1]
            denom = alpha - 2 * beta + gamma
            shift = 0.5 * (alpha - gamma) / denom if abs(denom) > 1e-12 else 0.0
            shift = float(np.clip(shift, -0.5, 0.5))
        else:  # pragma: no cover - boundary
            shift = 0.0
        f0[i] = TARGET_SAMPLE_RATE / (lag + shift)
        periodic[i] = peak
        clipped = float(np.clip(peak, 1e-4, 0.9999))
        hnr[i] = 10.0 * math.log10(clipped / (1.0 - clipped))

    return f0, hnr, periodic


def _band_ratios(power: np.ndarray, freqs: np.ndarray) -> tuple[float, float, float]:
    total = float(np.sum(power)) + 1e-12
    low = float(np.sum(power[(freqs >= 80) & (freqs < 500)]))
    mid = float(np.sum(power[(freqs >= 500) & (freqs < 2000)]))
    high = float(np.sum(power[(freqs >= 2000) & (freqs < 7000)]))
    return low / total, mid / total, high / total


def extract_window(
    samples: np.ndarray,
    vad: VadResult,
    start_sample: int,
    window_index: int,
    pitch_track: tuple[np.ndarray, np.ndarray, np.ndarray] | None = None,
) -> WindowFeatures:
    end_sample = min(samples.size, start_sample + WINDOW_SAMPLES)
    segment = samples[start_sample:end_sample]
    start_frame = start_sample // HOP_LENGTH
    end_frame = max(start_frame + 1, end_sample // HOP_LENGTH)
    end_frame = min(end_frame, vad.frame_speech.size)

    speech_frames = vad.frame_speech[start_frame:end_frame]
    usable = int(np.count_nonzero(speech_frames))
    total_frames = max(1, speech_frames.size)
    speech_ratio = usable / total_frames

    if usable == 0:
        # No usable speech: report measured signal properties, but make the
        # absence of evidence explicit rather than inventing prosody.
        rms = np.sqrt(np.mean(np.square(segment, dtype=np.float64))) if segment.size else 0.0
        return WindowFeatures(
            window_index=window_index,
            start_seconds=start_sample / TARGET_SAMPLE_RATE,
            end_seconds=end_sample / TARGET_SAMPLE_RATE,
            speech_ratio=0.0,
            rms_dbfs=_db(rms),
            f0_mean_hz=0.0,
            f0_std_semitones=0.0,
            f0_range_semitones=0.0,
            f0_slope_semitones=0.0,
            centroid_khz=0.0,
            flux=0.0,
            hnr_db=0.0,
            jitter=0.0,
            shimmer=0.0,
            pause_ratio=1.0,
            low_band_ratio=0.0,
            mid_band_ratio=0.0,
            high_band_ratio=0.0,
            zero_crossing_rate=float(
                np.mean(vad.frame_zcr[start_frame:end_frame])
            )
            if end_frame > start_frame
            else 0.0,
            voiced_ratio=0.0,
        )

    speech_index = np.flatnonzero(speech_frames) + start_frame
    frame_rms_db = vad.frame_rms_db[speech_index]
    rms_dbfs = float(np.mean(frame_rms_db))

    f0_all, hnr_all, periodic_all = pitch_track or _pitch_track(
        samples, vad.frame_speech
    )
    f0_full = f0_all[speech_index]
    voiced = np.isfinite(f0_full) & (periodic_all[speech_index] > 0.28)
    voiced_f0 = f0_full[voiced]

    if voiced_f0.size >= 2:
        semis = _semitones(voiced_f0)
        f0_mean = float(np.mean(voiced_f0))
        f0_std = float(np.std(semis))
        p10, p90 = np.percentile(semis, [10, 90])
        f0_range = float(p90 - p10)
        t = np.arange(semis.size, dtype=np.float64)
        slope = float(np.polyfit(t, semis, 1)[0] * semis.size) if semis.size >= 3 else 0.0
        periods = 1.0 / np.maximum(voiced_f0, 1.0)
        jitter = float(np.mean(np.abs(np.diff(periods))) / max(np.mean(periods), 1e-6))
    else:
        f0_mean = float(np.nanmean(f0_full)) if np.any(np.isfinite(f0_full)) else 0.0
        f0_std = 0.0
        f0_range = 0.0
        slope = 0.0
        jitter = 0.0

    hnr_vals = hnr_all[speech_index]
    hnr_db = float(np.nanmean(hnr_vals)) if np.any(np.isfinite(hnr_vals)) else 0.0

    # Spectral descriptors over the speech frames of this window.
    weighted = segment * np.hanning(segment.size).astype(np.float32) if segment.size > 1 else segment
    spectrum = np.abs(np.fft.rfft(weighted)) + 1e-10
    power = spectrum**2
    freqs = np.fft.rfftfreq(weighted.size, d=1.0 / TARGET_SAMPLE_RATE)
    centroid = float(np.sum(freqs * power) / (np.sum(power) + 1e-12))
    low, mid, high = _band_ratios(power, freqs)

    # Spectral flux between consecutive VAD frames (normalised magnitudes).
    frame_spectra = []
    for i in range(start_frame, end_frame):
        s = samples[i * HOP_LENGTH : i * HOP_LENGTH + FRAME_LENGTH]
        if s.size < FRAME_LENGTH:
            s = np.pad(s, (0, FRAME_LENGTH - s.size))
        mag = np.abs(np.fft.rfft(s * np.hanning(FRAME_LENGTH).astype(np.float32)))
        frame_spectra.append(mag / (np.linalg.norm(mag) + 1e-9))
    if len(frame_spectra) > 1:
        diffs = np.diff(np.asarray(frame_spectra), axis=0)
        flux = float(np.mean(np.linalg.norm(diffs, axis=1)))
    else:  # pragma: no cover
        flux = 0.0

    energy = frame_rms_db / 20.0
    shimmer = (
        float(np.mean(np.abs(np.diff(energy))) / max(np.mean(np.abs(energy)), 1e-6))
        if energy.size > 1
        else 0.0
    )

    voiced_ratio = float(np.count_nonzero(voiced) / max(1, usable))
    pause_ratio = float(
        np.mean(vad.frame_rms_db[speech_index] < (rms_dbfs - 8.0))
    ) if speech_index.size else 0.0

    return WindowFeatures(
        window_index=window_index,
        start_seconds=start_sample / TARGET_SAMPLE_RATE,
        end_seconds=end_sample / TARGET_SAMPLE_RATE,
        speech_ratio=speech_ratio,
        rms_dbfs=rms_dbfs,
        f0_mean_hz=f0_mean,
        f0_std_semitones=f0_std,
        f0_range_semitones=f0_range,
        f0_slope_semitones=slope,
        centroid_khz=centroid / 1000.0,
        flux=flux,
        hnr_db=hnr_db,
        jitter=jitter,
        shimmer=shimmer,
        pause_ratio=pause_ratio,
        low_band_ratio=low,
        mid_band_ratio=mid,
        high_band_ratio=high,
        zero_crossing_rate=float(np.mean(vad.frame_zcr[speech_index])),
        voiced_ratio=voiced_ratio,
    )


def _db(value: float) -> float:
    return 20.0 * math.log10(value) if value > 1e-9 else -120.0


def build_windows(samples: np.ndarray, vad: VadResult) -> list[WindowFeatures]:
    """Segment the call into 3 s windows every 1.5 s (the guide's defaults)."""
    if samples.size < WINDOW_SAMPLES:
        return []
    pitch_track = _pitch_track(samples, vad.frame_speech)
    starts = range(0, samples.size - WINDOW_SAMPLES + 1, HOP_SAMPLES)
    return [
        extract_window(samples, vad, start, index, pitch_track)
        for index, start in enumerate(starts)
    ]
