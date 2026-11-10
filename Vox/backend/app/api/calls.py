from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from policy import parse_policy
from voxml.audio import AudioError, probe

from ..core.config import get_settings
from ..db.base import get_session
from ..models import (
    Call,
    CallSource,
    CallStatus,
    Decision,
    Handoff,
    HandoffStatus,
    ModelVersion,
    PolicyStatus,
    PolicyVersion,
    Role,
    User,
    WindowScore,
    utcnow,
)
from ..schemas import (
    CallCreate,
    CallListResponse,
    CallSummary,
    TimelineResponse,
    UploadAccepted,
)
from ..services.analysis import audio_expired, enqueue
from ..services.audit import append
from ..services.storage import StorageError, get_store
from .deps import assert_call_access, get_current_user

router = APIRouter(tags=["calls"])
settings = get_settings()


def _get_call(session: Session, call_id: str, user: User) -> Call:
    call = session.get(Call, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="call not found")
    assert_call_access(user, call)
    return call


@router.post("/calls", response_model=CallSummary, status_code=status.HTTP_201_CREATED)
def create_call(
    payload: CallCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CallSummary:
    if user.role not in {Role.AGENT.value, Role.SUPERVISOR.value, Role.ADMIN.value}:
        raise HTTPException(status_code=403, detail="role cannot register calls")
    if payload.size_bytes and payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"file exceeds the {settings.max_upload_mb} MB limit",
        )

    call = Call(
        tenant_id=user.tenant_id,
        created_by=user.id,
        source=CallSource.UPLOAD.value,
        status=CallStatus.AWAITING_UPLOAD.value,
        original_filename=payload.original_filename[:255],
        recording_date=(
            dt.datetime.combine(payload.recording_date, dt.time.min)
            if payload.recording_date
            else None
        ),
        consent_confirmed=payload.consent_confirmed,
        consent_reference=payload.consent_reference,
    )
    session.add(call)
    session.flush()
    append(
        session,
        event="call.created",
        actor=user,
        call_id=call.id,
        payload={
            "source": call.source,
            "original_filename": call.original_filename,
            "recording_date": payload.recording_date.isoformat()
            if payload.recording_date
            else None,
            "consent_confirmed": payload.consent_confirmed,
            "consent_reference": payload.consent_reference,
        },
    )
    session.commit()
    return CallSummary(
        id=call.id,
        status=call.status,
        source=call.source,
        created_at=call.created_at,
        duration_seconds=None,
        original_filename=call.original_filename,
        action=None,
        script_locked=False,
        model_version=None,
        policy_version=None,
        error_message=None,
        episode_count=0,
    )


