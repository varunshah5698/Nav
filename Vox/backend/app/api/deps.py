from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ..core.security import AuthError, decode_access_token
from ..db.base import get_session
from ..models import Call, Role, User

bearer = HTTPBearer(auto_error=False)

TENANT_WIDE_ROLES = {Role.SUPERVISOR.value, Role.AUDITOR.value, Role.ADMIN.value}


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(credentials.credentials)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = session.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="account is not active"
        )
    if user.tenant_id != payload.get("tenant"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="session tenant mismatch"
        )
    request.state.user_id = user.id
    return user


def require_roles(*roles: Role) -> Callable[[User], User]:
    allowed = {r.value for r in roles}

    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"role '{user.role}' cannot perform this action",
            )
        return user

    return _guard


def assert_call_access(user: User, call: Call) -> None:
    """Tenant isolation plus per-role call visibility.

    Agents may only see calls they registered themselves; supervisors, auditors
    and administrators see their whole tenant. Cross-tenant access is always
    denied, including for administrators.
    """
    if call.tenant_id != user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="call not found")
    if user.role == Role.AGENT.value and call.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="call not found")


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.client.host if request.client else "unknown")[:64]
