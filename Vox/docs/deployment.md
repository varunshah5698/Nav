# Deployment

This document separates what this repository actually provides from what a
production operator must add. Nothing here claims a deployment that has not been
performed.

## 1. Environments

| Environment | Data | Auth | Storage | Queue |
|---|---|---|---|---|
| Local development (this repo) | synthetic fixtures only | local bcrypt accounts | local filesystem | in-process thread |
| Staging (to build) | synthetic or consented test audio, **never production audio** | OIDC test tenant | MinIO | Redis + RQ |
| Production (to build) | real calls with consent | OIDC | S3 + SSE-KMS | Redis + RQ, ≥ 2 workers |

No production audio may be copied into staging or development. Dataset sharing
for model work requires a separate, consented, de-identified research set.

## 2. Configuration

All settings come from environment variables or `.env` (see
[`.env.example`](../.env.example)). Production essentials:

```
APP_ENV=production
SECRET_KEY=<48+ random bytes from a secret manager>
DATABASE_URL=postgresql+psycopg://voxsafe:…@db:5432/voxsafe
MEDIA_ROOT=/var/lib/voxsafe/media          # or the S3 adapter
CORS_ORIGINS=https://voxsafe.example.com
AUDIO_RETENTION_DAYS=90
MAX_UPLOAD_MB=50
ENABLED_CAPABILITIES=                      # keep credibility off
```

The app refuses to start in production without `SECRET_KEY`. Never commit `.env`.

## 3. First run

```bash
python -m pip install -r backend/requirements.txt
PYTHONPATH="backend:$PWD/ml:$PWD" python -m app.cli init     # schema + policy + model record
PYTHONPATH="backend:$PWD/ml:$PWD" python -m app.cli create-user \
  --email ops@example.com --role admin --name "Ops Admin"
PYTHONPATH="backend:$PWD/ml:$PWD" uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`app.cli init` installs SQLite append-only triggers when the dialect is SQLite.
On PostgreSQL the equivalent is a revoke of `UPDATE, DELETE` on `audit_events`
from the application role, plus a trigger if the role must stay privileged:

```sql
REVOKE UPDATE, DELETE ON audit_events FROM voxsafe_app;
CREATE OR REPLACE FUNCTION deny_audit_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_events is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
```

## 4. Migrations

There is **no Alembic history in this repository yet**: the schema comes from
SQLAlchemy metadata. Before the first production deployment, generate an initial
revision (`alembic revision --autogenerate -m "initial schema"`), review it, and
from then on ship migrations instead of `create_all`. Until that exists, any
schema change is a breaking change for existing databases and must be reviewed as
such.

## 5. Storage

`backend/app/services/storage.py` is the adapter boundary. For S3/MinIO:

1. Bucket `voxsafe-audio`, private, versioning on, SSE-KMS with a customer-managed
   key, lifecycle rule `Expire objects after AUDIO_RETENTION_DAYS`.
2. Block public access; the only read path is the authenticated
   `GET /v1/calls/{id}/audio` handler.
3. Presigned upload URLs are specified in the build guide but **not implemented**
   in V1; uploads currently stream through the API. Keep `MAX_UPLOAD_MB` and the
   reverse-proxy body limit aligned.

## 6. Queue and workers

Development uses `AnalysisWorker` (a thread polling `processing_jobs` every
400 ms). Production: run ≥ 2 RQ workers against Redis with the same job record,
replace `services/analysis.enqueue` with an RQ enqueue inside the same DB
transaction (use the outbox pattern: insert the job row and enqueue after commit;
requeue stale `running` jobs on worker start — the thread worker already does
this).

Scaling rules of thumb: inference is CPU-bound (~110 ms of feature extraction per
20 s recording on this machine, ~5 ms per window of scoring); a single worker
handles many concurrent short calls. GPU is not required for the baseline and
must not be added merely for appearance.

## 7. Retention deletion (not shipped)

`AUDIO_RETENTION_DAYS` is enforced at read time: expired audio returns `410` and
the UI disables playback while keeping the timeline and decisions. A real
deletion job still needs to run:

```bash
# nightly, after backup
0 2 * * * voxsafe /usr/local/bin/python -m app.jobs.purge_expired_audio
```

The job must, per call past `audio_expires_at`: delete the object, verify
deletion, set `calls.audio_uri = NULL`, and append `audio.deleted` with the
object key and verification result. It must never delete `window_scores`,
`decisions`, `handoffs` or `audit_events`. This module is **not implemented**;
until it is, retention depends on the storage lifecycle rule alone.

## 8. Observability

Shipped: `GET /v1/health` (database, active policy parse, ffmpeg presence, worker
heartbeat, queue depth, model record), worker heartbeat row, audit chain
verification, per-call timings, and `audit.chain_integrity_failure` events.

Not shipped: OpenTelemetry traces, Prometheus metrics, Grafana dashboards, Loki
shipping. Minimum production additions:

| Signal | Source | Alert |
|---|---|---|
| API availability | LB probe on `/v1/health` | < 99.5 % over 1 h |
| Worker alive | `service_heartbeats.last_seen_at` | > 30 s stale |
| Queue depth | `processing_jobs` where `status='queued'` | > 20 for 5 min |
| Analysis failures | `calls.status='failed'`, `call.analysis_failed` | any increase |
| Audit integrity | `audit.chain_integrity_failure` | page immediately |
| Alert delivery | `handoff.created` → acknowledgment latency | > 3 s p95 (design target) |
| Inference latency | `analysis_summary.timings_ms` | p95 > 2 s |

## 9. Backups and recovery

- Database: nightly logical dump + WAL/PITR; restore drill quarterly.
- Audit chain: export the head hash (`POST /v1/audit/verify` response) to
  write-once storage after each backup. A restore that cannot reproduce the head
  hash must be treated as tampering, not as a restore.
- Audio: bucket versioning; deletion is deliberate and audited.
- Secrets: managed by the platform secret store; rotation without redeploy where
  possible (`SECRET_KEY` rotation invalidates access tokens — expected).

## 10. Reverse proxy

Terminate TLS 1.3, enforce HSTS, cap request bodies at `MAX_UPLOAD_MB + 1 MB`,
forward `X-Forwarded-For` (the app uses the first hop for rate limiting and for
the `client_ip` audit field), and disable response buffering for audio streams so
range requests work.

## 11. Release checklist

- [ ] `PYTHONPATH="backend:$PWD:$PWD/ml" pytest backend/tests ml/tests -q` green
- [ ] `cd frontend && npm ci && npm run typecheck && npm test && npm run build` green
- [ ] `app.cli verify-audit` valid after deploy
- [ ] `/v1/health` reports `status: ok` and a fresh worker heartbeat
- [ ] One real consented recording processed end to end in staging
- [ ] Policy version and model version recorded on the call match the intended release
- [ ] No production audio or credentials in the repository or build artefacts
- [ ] Retention job and backup/head-hash export scheduled
- [ ] Role matrix re-tested (agent, supervisor, admin, auditor, ml_admin)
