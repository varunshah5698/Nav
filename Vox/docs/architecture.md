# Architecture

VoxSafe is a monorepo with three hard boundaries:

```
React SPA  ──HTTP/JSON──►  FastAPI (auth, intake, persistence, audit)
                                 │
                                 ├── ml/voxml      : acoustic estimation (no web imports)
                                 └── policy        : deterministic enforcement (no I/O)
```

`ml/voxml` never imports the web application, and `policy` imports neither. The
policy package receives a flat mapping of already-smoothed features and returns
an action; it cannot read audio, call a model, or perform I/O. That is what makes
the "the model estimates, the policy decides, the human handles it" claim
structural rather than aspirational.

## 1. Request path: upload to flagged moment

1. `POST /v1/calls` creates a call in `awaiting_upload` with consent confirmation
   and writes `call.created`.
2. `POST /v1/calls/{id}/audio` streams the file to the storage adapter, probes it
   with ffprobe, records duration and codec, enqueues a `processing_jobs` row, and
   writes `call.audio_uploaded`. Non-audio payloads are rejected with `422` and
   the stored bytes are discarded.
3. `AnalysisWorker` (a thread in the API process in this build) claims the oldest
   queued job with a conditional `UPDATE … WHERE status='queued'`, so two workers
   cannot process the same job.
4. `voxml.audio.decode_16k_mono` → `normalize` (mono 16 kHz, peak-normalised,
   clipping/silence measured) → `vad.detect` (40 ms frames, energy + spectral
   gates) → `features.build_windows` (3.0 s window, 1.5 s hop) →
   `scoring.score_window` → `smoothing.Smoother` (EMA α = 0.3, high-arousal run
   length, speech seconds over 30 s).
5. For each window the policy is evaluated on the smoothed features. The decision
   and the exact observed values are persisted to `decisions`; the window scores
   to `window_scores`.
6. `services.analysis` computes the call-level action as the maximum window
   severity, builds contiguous risk episodes, and — for `HANDOFF_IMMEDIATE` —
   creates the handoff row, sets `script_locked = true`, and appends
   `handoff.created` and `script_lock.engaged` in the same transaction.

If analysis raises, the call is marked `failed` with `error_message`, the job is
marked failed, and `call.analysis_failed` is audited. **A failed call is not a
calm call**: it is unassessed, and the UI says so.

## 2. Data model

`backend/app/models/entities.py`:

| Table | Purpose | Notable constraints |
|---|---|---|
| `users` | identity, role, tenant, `is_active` | role check constraint, unique email |
| `refresh_sessions` | rotating refresh tokens (hashed) | unique token hash, expiry, revocation timestamp |
| `calls` | recording metadata, lifecycle status, action, `script_locked`, episodes | status/source check constraints, tenant+time and tenant+action indexes |
| `window_scores` | one row per window: dimensions, EMAs, state probabilities, quality, speech features, raw features (JSON) | unique `(call_id, window_index)` |
| `decisions` | action, severity, rules fired with observed values (JSON), model + policy version | unique `(call_id, window_index)`, action check |
| `handoffs` | trigger rule/severity, status, acknowledger, resolution, notes | **partial unique index: one open handoff per call** |
| `script_lock_releases` | who released, mandatory reason, linked handoff | `length(reason) >= 10` check |
| `policies` | version, YAML body, lifecycle status, drafter/approver, timestamps | `approved_by <> drafted_by` when both set |
| `audit_events` | seq, timestamp, actor, event, payload, prev hash, hash | append-only triggers |
| `processing_jobs` | queue state, attempts, error, metrics | status check, status+created index |
| `model_versions` | pinned model record, digest, metrics | primary key is the version string |
| `service_heartbeats` | worker liveness for the status page | one row per service |

Tenant isolation is modelled explicitly: every user and call carries
`tenant_id`, and every query is scoped by the authenticated user's tenant before
any other filter. Agents additionally see only calls they created; supervisors,
auditors and admins see the tenant. Cross-tenant access always returns `404`,
including for admins, so existence is not leaked.

Schema creation currently happens from SQLAlchemy metadata (`app.cli init`)
rather than Alembic migrations; see "Known gaps" below.

## 3. Authentication and sessions

- Passwords: bcrypt (`core/security.py`).
- Access token: HMAC-signed JWT, 30 minutes, carries `sub`, `role`, `tenant`,
  `sid`; verified on every request and re-checked against the live user row
  (deactivated accounts fail closed).
- Refresh token: random 256-bit value, stored only as a SHA-256 digest, rotated
  on every use; the presented token is revoked in the same transaction.
- Client storage: access token in memory, refresh token in `sessionStorage`.
  Audio is fetched as an authenticated blob and played from an object URL, so no
  token ever appears in a URL, a `src` attribute or a log.
- Login throttling: fixed-window counter keyed by IP + email; failures are
  audited as `auth.login_failed` with the attempted address.

## 4. Audit chain

