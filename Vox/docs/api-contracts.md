# API contracts

Base URL: `/v1`. Interactive OpenAPI: `/v1/docs`, schema: `/v1/openapi.json`.

All authenticated endpoints require `Authorization: Bearer <access_token>`.
Errors use FastAPI's shape (`{"detail": ...}`) with these status codes:

| Code | Meaning |
|---|---|
| 401 | missing/expired access token, inactive account, tenant mismatch in token |
| 403 | authenticated but the role may not perform the action |
| 404 | resource missing **or outside the caller's tenant / visibility** (no existence leak) |
| 409 | state conflict (already acknowledged, lock engaged, lock-release ordering) |
| 410 | audio expired under retention |
| 413 | upload exceeds `MAX_UPLOAD_MB` |
| 422 | validation failure (including unconfirmed consent) |
| 429 | login throttled, `Retry-After` set |

## Endpoints shipped in V1

| Method | Path | Roles | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | Password login → access + refresh token |
| POST | `/auth/refresh` | public (refresh token) | Rotate refresh token, issue new pair |
| POST | `/auth/logout` | any | Revoke the current refresh session |
| GET | `/auth/me` | any | Current user, role, tenant |
| POST | `/calls` | agent, supervisor, admin | Register a call (consent required) |
| POST | `/calls/{id}/audio` | owner or supervisor/admin | Upload the recording, enqueue analysis |
| GET | `/calls` | any | List visible calls (`limit`, `status`) |
| GET | `/calls/{id}` | visible | Call metadata and lifecycle state |
| GET | `/calls/{id}/timeline` | visible | Windows, decisions, episodes, handoff, policy, model |
| GET | `/calls/{id}/audio` | visible | Private audio stream (audited when not a range request) |
| GET | `/calls/{id}/audit` | visible | Audit events for one call |
| GET | `/handoffs` | supervisor, admin, auditor | Handoffs by status (default `open`) |
| POST | `/handoffs/{id}/ack` | supervisor, admin | Acknowledge with a resolution |
| POST | `/calls/{id}/script-lock/release` | supervisor, admin | Reason-bearing lock release |
| GET | `/audit` | supervisor, admin, auditor | Audit feed (`call_id`, `event`, `limit` ≤ 500) |
| POST | `/audit/verify` | auditor, admin | Recompute and verify the hash chain |
| GET | `/policies` | supervisor, admin, auditor | Version registry with parsed rules |
| GET | `/policies/active` | any authenticated | Active policy, rules and canonical YAML |
| GET | `/health` | public | Service checks (DB, policy, ffmpeg, worker, model) |

### Not implemented (out of V1)

`POST /calls/{id}/upload-url` (presigned upload), `WS /live/{session_id}`,
`GET /dashboard/summary`, `GET /model-health`, `GET /policies/{version}/diff`,
`POST /policies` (draft), `/approve`, `/activate`, user administration endpoints,
WebSocket handoff events. They are tracked in `docs/architecture.md` §9–10.

## Representative payloads

### `POST /auth/login`

```json
{ "email": "agent@voxsafe.app", "password": "voxsafe-demo-2026" }
```

```json
{
  "access_token": "eyJ…",
  "expires_in": 1800,
  "refresh_token": "3f9c…",
  "user": { "id": "…", "email": "…", "full_name": "Demo Agent",
            "role": "agent", "tenant_id": "voxsafe-default",
            "is_active": true, "created_at": "…", "last_login_at": "…" }
}
```

### `POST /calls`

```json
{
  "original_filename": "call-2026-11-09.wav",
  "consent_confirmed": true,
  "consent_reference": "NOTICE-ACK-77213",
  "recording_date": "2026-11-09",
  "size_bytes": 640044
}
```

`consent_confirmed: false` is rejected with `422` before a row is created.
Response `201` is a `CallSummary` with `status: "awaiting_upload"`.

### `POST /calls/{id}/audio` (multipart)

Field `file` (WAV/MP3/Opus). Success `200`:

```json
{
  "call_id": "…", "status": "queued", "filename": "call-2026-11-09.wav",
  "size_bytes": 640044, "duration_seconds": 20.0,
  "sample_rate": 16000, "channels": 1, "job_id": "…"
}
```

The file is probed before acceptance; a non-audio or corrupt payload returns
`422` and the stored object is discarded.

### `GET /calls/{id}/timeline`

Abridged:

