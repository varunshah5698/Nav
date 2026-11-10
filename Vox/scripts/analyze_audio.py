#!/usr/bin/env python3
"""Analyze an audio file with the current policy and print the JSON summary.

    python scripts/analyze_audio.py fixtures/audio/synthetic_agitated_turn.wav

This is the same code path the API worker uses; it is useful for support and for
checking a recording before uploading it.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for candidate in (ROOT, ROOT / "ml"):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from policy import load_policy  # noqa: E402
from voxml.pipeline import analyze_file  # noqa: E402
from voxml.scoring import MODEL_VERSION  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--policy", default=str(ROOT / "policy" / "policies" / "v1.yaml"))
    parser.add_argument("--windows", action="store_true", help="include per-window rows")
    args = parser.parse_args()

    policy = load_policy(args.policy)
    analysis, _ = analyze_file(args.audio, policy=policy, model_version=MODEL_VERSION)

    payload = {
        "file": str(args.audio),
        "model_version": analysis.model_version,
        "policy_version": analysis.policy_version,
        "summary": analysis.summary(),
        "episodes": [e.to_dict() for e in analysis.episodes],
    }
    if args.windows:
        payload["windows"] = [
            {
                "index": w.features.window_index,
                "start": round(w.features.start_seconds, 2),
                "end": round(w.features.end_seconds, 2),
                "speech_ratio": round(w.features.speech_ratio, 3),
                "rms_dbfs": round(w.features.rms_dbfs, 2),
                "f0_mean": round(w.features.f0_mean_hz, 1),
                "f0_std_st": round(w.features.f0_std_semitones, 2),
                "f0_range_st": round(w.features.f0_range_semitones, 2),
                "flux": round(w.features.flux, 3),
                "jitter": round(w.features.jitter, 4),
                "hnr": round(w.features.hnr_db, 1),
                "arousal": w.score.arousal,
                "valence": w.score.valence,
                "dominance": w.score.dominance,
                "arousal_ema": round(w.smoothed.arousal_ema, 3),
                "valence_ema": round(w.smoothed.valence_ema, 3),
                "p_distressed": w.score.p_distressed,
                "p_frustrated": w.score.p_frustrated,
                "state": w.score.state,
                "action": w.decision.action.value,
                "rules": [h.rule_id for h in w.decision.fired],
            }
            for w in analysis.windows
        ]
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