`services/audit.append` serialises appends with a process lock, reads the last
`(seq, hash)`, and hashes a canonical `|`-joined material of
`seq | occurred_at | actor | role | event | call_id | model_version |
policy_version | prev_hash | payload_json`, where `payload_json` is
`json.dumps(sort_keys=True, separators=(",", ":"))`.

SQLite triggers `audit_events_no_update` and `audit_events_no_delete` abort
`UPDATE` and `DELETE` at the database level. `POST /v1/audit/verify` (auditor or
admin) recomputes every hash, checks the sequence and previous-hash links,
returns the first failing sequence, and appends `audit.chain_verified` or
`audit.chain_integrity_failure`.

This is **tamper-evident, not tamper-proof**: an operator with full database
access can drop the triggers and rewrite the chain. Production shipping of the
head hash to write-once storage is specified in `docs/security.md`.

## 5. Policy layer

- Canonical form: YAML (`policy/policies/v1.yaml`), validated by Pydantic with an
  explicit feature allow-list, four operators, unique rule ids, and a rule that
  rejects any credibility feature mapped to `HANDOFF_IMMEDIATE`.
- Evaluation: every enabled rule is tested; rules whose gated capability is off
  or whose features are missing are *skipped and reported*, never guessed. The
  result is the maximum severity over fired rules.
- Versioning: policies are stored in the `policies` table with lifecycle
  `draft → review → active → retired`; the active version is what the worker
  loads. The shipped baseline is seeded as active with no human drafter, and the
  database rejects self-approval.
- The V1 UI is read-only; editing and the two-person approval flow are out of
  scope (see `docs/adr/0001-decision-layer-separation.md`).

## 6. Frontend

- React 18 + TypeScript + Vite, TanStack Query for server state, Recharts for the
  vocal-state distribution, React Three Fiber + GSAP ScrollTrigger only on the
  landing page and the login panel.
- `AppShell` provides the rail (desktop) and bottom navigation (mobile), header,
  account cluster and the health pill. Every page composes the primitives in
  `components/ui.tsx` and the component classes in `styles/app.css`.
- `Timeline.tsx` is a single SVG component used by the review workspace: three
  dimension bands, speech activity, and a per-window action strip. Clicking seeks
  the player, and the playhead highlights the corresponding window. The same
  component is the extension point for the future live monitor.
- `AudioPlayer.tsx` fetches private audio once per recording per page session
  (module-level promise cache) because every fetch is an audited access event;
  strict-mode remounts must not duplicate audit noise.

## 7. Latency instrumentation

`voxml.pipeline` records `decode_ms`, `normalize_ms`, `vad_ms`, `features_ms`,
`scoring_ms`, `policy_ms`, `inference_total_ms` and `total_ms` per call, stored in
`calls.analysis_summary.timings_ms` and shown in the review provenance panel.

The three-second window is *accumulation*, not processing: a complete first
window cannot be scored before 3.0 s of audio exists. VoxSafe reports
accumulation and inference separately and does not claim a sub-two-second
first-result latency.

## 8. Empty states

Every workspace distinguishes "no data yet" from "nothing matched". No chart
point, KPI, handoff or audit event is ever synthesised. `GET /v1/calls` returns
`total` alongside the page so the UI can say "No calls have been processed yet"
rather than "No results".

## 9. Deliberately out of V1

| Capability | Why it is absent |
|---|---|
| Live telephony ingestion (WebSocket PCM, Twilio Media Streams) | V1 is recorded-call only; adding a transport without a real carrier integration would be a fake "live" indicator. |
| Supervisor triage UI (acknowledge/resolve, lock release) | Backend endpoints exist and are tested (`POST /v1/handoffs/{id}/ack`, `/v1/calls/{id}/script-lock/release`) so the workflow is complete at the API layer; V1 does not present it to the agent persona. |
| Policy editor, approval and activation UI | The evaluator, schema and two-person DB constraint are in place; the workflow UI is a later phase. |
| Model-health and fairness dashboards | There are no valid evaluation results to display. A dashboard of placeholder metrics would violate the "real data only" rule. |
| Command dashboard with ten KPIs and eight charts | The agent persona needs intake and review; aggregate dashboards are the supervisor's job and are not built. |
| Nightly retention deletion job | Retention is enforced at read time (`410` + *Audio expired*); the scheduled deleter is specified in `docs/deployment.md`. |

## 10. Known gaps / production swaps

| Development | Production | Swap point |
|---|---|---|
| SQLite | PostgreSQL 16 | `DATABASE_URL`; JSON columns already use `JSONB` on Postgres |
| Local filesystem | S3/MinIO + lifecycle expiry | `services/storage.py` adapter |
| In-process thread worker | Redis 7 + RQ workers | `services/analysis.enqueue` + `workers/processor.py` |
| Password auth | OIDC (Keycloak/Auth0/Cognito) | `api/auth.py`; roles map to realm/client roles |
| Metadata `create_all` | Alembic migrations | `backend/app/db/base.create_schema` |
| Process-local append lock | Database sequence lock / advisory lock | `services/audit.append` |

Each swap keeps the API contract and the audit semantics unchanged.