```json
{
  "call": {
    "id": "…", "status": "awaiting_review", "source": "upload",
    "duration_seconds": 20.0, "action": "HANDOFF_IMMEDIATE",
    "script_locked": true,
    "model_version": "baseline-acoustic-v1",
    "policy_version": "pol-2026.11.1",
    "consent_confirmed": true,
    "consent_reference": "SYNTHETIC-FIXTURE-NOT-A-REAL-CALL",
    "audio": { "available": true, "expired": false,
               "expires_at": "2027-02-08T00:59:00",
               "url": "/v1/calls/…/audio" },
    "episode_count": 1
  },
  "handoff": {
    "id": "…", "call_id": "…", "raised_at": "…",
    "trigger_rule": "R1,R3", "trigger_severity": 2,
    "action": "HANDOFF_IMMEDIATE", "status": "open",
    "acknowledged_by": null, "acknowledged_at": null,
    "resolution": null, "resolution_notes": null
  },
  "windows": [
    {
      "index": 2, "start": 3.0, "end": 6.0,
      "arousal": 0.94, "valence": -0.6, "dominance": -0.1,
      "arousal_ema": 0.95, "valence_ema": -0.5, "dominance_ema": -0.1,
      "state": "frustrated",
      "probabilities": { "calm": 0.02, "engaged": 0.1,
                         "frustrated": 0.65, "distressed": 0.22, "unclear": 0.01 },
      "speech_ratio": 0.98, "quality_status": "good",
      "action": "HANDOFF_IMMEDIATE", "rules": ["R1", "R3"], "confidence": 0.65
    }
  ],
  "episodes": [
    { "start_seconds": 0.0, "end_seconds": 19.4, "action": "HANDOFF_IMMEDIATE",
      "severity": 2, "kind": "distress", "window_indices": [0, 1, 2],
      "evidence": [ { "rule_id": "R1", "description": "Sustained distress",
                      "conditions": [ { "feature": "arousal_ema", "op": "gte",
                                        "value": 0.7, "observed": 0.96 } ] } ],
      "peak": { "arousal": 0.96, "valence": -0.6, "p_distressed": 0.34 } }
  ],
  "summary": { "duration_seconds": 20.0, "speech_seconds": 18.71,
               "window_count": 12, "action": "HANDOFF_IMMEDIATE",
               "state_counts": { "frustrated": 12 },
               "timings_ms": { "inference_total_ms": 0.49, "total_ms": 129.7 } },
  "policy": { "version": "pol-2026.11.1", "description": "…",
              "active_version": "pol-2026.11.1" },
  "model": { "version": "baseline-acoustic-v1", "name": "VoxSafe baseline acoustic model",
             "kind": "heuristic-baseline",
             "artifact_digest": "sha256:9d1f…", "calibrated": false, "notes": "…" }
}
```

`windows[].action` and `rules` are read from persisted `decisions`, so the UI
explains what actually happened rather than re-deriving it.

### `POST /handoffs/{id}/ack`

```json
{ "resolution": "resumed_human", "notes": "Supervisor joined the call." }
```

`resolution` ∈ `resumed_human | closed | escalated`. Response includes
`script_locked`, which stays `true`: acknowledgment is not release. A second
acknowledgment returns `409`.

### `POST /calls/{id}/script-lock/release`

```json
{ "reason": "Borrower confirmed the call ended; no automated prompts should run." }
```

Requires: supervisor/admin, `script_locked = true`, **no open handoff**, at least
one handoff on the call, and a reason of ≥ 10 characters. Success sets
`script_locked = false`, stores a `script_lock_releases` row and appends
`script_lock.released` with the reason and handoff reference.

### `POST /audit/verify`

```json
{
  "valid": true,
  "events_checked": 10,
  "first_failing_seq": null,
  "errors": [],
  "head_hash": "9e2acb11…",
  "verified_at": "…",
  "duration_ms": 1.42
}
```

On a broken chain it returns `409` with the failing sequence and error list, and
appends `audit.chain_integrity_failure`. A success status is only produced by
actually recomputing every hash.

### `GET /health`

```json
{
  "status": "ok",
  "checked_at": "…",
  "version": "1.0.0",
  "checks": {
    "database": { "ok": true },
    "policy": { "ok": true, "version": "pol-2026.11.1" },
    "audio_decoder": { "ok": true, "binary": "/opt/homebrew/bin/ffmpeg" },
    "inference_worker": { "healthy": true, "queued": 0, "running": 0, "last_seen_seconds": 0.2 },
    "worker_last_seen": "…",
    "model": { "ok": true, "version": "baseline-acoustic-v1",
               "kind": "heuristic-baseline", "calibrated": false }
  },
  "degraded": []
}
```

`status` becomes `degraded` and the check list names the failing component.
Missing telemetry is never reported as healthy: an absent worker heartbeat is
`healthy: false`.

## Example session

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"agent@voxsafe.app","password":"voxsafe-demo-2026"}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

CALL=$(curl -s -X POST http://127.0.0.1:8000/v1/calls \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"original_filename":"my-call.wav","consent_confirmed":true}' \
  | python -c 'import sys,json;print(json.load(sys.stdin)["id"])')

curl -s -X POST "http://127.0.0.1:8000/v1/calls/$CALL/audio" \
  -H "Authorization: Bearer $TOKEN" -F "file=@my-call.wav;type=audio/wav"

curl -s "http://127.0.0.1:8000/v1/calls/$CALL/timeline" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```
