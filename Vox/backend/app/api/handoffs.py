from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.base import get_session
from ..models import (
    Call,
    Handoff,
    HandoffResolution,
    HandoffStatus,
    Role,
    ScriptLockRelease,
    User,
    utcnow,
)
from ..schemas import (
    AcknowledgeRequest,
    AcknowledgeResponse,
    HandoffOut,
    LockReleaseRequest,
    LockReleaseResponse,
)
from ..services.audit import append
from .deps import require_roles

router = APIRouter(tags=["handoffs"])

triage_roles = require_roles(Role.SUPERVISOR, Role.ADMIN)
read_roles = require_roles(Role.SUPERVISOR, Role.ADMIN, Role.AUDITOR)


def _handoff(session: Session, handoff_id: str, user: User) -> Handoff:
    record = session.get(Handoff, handoff_id)
    if record is None or record.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="handoff not found")
    return record


@router.get("/handoffs", response_model=list[HandoffOut])
def list_handoffs(
    status_filter: str | None = Query(default="open", alias="status"),
    user: User = Depends(read_roles),
    session: Session = Depends(get_session),
) -> list[Handoff]:
    stmt = select(Handoff).where(Handoff.tenant_id == user.tenant_id)
    if status_filter:
        stmt = stmt.where(Handoff.status == status_filter)
    return list(
        session.execute(
            stmt.order_by(Handoff.trigger_severity.desc(), Handoff.raised_at.asc())
        ).scalars()
    )


@router.post("/handoffs/{handoff_id}/ack", response_model=AcknowledgeResponse)
def acknowledge_handoff(
    handoff_id: str,
    payload: AcknowledgeRequest,
    user: User = Depends(triage_roles),
    session: Session = Depends(get_session),
) -> AcknowledgeResponse:
    """Record a genuine human acknowledgment.

    Acknowledging does NOT release the script lock: that is a separate,
    reason-bearing action, so a mouse click cannot silently resume automated
    collections.
    """
    handoff = _handoff(session, handoff_id, user)
    if handoff.status == HandoffStatus.ACKNOWLEDGED.value:
        raise HTTPException(status_code=409, detail="handoff is already acknowledged")

    handoff.status = HandoffStatus.ACKNOWLEDGED.value
    handoff.acknowledged_by = user.id
    handoff.acknowledged_at = utcnow()
    handoff.resolution = HandoffResolution(payload.resolution).value
    handoff.resolution_notes = payload.notes
    call = session.get(Call, handoff.call_id)

    append(
        session,
        event="handoff.acknowledged",
        actor=user,
        call_id=handoff.call_id,
        payload={
            "handoff_id": handoff.id,
            "resolution": handoff.resolution,
            "notes": payload.notes,
            "script_locked": bool(call and call.script_locked),
        },
    )
    session.commit()
    return AcknowledgeResponse(
        handoff_id=handoff.id,
        status=handoff.status,
        resolution=handoff.resolution or payload.resolution,
        acknowledged_at=handoff.acknowledged_at or utcnow(),
        script_locked=bool(call and call.script_locked),
    )


@router.post(
    "/calls/{call_id}/script-lock/release", response_model=LockReleaseResponse
)
def release_script_lock(
    call_id: str,
    payload: LockReleaseRequest,
    user: User = Depends(triage_roles),
    session: Session = Depends(get_session),
) -> LockReleaseResponse:
    call = session.get(Call, call_id)
    if call is None or call.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="call not found")
    if not call.script_locked:
        raise HTTPException(status_code=409, detail="script lock is not engaged")

    open_handoff = session.execute(
        select(Handoff).where(
            Handoff.call_id == call.id,
            Handoff.status == HandoffStatus.OPEN.value,
        )
    ).scalar_one_or_none()
    if open_handoff is not None:
        raise HTTPException(
            status_code=409,
            detail="acknowledge the open handoff before releasing the script lock",
        )

    latest = session.execute(
        select(Handoff)
        .where(Handoff.call_id == call.id)
        .order_by(Handoff.raised_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if latest is None:
        raise HTTPException(
            status_code=409,
            detail="no handoff exists for this call; lock release is not permitted",
        )

    reason = payload.reason.strip()
    if len(reason) < 10:
        raise HTTPException(
            status_code=422, detail="a documented reason of at least 10 characters is required"
        )

    call.script_locked = False
    release = ScriptLockRelease(
        call_id=call.id,
        released_by=user.id,
        reason=reason,
        handoff_id=latest.id,
    )
    session.add(release)
    append(
        session,
        event="script_lock.released",
        actor=user,
        call_id=call.id,
        payload={
            "reason": reason,
            "handoff_id": latest.id,
            "handoff_resolution": latest.resolution,
            "release_id": release.id,
        },
    )
    session.commit()
    return LockReleaseResponse(
        call_id=call.id,
        script_locked=call.script_locked,
        released_at=release.released_at,
        released_by=user.id,
    )