@router.post("/calls/{call_id}/audio", response_model=UploadAccepted)
async def upload_audio(
    call_id: str,
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UploadAccepted:
    call = _get_call(session, call_id, user)
    if call.created_by != user.id and user.role not in {
        Role.ADMIN.value,
        Role.SUPERVISOR.value,
    }:
        raise HTTPException(status_code=403, detail="cannot add audio to this call")
    if not call.consent_confirmed:
        raise HTTPException(
            status_code=422,
            detail="recording consent/notice must be confirmed before audio is accepted",
        )
    if call.status not in {
        CallStatus.AWAITING_UPLOAD.value,
        CallStatus.FAILED.value,
        CallStatus.COMPLETED.value,
        CallStatus.AWAITING_REVIEW.value,
    }:
        raise HTTPException(
            status_code=409,
            detail=f"call is currently '{call.status}' and cannot accept a new upload",
        )

    store = get_store()
    try:
        path, size = await store.save_upload(
            file, max_bytes=settings.max_upload_bytes
        )
    except StorageError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        info = probe(path)
    except AudioError as exc:
        store.discard(path)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    call.audio_uri = str(path)
    call.original_filename = (file.filename or call.original_filename or "recording")[:255]
    call.duration_seconds = round(info.duration_seconds, 3)
    call.action = None
    call.script_locked = False
    call.risk_episodes = None
    call.analysis_summary = None
    call.error_message = None
    job = enqueue(session, call)
    session.flush()

    append(
        session,
        event="call.audio_uploaded",
        actor=user,
        call_id=call.id,
        payload={
            "filename": call.original_filename,
            "size_bytes": size,
            "duration_seconds": round(info.duration_seconds, 2),
            "source_sample_rate": info.sample_rate,
            "source_channels": info.channels,
            "source_codec": info.codec,
            "job_id": job.id,
            "client_ip": request.client.host if request.client else None,
        },
    )
    session.commit()

    return UploadAccepted(
        call_id=call.id,
        status=call.status,
        filename=call.original_filename or "",
        size_bytes=size,
        duration_seconds=round(info.duration_seconds, 3),
        sample_rate=info.sample_rate,
        channels=info.channels,
        job_id=job.id,
    )


@router.get("/calls", response_model=CallListResponse)
def list_calls(
    limit: int = Query(default=25, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CallListResponse:
    stmt = select(Call).where(Call.tenant_id == user.tenant_id)
    if user.role == Role.AGENT.value:
        stmt = stmt.where(Call.created_by == user.id)
    if status_filter:
        stmt = stmt.where(Call.status == status_filter)
    total = int(
        session.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    )
    calls = list(
        session.execute(stmt.order_by(Call.created_at.desc()).limit(limit)).scalars()
    )
    return CallListResponse(
        calls=[
            CallSummary(
                id=c.id,
                status=c.status,
                source=c.source,
                created_at=c.created_at,
                duration_seconds=c.duration_seconds,
                original_filename=c.original_filename,
                action=c.action,
                script_locked=c.script_locked,
                model_version=c.model_version,
                policy_version=c.policy_version,
                error_message=c.error_message,
                episode_count=len(c.risk_episodes or []),
            )
            for c in calls
        ],
        total=total,
    )


@router.get("/calls/{call_id}")
def get_call(
    call_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    call = _get_call(session, call_id, user)
    return {
        "id": call.id,
        "status": call.status,
        "source": call.source,
        "created_at": call.created_at,
        "started_at": call.started_at,
        "ended_at": call.ended_at,
        "duration_seconds": call.duration_seconds,
        "original_filename": call.original_filename,
        "action": call.action,
        "script_locked": call.script_locked,
        "model_version": call.model_version,
        "policy_version": call.policy_version,
        "error_message": call.error_message,
        "consent_confirmed": call.consent_confirmed,
        "consent_reference": call.consent_reference,
        "recording_date": call.recording_date,
        "audio_expires_at": call.audio_expires_at,
        "episode_count": len(call.risk_episodes or []),
    }


@router.get("/calls/{call_id}/timeline", response_model=TimelineResponse)
def get_timeline(
    call_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TimelineResponse:
    call = _get_call(session, call_id, user)
    windows = list(
        session.execute(
            select(WindowScore)
            .where(WindowScore.call_id == call.id)
            .order_by(WindowScore.window_index.asc())
        ).scalars()
    )
    decisions = {
        d.window_index: d
        for d in session.execute(
            select(Decision).where(Decision.call_id == call.id)
        ).scalars()
    }

    handoff = session.execute(
        select(Handoff)
        .where(Handoff.call_id == call.id)
        .order_by(Handoff.raised_at.desc())
        .limit(1)
    ).scalar_one_or_none()

    policy_record = session.execute(
        select(PolicyVersion)
        .where(PolicyVersion.status == PolicyStatus.ACTIVE.value)
        .order_by(PolicyVersion.activated_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    model_record = (
        session.get(ModelVersion, call.model_version) if call.model_version else None
    )

    expired = audio_expired(call)
    audio_available = bool(call.audio_uri) and not expired

    return TimelineResponse(
        call={
            "id": call.id,
            "status": call.status,
            "source": call.source,
            "created_at": call.created_at,
            "started_at": call.started_at,
            "ended_at": call.ended_at,
            "duration_seconds": call.duration_seconds,
            "original_filename": call.original_filename,
            "action": call.action,
            "script_locked": call.script_locked,
            "model_version": call.model_version,
            "policy_version": call.policy_version,
            "error_message": call.error_message,
            "consent_confirmed": call.consent_confirmed,
            "consent_reference": call.consent_reference,
            "audio": {
                "available": audio_available,
                "expired": expired,
                "expires_at": call.audio_expires_at,
                "url": f"/v1/calls/{call.id}/audio" if audio_available else None,
            },
            "episode_count": len(call.risk_episodes or []),
        },
        handoff=handoff,
        windows=[
            {
                "index": w.window_index,
                "start": w.start_seconds,
                "end": w.end_seconds,
                "arousal": w.arousal,
                "valence": w.valence,
                "dominance": w.dominance,
                "arousal_ema": w.arousal_ema,
                "valence_ema": w.valence_ema,
                "dominance_ema": w.dominance_ema,
                "state": w.state,
                "probabilities": {
                    "calm": w.p_calm,
                    "engaged": w.p_engaged,
                    "frustrated": w.p_frustrated,
                    "distressed": w.p_distressed,
                    "unclear": w.p_unclear,
                },
                "speech_ratio": w.speech_ratio,
                "quality_status": w.quality_status,
                "action": decisions[w.window_index].action
                if w.window_index in decisions
                else "CONTINUE",
                "rules": [
                    r["rule_id"]
                    for r in (decisions[w.window_index].rules_fired or [])
                    if isinstance(r, dict) and "rule_id" in r
                ]
                if w.window_index in decisions
                else [],
                "confidence": w.confidence,
            }
            for w in windows
        ],
        episodes=call.risk_episodes or [],
        summary=call.analysis_summary,
        policy={
            "version": call.policy_version or (policy_record.version if policy_record else None),
            "description": _policy_description(policy_record),
            "active_version": policy_record.version if policy_record else None,
        },
        model={
            "version": call.model_version,
            "name": model_record.name if model_record else None,
            "kind": model_record.kind if model_record else None,
            "artifact_digest": model_record.artifact_digest if model_record else None,
            "calibrated": False if model_record and model_record.kind == "heuristic-baseline" else None,
            "notes": model_record.notes if model_record else None,
        },
    )


def _policy_description(record: PolicyVersion | None) -> str | None:
    if record is None:
        return None
    try:
        return parse_policy(record.yaml_body).description
    except Exception:
        return None


@router.get("/calls/{call_id}/audio")
def get_audio(
    call_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    call = _get_call(session, call_id, user)
    if not call.audio_uri:
        raise HTTPException(status_code=404, detail="no audio is stored for this call")
    if audio_expired(call):
        raise HTTPException(
            status_code=410,
            detail="audio has expired under the retention policy; "
            "the timeline and decisions remain available",
        )
    path = Path(call.audio_uri)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="audio file is unavailable")

    if not request.headers.get("range"):
        append(
            session,
            event="audio.accessed",
            actor=user,
            call_id=call.id,
            payload={"purpose": "timeline_review", "retention_expires_at": str(call.audio_expires_at)},
        )
        session.commit()

    return FileResponse(
        path,
        media_type="audio/wav",
        filename=f"voxsafe-{call.id[:8]}.wav",
        headers={"Cache-Control": "private, no-store"},
    )


@router.get("/calls/{call_id}/audit")
def call_audit(
    call_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    from ..models import AuditEvent

    call = _get_call(session, call_id, user)
    events = list(
        session.execute(
            select(AuditEvent)
            .where(AuditEvent.call_id == call.id)
            .order_by(AuditEvent.seq.asc())
        ).scalars()
    )
    return {
        "events": [
            {
                "seq": e.seq,
                "occurred_at": e.occurred_at,
                "actor_id": e.actor_id,
                "actor_role": e.actor_role,
                "event": e.event,
                "payload": e.payload,
                "prev_hash": e.prev_hash,
                "hash": e.hash,
            }
            for e in events
        ]
    }
