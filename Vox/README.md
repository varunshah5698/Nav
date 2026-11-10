# VoxSafe

Acoustic borrower-distress detection for debt-collection calls, with a mandatory
human handoff and an append-only, hash-chained audit trail.

VoxSafe listens to *how* a call sounds, not to what is said. It never transcribes
audio, never identifies a speaker, and never decides whether anything said is
true. When the acoustic evidence crosses the policy threshold, the call is
flagged, automated payment prompts are locked server-side, and a supervisor is
required to take over.

> **Version 1 scope.** Upload one recorded call and flag risky moments, for a
> collections agent. That is the whole product surface: intake, review, the
> read-only policy that produced the flags, and service status. Live telephony,
> supervisor triage UI, policy editing, retention job UI and model-health
> dashboards are deliberately out of V1 and are documented as such in
> [docs/architecture.md](docs/architecture.md) and
> [docs/deployment.md](docs/deployment.md).

## What works end to end

1. An agent signs in (local auth, bcrypt + rotating refresh tokens).
2. The agent registers a call, confirms recording consent, and uploads a real
   WAV/MP3/Opus recording (≤ 50 MB).
3. The API normalises it to 16 kHz mono, detects speech, and scores 3-second
   windows every 1.5 seconds using a hand-authored acoustic baseline.
4. The deterministic policy (`policy/policies/v1.yaml`, rules R1–R5) evaluates
   the smoothed features and returns the **maximum** severity. Severity can only
   escalate: `CONTINUE 0 → REVIEW 1 → HANDOFF_IMMEDIATE 2`.
5. On `HANDOFF_IMMEDIATE` the API persists a handoff, sets `script_locked = true`
   on the server, and writes `handoff.created` and `script_lock.engaged` to the
   audit chain.
6. The review workspace shows the audio player, a synchronised arousal / valence
   / dominance timeline, the flagged moments with the exact rule evidence, the
   window-level decisions, and the call's audit trail.
7. Every critical transition is appended to a hash chain that the auditor role
   can verify by recomputation.

## Requirements

- Python 3.12 (3.11 works; the venv here is 3.12)
- Node 22
- `ffmpeg` on `PATH` (audio probing and decoding)

## Run it locally

```bash
# 1. Backend
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt

# 2. Frontend
(cd frontend && npm ci)

# 3. Schema, baseline policy, model record
export PYTHONPATH="backend:$PWD:$PWD/ml"
backend/.venv/bin/python -m app.cli init

# 4. Local accounts (development only — delete before any shared deployment)
backend/.venv/bin/python -m app.cli create-user \
  --email agent@voxsafe.app --role agent --name "Demo Agent" \
  --password voxsafe-demo-2026
backend/.venv/bin/python -m app.cli create-user \
  --email supervisor@voxsafe.app --role supervisor --name "Demo Supervisor" \
  --password voxsafe-demo-2026
backend/.venv/bin/python -m app.cli create-user \
  --email auditor@voxsafe.app --role auditor --name "Demo Auditor" \
  --password voxsafe-demo-2026

# 5. Both servers, with readiness checks
./scripts/dev.sh
```

`scripts/dev.sh` starts the API on `127.0.0.1:8000` and Vite on
`127.0.0.1:5174` (5173 is often taken). API docs live at
<http://127.0.0.1:8000/v1/docs>.

Manual start, if you prefer:

```bash
PYTHONPATH="backend:$PWD:$PWD/ml" backend/.venv/bin/uvicorn app.main:app \
  --app-dir backend --host 127.0.0.1 --port 8000

(cd frontend && npm run dev -- --host 127.0.0.1 --port 5174)
```

If the browser origin differs from `CORS_ORIGINS`, add it to `.env` (see
[.env.example](.env.example)) — otherwise the SPA's API calls are blocked.

## Application routes

| Route | Purpose | Roles |
|---|---|---|
| `/` | Landing page: scroll-driven 3D "signal → safety" narrative, WebGL fallback, reduced-motion path | public |
| `/login` | Sign in, with a restrained 3D acoustic panel on wide screens | public |
| `/app` | Intake: upload one recording, consent confirmation, recent calls | agent, supervisor, admin |
| `/app/reviews` | All reviewed calls, filter by action, search | all staff roles |
| `/app/calls/:id` | Call review: player, synchronised timeline, flagged moments, evidence, audit trail, provenance | all staff roles |
| `/app/policy` | Read-only active policy (R1–R5), thresholds, calibration status | any authenticated user |
| `/app/status` | Live service checks: API, DB, ffmpeg, policy, worker heartbeat, queue depth | any authenticated user |

## Tests

```bash
PYTHONPATH="backend:$PWD:$PWD/ml" backend/.venv/bin/python -m pytest backend/tests ml/tests -q
(cd frontend && npm run typecheck && npm test && npm run build)
```

- `backend/tests/test_policy_safety.py` — Hypothesis property tests over
  generated feature combinations proving distress evidence cannot lower
  severity, plus missing-feature, credibility-gating and R4 behaviour.
- `backend/tests/test_audit_chain.py` — chain linking, database-enforced
  append-only behaviour, and detection of payload tampering and removed events.
