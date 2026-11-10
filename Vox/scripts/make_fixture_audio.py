#!/usr/bin/env python3
"""Generate SYNTHETIC test fixtures for VoxSafe's automated demo.

These files are NOT real calls and must never be presented as customer data or
used for model training/evaluation.  They exist so the upload -> analysis ->
handoff path can be exercised end to end without a real recording.

    python scripts/make_fixture_audio.py            # writes into fixtures/audio
    python scripts/make_fixture_audio.py --out DIR

The generator is deterministic (fixed seed) and CPU-only.
"""

from __future__ import annotations

import argparse
import math
import wave
from pathlib import Path

import numpy as np

SR = 16_000


def _syllable_envelope(n: int, rate: float, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n) / SR
    # Amplitude modulation approximating syllable rate (3-5 Hz).
    env = 0.55 + 0.45 * np.abs(np.sin(2 * math.pi * rate * t + 0.4))
    jitter = 1.0 + 0.08 * rng.standard_normal(n).cumsum() / math.sqrt(n)
    return np.clip(env * jitter, 0.0, 1.6)


def _formant_shaped(f0: np.ndarray, n: int, brightness: float) -> np.ndarray:
    t = np.arange(n) / SR
    phase = 2 * math.pi * np.cumsum(f0) / SR
    sig = np.zeros(n, dtype=np.float64)
    for harmonic in range(1, 14):
        weight = 1.0 / (harmonic ** (1.35 - brightness * 0.5))
        sig += weight * np.sin(harmonic * phase + 0.3 * harmonic)
    # Breath / tension noise.
    noise = rng_noise(n)
    return sig / (np.max(np.abs(sig)) + 1e-9) + brightness * 0.12 * noise


def rng_noise(n: int) -> np.ndarray:
    return np.random.default_rng(7).standard_normal(n) * 0.35


def make_calm(seconds: float = 20.0, seed: int = 11) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    # Slow, narrow pitch movement (about 1.6 semitones of total excursion).
    f0 = 132.0 * 2 ** ((1.0 * np.sin(2 * math.pi * 0.18 * t)) / 12.0)
    sig = _formant_shaped(f0, n, brightness=0.15)
    env = _syllable_envelope(n, 3.1, rng)
    # Regular pauses: calm turn-taking rhythm.
    gate = np.ones(n)
    for start in (3.2, 7.8, 12.4, 16.6):
        s, e = int(start * SR), int((start + 0.9) * SR)
        gate[s:e] = 0.02
    sig = sig * env * gate
    sig = sig / (np.max(np.abs(sig)) + 1e-9) * 0.16
    return sig.astype(np.float32)


def make_agitated(seconds: float = 20.0, seed: int = 23) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    # Wide, fast pitch excursions with a rising overall contour: high arousal
    # and negative-prosody cues, not a claim about a real person's feelings.
    contour = 0.35 * (t / seconds)
    f0 = 205.0 * 2 ** (
        (4.6 * np.sin(2 * math.pi * 0.55 * t + 0.7) + 1.9 * np.sin(2 * math.pi * 1.9 * t)) / 12.0
        + contour
    )
    sig = _formant_shaped(f0, n, brightness=0.85)
    env = _syllable_envelope(n, 5.6, rng)
    gate = np.ones(n)
    for start in (5.0, 11.2, 15.9):
        s, e = int(start * SR), int((start + 0.45) * SR)
        gate[s:e] = 0.03
    sig = sig * env * gate
    sig = sig / (np.max(np.abs(sig)) + 1e-9) * 0.72
    # Light breathiness pushes spectral flatness up without clipping.
    sig = np.clip(sig, -0.98, 0.98)
    return sig.astype(np.float32)


def make_silence(seconds: float = 12.0) -> np.ndarray:
    n = int(seconds * SR)
    rng = np.random.default_rng(5)
    return (rng.standard_normal(n) * 0.0008).astype(np.float32)


def write(path: Path, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.round(np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(SR)
        fh.writeframes(pcm.tobytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parents[1] / "fixtures" / "audio"),
    )
    args = parser.parse_args()
    out = Path(args.out)
    fixtures = {
        "synthetic_calm_turn.wav": make_calm(),
        "synthetic_agitated_turn.wav": make_agitated(),
        "synthetic_silence.wav": make_silence(),
    }
    for name, samples in fixtures.items():
        write(out / name, samples)
        print(f"wrote {out / name} ({len(samples) / SR:.1f}s)")
    print(
        "\nSYNTHETIC FIXTURES: for pipeline tests and demo only. "
        "Not real calls, not training data, not model evaluation data."
    )


if __name__ == "__main__":
    main()
