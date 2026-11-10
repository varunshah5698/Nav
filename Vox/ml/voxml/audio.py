"""Audio decoding, normalization and quality inspection.

All audio entering VoxSafe is normalized to mono, 16 kHz, float32 PCM before any
analysis.  Decoding shell-outs to ffmpeg are explicit, argument-list based (never
a shell string) and operate on files inside the configured media root only.
"""

from __future__ import annotations

import json
import math
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

TARGET_SAMPLE_RATE = 16_000
SUPPORTED_EXTENSIONS = {".wav", ".mp3", ".opus", ".ogg", ".m4a", ".webm"}
MAX_DURATION_SECONDS = 2 * 60 * 60
MIN_DURATION_SECONDS = 3.0
#: Peak normalization target (-1 dBFS) rather than 0 dBFS so resampling does not
#: introduce inter-sample overs.
PEAK_TARGET = 0.891
CLIP_LEVEL = 0.999


class AudioError(ValueError):
    """Raised for unreadable, empty, corrupt or unsupported audio."""


@dataclass(frozen=True, slots=True)
class AudioProbe:
    duration_seconds: float
    sample_rate: int
    channels: int
    codec: str
    container: str
    bit_rate: int | None


@dataclass(frozen=True, slots=True)
class AudioQuality:
    duration_seconds: float
    peak_amplitude: float
    rms_dbfs: float
    clipping_ratio: float
    dc_offset: float
    silent_ratio: float

    @property
    def is_clipped(self) -> bool:
        return self.clipping_ratio > 0.01

    @property
    def is_silent(self) -> bool:
        return self.silent_ratio > 0.95 or self.rms_dbfs < -60.0


def _run(cmd: list[str]) -> bytes:
    try:
        proc = subprocess.run(
            cmd, capture_output=True, check=False, timeout=180
        )
    except FileNotFoundError as exc:  # pragma: no cover - environment issue
        raise AudioError(
            "ffmpeg/ffprobe is not installed; audio processing is unavailable"
        ) from exc
    except subprocess.TimeoutExpired as exc:  # pragma: no cover
        raise AudioError("audio decode timed out") from exc
    if proc.returncode != 0:
        detail = proc.stderr.decode("utf-8", "replace").strip().splitlines()
        reason = detail[-1] if detail else f"ffmpeg exit {proc.returncode}"
        raise AudioError(f"could not decode audio: {reason}")
    return proc.stdout


def probe(path: str | Path) -> AudioProbe:
    path = Path(path)
    if not path.is_file():
        raise AudioError("audio file not found")
    if path.stat().st_size == 0:
        raise AudioError("audio file is empty")

    raw = _run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ]
    )
    try:
        info = json.loads(raw or b"{}")
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise AudioError("could not read audio metadata") from exc

    streams = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    if not streams:
        raise AudioError("file contains no audio stream")
    stream = streams[0]
    fmt = info.get("format", {})
    try:
        duration = float(fmt.get("duration") or stream.get("duration") or 0.0)
    except (TypeError, ValueError):
        duration = 0.0
    if not math.isfinite(duration) or duration <= 0:
        raise AudioError("could not determine audio duration")
    if duration < MIN_DURATION_SECONDS:
        raise AudioError(
            f"recording is too short ({duration:.1f}s); at least "
            f"{MIN_DURATION_SECONDS:.0f}s is required for one analysis window"
        )
    if duration > MAX_DURATION_SECONDS:
        raise AudioError("recording exceeds the 2 hour intake limit")

    bit_rate = fmt.get("bit_rate") or stream.get("bit_rate")
    return AudioProbe(
        duration_seconds=duration,
        sample_rate=int(stream.get("sample_rate") or 0),
        channels=int(stream.get("channels") or 0),
        codec=str(stream.get("codec_name") or "unknown"),
        container=str(fmt.get("format_name") or "unknown"),
        bit_rate=int(bit_rate) if bit_rate else None,
    )


def decode_16k_mono(path: str | Path) -> np.ndarray:
    """Decode any ffmpeg-supported file to mono 16 kHz float32 in [-1, 1]."""
    path = Path(path)
    raw = _run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-i",
            str(path),
            "-map",
            "0:a:0",
            "-ac",
            "1",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "pipe:1",
        ]
    )
    samples = np.frombuffer(raw, dtype="<f4")
    if samples.size == 0:
        raise AudioError("decoded audio is empty")
    if not np.all(np.isfinite(samples)):
        raise AudioError("decoded audio contains invalid samples")
    return np.ascontiguousarray(np.clip(samples, -1.0, 1.0), dtype=np.float32)


def normalize(samples: np.ndarray) -> tuple[np.ndarray, AudioQuality]:
    """Peak-normalize and describe the signal before feature extraction."""
    if samples.ndim != 1:
        raise AudioError("expected mono audio")
    if samples.size == 0:
        raise AudioError("decoded audio is empty")

    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    rms_dbfs = 20.0 * math.log10(rms) if rms > 1e-9 else -120.0
    clipping_ratio = float(np.mean(np.abs(samples) >= CLIP_LEVEL))
    dc_offset = float(np.mean(samples))

    # Frame-level silence estimate (100 ms frames).
    frame = TARGET_SAMPLE_RATE // 10
    usable = (samples.size // frame) * frame
    if usable:
        frames = samples[:usable].reshape(-1, frame)
        frame_rms = np.sqrt(np.mean(np.square(frames, dtype=np.float64), axis=1))
        silent_ratio = float(np.mean(frame_rms < 0.0015))
    else:
        silent_ratio = 1.0

    quality = AudioQuality(
        duration_seconds=samples.size / TARGET_SAMPLE_RATE,
        peak_amplitude=peak,
        rms_dbfs=rms_dbfs,
        clipping_ratio=clipping_ratio,
        dc_offset=dc_offset,
        silent_ratio=silent_ratio,
    )

    cleaned = samples.astype(np.float32)
    if abs(dc_offset) > 1e-4:
        cleaned = cleaned - np.float32(dc_offset)
    peak = float(np.max(np.abs(cleaned))) if cleaned.size else 0.0
    if peak > PEAK_TARGET:
        cleaned = (cleaned * np.float32(PEAK_TARGET / peak)).astype(np.float32)
    return np.ascontiguousarray(cleaned), quality


def write_wav_16k_mono(path: str | Path, samples: np.ndarray) -> Path:
    """Persist normalized audio as 16 kHz mono PCM16 WAV for playback and review."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm16 = np.clip(samples, -1.0, 1.0)
    pcm16 = np.round(pcm16 * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as fh:
        fh.setnchannels(1)
        fh.setsampwidth(2)
        fh.setframerate(TARGET_SAMPLE_RATE)
        fh.writeframes(pcm16.tobytes())
    return path
