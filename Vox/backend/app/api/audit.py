from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db.base import get_session
from ..models import AuditEvent, Role, User, utcnow
from ..schemas import AuditListResponse, ChainVerification
from ..services.audit import append, verify_chain
from .deps import require_roles

router = APIRouter(tags=["audit"])


@router.get("/audit", response_model=AuditListResponse)
def list_audit(
    call_id: str | None = Query(default=None),
    event: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    user: User = Depends(
        require_roles(Role.AUDITOR, Role.ADMIN, Role.SUPERVISOR)
    ),
    session: Session = Depends(get_session),
) -> AuditListResponse:
    """Read-only view. There is deliberately no update or delete endpoint."""
    stmt = select(AuditEvent)
    if call_id:
        stmt = stmt.where(AuditEvent.call_id == call_id)
    if event:
        stmt = stmt.where(AuditEvent.event == event)
    total = int(
        session.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    )
    events = list(
        session.execute(stmt.order_by(AuditEvent.seq.desc()).limit(limit)).scalars()
    )
    head = session.execute(
        select(AuditEvent.hash).order_by(AuditEvent.seq.desc()).limit(1)
    ).scalar_one_or_none()
    return AuditListResponse(
        events=events, total=total, head_hash=head or "0" * 64
    )


@router.post("/audit/verify", response_model=ChainVerification)
def verify_audit_chain(
    user: User = Depends(require_roles(Role.AUDITOR, Role.ADMIN)),
    session: Session = Depends(get_session),
) -> ChainVerification:
    """Recompute the hash chain. A success status is only ever returned here."""
    started = time.perf_counter()
    result = verify_chain(session)
    duration_ms = round((time.perf_counter() - started) * 1000, 2)

    if not result["valid"]:
        append(
            session,
            event="audit.chain_integrity_failure",
            actor=user,
            payload={
                "first_failing_seq": result["first_failing_seq"],
                "errors": result["errors"],
                "events_checked": result["events_checked"],
            },
        )
        session.commit()
        raise HTTPException(
            status_code=409,
            detail={
                "message": "audit chain verification failed",
                **result,
            },
        )

    append(
        session,
        event="audit.chain_verified",
        actor=user,
        payload={
            "events_checked": result["events_checked"],
            "head_hash": result["head_hash"],
            "duration_ms": duration_ms,
        },
    )
    session.commit()

    return ChainVerification(
        **result,
        verified_at=utcnow(),
        duration_ms=duration_ms,
    )
