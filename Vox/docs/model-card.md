# Model card — `baseline-acoustic-v1`

| Field | Value |
|---|---|
| Name | VoxSafe baseline acoustic model |
| Version | `baseline-acoustic-v1` |
| Kind | `heuristic-baseline` (hand-authored acoustic descriptors) |
| Artifact digest | `sha256:9d1f5a0b0e0b6f0a3b1a4e4c4f2f8f4b5f6c7d8e9f0a1b2c3d4e5f60718293a4` (recorded identity, not an independently verified build artefact) |
| Calibrated | **No** |
| Trained on labelled affect data | **No** |
| Intended deployment | Recorded-call intake in a collections operation, as a *prompt for human review* |
| Status | Development baseline. Not approved for production reliance. |

## What it is

A deterministic acoustic estimator implemented in `ml/voxml`:

1. Decode to mono 16 kHz, peak-normalise, measure clipping/silence
   (`audio.py`).
2. Voice activity detection on 40 ms frames using energy and spectral gates
   (Otsu split, flatness, zero-crossing rate) (`vad.py`).
3. Windows of 3.0 s with a 1.5 s hop (`features.build_windows`).
4. Per-window descriptors: F0 track and semitone spread, jitter, shimmer,
   spectral flux, band energy ratios, RMS, speech ratio (`features.py`).
5. Dimensional outputs mapped into `[-1, 1]` via bounded transforms, and a
   five-way state distribution via a softmax over descriptor logits
   (`scoring.py`).
6. Exponential moving averages (α = 0.3) for arousal, valence and dominance; a
   consecutive high-arousal run counter; speech seconds over a rolling 30 s
   (`smoothing.py`).

Every window's raw descriptors are persisted with the score, so a decision can
be explained from stored evidence.

## Outputs

| Output | Range | Meaning in this build |
|---|---|---|
| Arousal | −1…1 | Activation proxy driven by energy/F0 movement. The most defensible axis. |
| Valence | −1…1 | Weak proxy from spectral balance and pitch behaviour. **Acoustically underdetermined**; treat as a hint, not a measurement. |
| Dominance | −1…1 | Weak proxy from intensity and pitch floor. |
| State probabilities | 0…1, sum to 1 | `calm`, `engaged`, `frustrated`, `distressed`, `unclear`. Not calibrated. |
| Quality status | `good` / `noisy` / `clipped` / `silence` / `short` | Drives R4 escalation and UI warnings. |
| Confidence | 0…1 | Margin-derived indicator, not a probability of correctness. |

## Intended use

- Flag moments in a recorded collection call that deserve **human** attention.
- Provide auditable evidence for why a moment was flagged.
- Trigger a server-side lock on automated payment prompts when the policy returns
  `HANDOFF_IMMEDIATE`.

## Prohibited use

- Diagnosing a borrower's mental health, personality or intent.
- Lie detection, credibility assessment, or "truthfulness" scoring.
- Credit decisions, eligibility, prioritisation of borrowers, or any profiling.
- Automated pressure, persuasion, or script selection based on emotional state.
- Any borrower-facing display of raw vocal-state numbers.
- Any use as the sole basis for a collections decision.

## Evaluation status (honest)

| Target (guide) | Required | Status |
|---|---|---|
| Distress recall | ≥ 0.95 | **Not verified** — no consented, annotated in-domain evaluation set exists |
| Arousal CCC | ≥ 0.60 | **Not verified** |
| Valence CCC | ≥ 0.35 | **Not verified** |
| Group recall gap | < 5 percentage points | **Not verified** — no accent/language group labels |
| Calibration error | low | **Not measured** — outputs are uncalibrated by construction |

No metric in the product is presented as met. The review workspace and status
page state that the baseline is unvalidated, and the API reports
`"calibrated": false`.

What *has* been verified is behaviour, not accuracy:

- Silence and low-speech recordings are classified `unclear` and escalate to
  `REVIEW` (R4), never `calm`.
- The synthetic agitated fixture escalates to `HANDOFF_IMMEDIATE` via R1 within
  the first three scored windows.
- The synthetic calm fixture never reaches `HANDOFF_IMMEDIATE`.
- Window geometry is exactly 3.0 s / 1.5 s; EMA maths matches α = 0.3; speech
  totals never exceed the recording duration.

## Known failure modes

1. **Valence is the weak axis.** Acoustic-only valence cannot distinguish, for
   example, animated storytelling from distress. R1 deliberately requires arousal
   *and* negative valence *and* a sustained run.
2. **Languages and accents.** Descriptor thresholds were sanity-checked on
   English synthetic fixtures only; F0 and spectral behaviour vary by speaker,
   sex, age and language.
3. **Channel effects.** Narrowband telephony, codec artifacts, compression and
   automatic gain control shift energy and spectral features.
4. **Music on hold / IVR / overlapping speech.** VAD may accept music as speech;
   overlapping speakers confuse pitch tracking. Such calls should surface as
   `noisy`/`unclear` and are not evidence of calm.
5. **Clipping and loud speech.** Peak normalisation plus clipping detection flags
   distortion, but severe clipping still biases arousal upward.
6. **Very short calls.** Fewer than two windows cannot support a sustained-run
   rule; R4 will hold them in review.
7. **Silence.** Scored `unclear` with low confidence; never interpreted as calm.

## Change control

- Model identity is pinned in `model_versions`; analysis records the version on
  every call and decision. There is no "latest" pointer.
- Any replacement must be evaluated on held-out **speakers and calls** (never a
  random window split), calibrated on a held-out calibration set, and must beat
  this baseline on distress recall *and* group recall gap before replacing it.
- Replacing the model requires a new policy review: thresholds are only
  meaningful against the distribution they were set on.

## Reproduction

```bash
PYTHONPATH="$PWD:$PWD/ml" backend/.venv/bin/python scripts/analyze_audio.py \
  fixtures/audio/synthetic_agitated_turn.wav --windows
```

The synthetic fixtures are test artifacts, not customer calls, and are labelled
as such wherever they appear in the UI.
