from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..core.security import (
    create_access_token,
    digest_refresh_token,
    get_login_throttle,
    new_refresh_token,
    verify_password,
)
from ..db.base import get_session
from ..models import RefreshSession, User, utcnow
from ..schemas import (
    LoginRequest,
    LogoutResponse,
    RefreshRequest,
    TokenPair,
    UserOut,
)
from ..services.audit import append
from .deps import client_ip, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _issue(session: Session, user: User, request: Request) -> TokenPair:
    raw_refresh, digest = new_refresh_token()
    refresh = RefreshSession(
        user_id=user.id,
        token_hash=digest,
        expires_at=utcnow() + dt.timedelta(days=settings.refresh_token_ttl_days),
        client_ip=client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:300],
    )
    session.add(refresh)
    session.flush()

    access, expires_in = create_access_token(
        user_id=user.id,
        role=user.role,
        tenant_id=user.tenant_id,
        session_id=refresh.id,
    )
    return TokenPair(
        access_token=access,
        expires_in=expires_in,
        refresh_token=raw_refresh,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenPair)
def login(
    payload: LoginRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> TokenPair:
    throttle = get_login_throttle()
    ip = client_ip(request)
    locked = throttle.check(ip, payload.email)
    if locked is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"too many attempts; try again in {locked} seconds",
            headers={"Retry-After": str(locked)},
        )

    user = session.execute(
        select(User).where(User.email == payload.email.strip().lower())
    ).scalar_one_or_none()

    # Constant-path failure for unknown accounts and wrong passwords.
    if user is None or not verify_password(payload.password, user.password_hash):
        throttle.record_failure(ip, payload.email)
        append(
            session,
            event="auth.login_failed",
            actor_id=user.id if user else None,
            actor_role=user.role if user else None,
            payload={
                "email_attempted": payload.email.strip().lower(),
                "client_ip": ip,
                "reason": "invalid_credentials",
            },
        )
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="email or password is incorrect",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="account is not active"
        )

    throttle.reset(ip, payload.email)
    user.last_login_at = utcnow()
    pair = _issue(session, user, request)
    append(
        session,
        event="auth.login",
        actor=user,
        payload={
            "client_ip": ip,
            "auth_method": "password",
            "session_id": pair.access_token[-8:],
        },
    )
    session.commit()
    return pair


@router.post("/refresh", response_model=TokenPair)
def refresh(
    payload: RefreshRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> TokenPair:
    digest = digest_refresh_token(payload.refresh_token)
    record = session.execute(
        select(RefreshSession).where(RefreshSession.token_hash == digest)
    ).scalar_one_or_none()
    if (
        record is None
        or record.revoked_at is not None
        or record.expires_at <= utcnow()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="session expired"
        )
    user = session.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="session expired"
        )

    # Rotate: the presented token is single-use.
    record.revoked_at = utcnow()
    pair = _issue(session, user, request)
    append(
        session,
        event="auth.token_refreshed",
        actor=user,
        payload={"rotated_session": record.id, "client_ip": client_ip(request)},
    )
    session.commit()
    return pair


@router.post("/logout", response_model=LogoutResponse)
def logout(
    request: Request,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> LogoutResponse:
    from fastapi.security import HTTPAuthorizationCredentials

    auth_header = request.headers.get("authorization", "")
    token = auth_header[7:] if auth_header.lower().startswith("bearer ") else ""
    from ..core.security import decode_access_token

    revoked = 0
    try:
        claims = decode_access_token(token)
        record = session.get(RefreshSession, claims.get("sid"))
        if record is not None and record.user_id == user.id:
            record.revoked_at = utcnow()
            revoked = 1
    except Exception:
        revoked = 0

    append(
        session,
        event="auth.logout",
        actor=user,
        payload={"sessions_revoked": revoked},
    )
    session.commit()
    return LogoutResponse(revoked=bool(revoked))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
