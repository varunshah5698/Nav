from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from voxml.scoring import ARTIFACT_DIGEST, MODEL_KIND, MODEL_NAME, MODEL_VERSION

from ..models import ModelVersion, User
from ..services.audit import append, install_append_only_triggers
from ..services.policy_registry import seed_baseline_policy
from .base import create_schema, session_scope


def seed_model_version(session: Session) -> ModelVersion:
    record = session.get(ModelVersion, MODEL_VERSION)
    if record is not None:
        return record
    record = ModelVersion(
        version=MODEL_VERSION,
        name=MODEL_NAME,
        kind=MODEL_KIND,
        artifact_digest=ARTIFACT_DIGEST,
        status="active",
        notes=(
            "Hand-authored acoustic baseline. Not trained on labelled affect data "
            "and not calibrated; the dimensional outputs are interpretable "
            "proxies, not validated measurements."
        ),
        metrics=None,
    )
    session.add(record)
    session.flush()
    return record


def bootstrap_user(session: Session, *, email: str, password: str, name: str) -> User:
    from ..core.security import hash_password

    existing = session.execute(
        select(User).where(User.email == email.strip().lower())
    ).scalar_one_or_none()
    if existing is not None:
        return existing
    user = User(
        tenant_id="voxsafe-default",
        email=email.strip().lower(),
        password_hash=hash_password(password),
        full_name=name,
        role="agent",
        is_active=True,
    )
    session.add(user)
    session.flush()
    append(
        session,
        event="user.bootstrap_created",
        actor_id=None,
        actor_role="system",
        payload={"user_id": user.id, "email": user.email, "role": user.role},
    )
    return user


def initialize(*, create_tables: bool = True) -> None:
    if create_tables:
        create_schema()
    with session_scope() as session:
        install_append_only_triggers(session)
        seed_baseline_policy(session)
        seed_model_version(session)
    with session_scope() as session:
        # Record the deployment once; a restart is not a new deployment.
        from ..models import AuditEvent

        exists = session.execute(
            select(AuditEvent.seq).where(AuditEvent.event == "system.started").limit(1)
        ).first()
        if not exists:
            append(
                session,
                event="system.started",
                actor_role="system",
                payload={
                    "app": "VoxSafe",
                    "version": "1.0.0",
                    "started_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                    "policy": "pol-2026.11.1",
                },
            )
