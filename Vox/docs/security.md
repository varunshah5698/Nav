# Security, privacy and oversight

VoxSafe processes recordings of financial-hardship conversations. Treat every
recording, timeline and decision as **highly sensitive personal data**.

## 1. Data inventory

| Data | Where | Sensitivity | Retention |
|---|---|---|---|
| Call audio (16 kHz mono WAV) | `MEDIA_ROOT` in dev, S3/MinIO in production | highest | `AUDIO_RETENTION_DAYS` (default 90), enforced at read time today |
| Window scores, decisions, episodes | `window_scores`, `decisions`, `calls.risk_episodes` | high (health-adjacent inference) | per records-retention schedule; not deleted with audio |
| Handoffs and resolutions | `handoffs` | high | same as decisions; supervisor notes are free text |
| Audit chain | `audit_events` | high (integrity evidence) | append-only, retained with decisions |
| Users, sessions | `users`, `refresh_sessions` | medium | account lifetime; revoked sessions retained for audit |
| Consent reference | `calls.consent_reference` | medium | with the call |

**Never stored:** transcripts, speaker embeddings, voiceprints, borrower
identity beyond the caller-supplied filename/consent reference.

## 2. Authentication and authorization

- bcrypt password hashing; password ≥ 10 characters enforced by the operator CLI.
- HMAC access tokens (30 min) carrying `sub`, `role`, `tenant`, `sid`. The user
  row is re-read on every request, so deactivation takes effect immediately.
- Rotating refresh tokens stored as SHA-256 digests; a presented token is
  revoked in the same transaction that issues its successor.
- Access token lives in memory; refresh token in `sessionStorage`. Audio is
  fetched with the bearer header and played from a blob URL, so tokens never
  appear in URLs, `Referer` headers, or server logs.
- Login throttling per IP + email, with `Retry-After`; failures audited.
- Roles: `agent`, `supervisor`, `admin`, `auditor`, `ml_admin`. Backend guards
  are dependency-based (`require_roles`), not UI conditionals.
- Tenant isolation: every query filters `tenant_id` first. Cross-tenant reads
  return `404`. Agents additionally see only calls they registered.
- The only self-service account action is logout. Account creation, role changes
  and password resets go through the operator CLI and are audited
  (`user.created`, `user.password_reset`).

## 3. Audit trail

- Hash-chained, append-only, SQLite `UPDATE`/`DELETE` triggers abort mutations.
- Appends are serialised by a process lock (documented limitation: multi-process
  deployments must use a database-level lock/advisory lock).
- Events cover: authentication, call creation/upload, analysis completion and
  failure, handoff creation, acknowledgment, script-lock engagement and release,
  audio access, policy reads that mutate nothing (not logged), chain
  verification and integrity failure, user provisioning.
- `POST /v1/audit/verify` recomputes the chain; a broken chain returns `409`
  and is itself audited.
- **Tamper-evident, not tamper-proof.** An operator with database write access
  can drop the triggers and rewrite history. Production mitigation: ship the head
  hash to write-once storage on a schedule, and compare on verify.

## 4. Transport and storage

Implemented in code: private audio responses carry `Cache-Control: no-store`;
CORS is an explicit allow-list from `CORS_ORIGINS`; uploads are size-capped and
probed before storage; upload substitution on an existing call resets its
decisions and episodes.

Required for production (not provided by this repository): TLS 1.3 at the edge,
encryption at rest (S3 SSE-KMS or equivalent), key rotation, bucket lifecycle
expiration, database encryption, secret manager injection of `SECRET_KEY` and
database credentials, and network isolation of the database.

`APP_ENV=production` refuses to start without `SECRET_KEY`; the development
fallback writes a git-ignored key file with mode `0600`.

## 5. Threat model (abridged)

| Threat | Control | Residual risk |
|---|---|---|
| Stolen access token | 30-min TTL, no token in URLs, in-memory only | valid until expiry; no revocation list for access tokens (refresh sessions are revocable) |
| Stolen refresh token | hashed at rest, single-use rotation | replay window until detection |
| Cross-tenant data access | tenant filter before any other predicate, `404` on mismatch | a future query forgetting the filter is a bug class; tests cover the main reads |
| Agent reading another agent's call | `assert_call_access` + list filter | supervisors/admins are intentionally tenant-wide |
| Agent releasing a script lock | supervisor/admin guard, acknowledged handoff, reason ≥ 10 chars, audit | none known |
| Silent downgrade of an urgent call | max-severity evaluator, property tests | a policy edit could still change thresholds (approval workflow is out of V1) |
| Silent failure when inference is down | call marked `failed`, `call.analysis_failed` audited, UI shows unassessed, health degrades | no automatic paging in V1 |
| Audio replay/download by an insider | authenticated, audited `audio.accessed`, no public URLs | an authorized reviewer can still listen; that is the job |
| Audit rewrite by DB operator | hash chain detects it | detection, not prevention |
| Consent bypass | schema rejects `consent_confirmed: false`; upload re-checks the stored flag | consent text accuracy is a legal, not technical, control |
| Prompt-injection via future LLM features | no LLM in V1; architecture forbids generated output from changing policy | n/a |

## 6. Data minimization in the product

- No transcription, no speaker identification, no credibility scoring by default
  (R5 is gated and review-only).
- The UI shows acoustic estimates with explicit uncertainty language and "What
  this does not mean" (no diagnosis, no lie detection, no credit signal).
- Raw vocal measurements are never presented as borrower-facing material.
- No export feature ships in V1; a future bulk export requires a second approver.

## 7. Operational hardening checklist

- [x] Secrets out of source control (`.env` ignored, `.env.example` only names).
- [x] No tokens in URLs or logs; structured request logging of failures only.
- [x] Append-only audit + verification endpoint.
- [x] Role checks on every mutating endpoint; tests per role.
- [x] Tenant scoping tested for calls, timelines, audio, audit, handoffs.
- [x] Duplicate acknowledgment rejected (`409`).
- [x] Script lock cannot be released while a handoff is open.
- [ ] TLS termination, KMS, key rotation — deployment responsibility.
- [ ] Nightly retention deletion job — specified in `deployment.md`, not shipped.
- [ ] OIDC provider integration — swap point documented in `architecture.md`.
- [ ] Head-hash shipping to write-once storage — specified, not shipped.

## 8. Incident response sketch

1. If `audit.chain_integrity_failure` appears: freeze writes, export the chain and
   the head hash, compare against external copies, treat all decisions after the
   first failing sequence as unverified.
2. If a script lock was released improperly: the event carries the acting user,
   reason and handoff id; the borrower conversation must be reviewed by a
   supervisor and the case escalated under the collections policy.
3. If audio was exposed: rotate storage credentials, enumerate `audio.accessed`
   events for the affected period, notify per the organisation's DPDP/GDPR
   obligations — VoxSafe does not decide notification thresholds.

Never treat a failed check as a pass. A missing telemetry signal is reported as
unavailable, not healthy.