- `backend/tests/test_api_security.py` — role enforcement, tenant isolation,
  per-agent call visibility, duplicate acknowledgment rejection, and the
  reason-bearing lock release.
- `backend/tests/test_intake_flow.py` — HTTP upload → analysis → handoff →
  acknowledgment → lock persistence → chain verification; silence must be
  `REVIEW`/`unclear`, never `calm`; audio access is authenticated and audited.
- `ml/tests/test_pipeline.py` — normalisation, 3 s/1.5 s windowing, EMA maths,
  speech-total correctness, and fixture behaviour.
- `frontend/tests/` — formatting of durations/clocks/labels, API URL resolution
  (the `/v1` prefix is applied exactly once) and error-message extraction.

Last measured run on this machine: **32 backend/pipeline tests passed**, **15
frontend tests passed**, `tsc -b --noEmit` clean, production build successful.

## Measured processing time (this machine, synthetic 20 s fixture)

```
decode 43.7 ms · normalize 1.9 ms · VAD 21.3 ms · features 107.6 ms
scoring 0.4 ms · policy 0.1 ms · inference total 0.5 ms · end-to-end 129.7 ms
```

The three-second window accumulation is a separate measurement from inference:
a complete first window cannot exist before 3.0 s of audio has arrived. VoxSafe
reports the two separately and does not claim a sub-two-second first result.

## Repository layout

```
backend/app        FastAPI app: api/, core/, db/, models/, schemas/, services/, workers/
backend/tests      policy, audit, API-security and intake-flow tests
ml/voxml           audio decode, VAD, windowing, features, scoring, smoothing, pipeline
ml/tests           pipeline tests over synthetic fixtures
policy             versioned YAML policy, Pydantic schema, deterministic evaluator
frontend/src       React 18 + TS + Vite app (pages, components, api, styles, three)
frontend/tests     vitest suites
fixtures/audio     synthetic signals used only by tests and the local demo
infra              docker-compose for PostgreSQL 16, Redis 7 and MinIO
scripts            fixture generation, offline analysis, dev startup
docs               design analysis, architecture, API, security, model card, deployment, DPIA, ADRs
```

## Safety invariants (tested, not just documented)

- The model estimates; the policy decides; a human handles it. Inference and
  enforcement are separate packages (`ml/voxml` never imports the web app).
- The evaluator returns the maximum severity across rules. No rule, and no
  missing value, can lower an action.
- Silence, noise and short recordings never read as calm: insufficient usable
  speech raises `REVIEW` (R4), and silence is stored as `unclear`.
- Credibility (R5) is disabled by default, review-only, and the schema rejects
  any policy that lets it trigger `HANDOFF_IMMEDIATE`.
- Acknowledging a handoff does **not** release the script lock. Release needs the
  supervisor role, an acknowledged handoff, and a reason of ≥ 10 characters.
- Audit events are hash-chained, appended under a lock, and protected by SQLite
  `BEFORE UPDATE` / `BEFORE DELETE` triggers. Verification recomputes every hash.

## Honest limitations

- **The model is an unvalidated heuristic baseline**, `baseline-acoustic-v1`. It
  is not trained or calibrated on labelled affect data. Distress recall ≥ 0.95,
  arousal CCC ≥ 0.60, valence CCC ≥ 0.35 and the < 5 pp group gap are *targets*
  and are reported as unverified, never as met. See
  [docs/model-card.md](docs/model-card.md).
- Development substitutes: SQLite instead of PostgreSQL, local filesystem
  instead of S3/MinIO, an in-process table-backed worker instead of Redis + RQ,
  local password auth instead of an OIDC provider. Interfaces and swap points
  are documented in [docs/architecture.md](docs/architecture.md); there is no
  Alembic migration history yet — the schema is created from the SQLAlchemy
  metadata (`app.cli init`).
- Two-person policy approval is enforced at the database level
  (`approved_by <> drafted_by`) and in the schema, but the approval *workflow UI*
  is out of V1; policy changes therefore go through code review today.
- The bundled demo database contains exactly one call: the synthetic fixture
  `fixtures/audio/synthetic_agitated_turn.wav`, uploaded through the real intake
  path with consent reference `SYNTHETIC-FIXTURE-NOT-A-REAL-CALL`. It is not a
  customer call. Reset with:
  `rm backend/var/voxsafe.db* && PYTHONPATH=... python -m app.cli init`.
- No nightly audio-retention job ships in V1; `AUDIO_RETENTION_DAYS` is honoured
  at read time (expired audio returns `410` and the UI shows *Audio expired*).
- The landing/login 3D scenes mount only where WebGL is available and the tab is
  visible; otherwise a designed static waveform is shown.

## Documentation

- [Design reference analysis](docs/design-reference-analysis.md)
- [Architecture](docs/architecture.md)
- [API contracts](docs/api-contracts.md)
- [Security and privacy](docs/security.md)
- [Model card](docs/model-card.md)
- [Deployment](docs/deployment.md)
- [DPIA and compliance checklist](docs/dpia.md)
- [ADR 0001: separating inference from enforcement](docs/adr/0001-decision-layer-separation.md)

VoxSafe may estimate a vocal state, but it must never replace human judgement.
When distress is detected, the system must make human intervention easier,
faster and auditable.
