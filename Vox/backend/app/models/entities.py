"""SQLAlchemy entities.

Tenant isolation is modelled explicitly: every user and call carries
``tenant_id`` and all application queries are scoped by the authenticated
user's tenant before any other filter.
"""

from __future__ import annotations

import datetime as dt
import uuid
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JSONType = JSON().with_variant(JSONB, "postgresql")


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


def new_id() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Role(str, Enum):
    AGENT = "agent"
    SUPERVISOR = "supervisor"
    ADMIN = "admin"
    AUDITOR = "auditor"
    ML_ADMIN = "ml_admin"


class CallSource(str, Enum):
    UPLOAD = "upload"
    LIVE = "live"


class CallStatus(str, Enum):
    CREATED = "created"
    AWAITING_UPLOAD = "awaiting_upload"
    UPLOADING = "uploading"
    QUEUED = "queued"
    PROCESSING = "processing"
    ACTIVE = "active"
    COMPLETED = "completed"
    AWAITING_REVIEW = "awaiting_review"
    FAILED = "failed"


class JobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class HandoffStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"


class HandoffResolution(str, Enum):
    RESUMED_HUMAN = "resumed_human"
    CLOSED = "closed"
    ESCALATED = "escalated"


class PolicyStatus(str, Enum):
    DRAFT = "draft"
    REVIEW = "review"
    ACTIVE = "active"
    RETIRED = "retired"


class Action(str, Enum):
    CONTINUE = "CONTINUE"
    REVIEW = "REVIEW"
    HANDOFF_IMMEDIATE = "HANDOFF_IMMEDIATE"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[Role] = mapped_column(
        String(20), nullable=False, default=Role.AGENT.value
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    last_login_at: Mapped[dt.datetime | None] = mapped_column(DateTime)

    __table_args__ = (
        CheckConstraint(
            "role IN ('agent','supervisor','admin','auditor','ml_admin')",
            name="ck_users_role",
        ),
    )


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    client_ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))

    __table_args__ = (Index("ix_refresh_user", "user_id", "expires_at"),)


class Call(Base):
    __tablename__ = "calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=CallStatus.CREATED.value
    )

    original_filename: Mapped[str | None] = mapped_column(String(255))
    audio_uri: Mapped[str | None] = mapped_column(String(500))
    audio_expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    duration_seconds: Mapped[float | None] = mapped_column(Float)

    recording_date: Mapped[dt.datetime | None] = mapped_column(DateTime)
    consent_confirmed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    consent_reference: Mapped[str | None] = mapped_column(String(200))

    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    ended_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, index=True
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow, onupdate=utcnow
    )

    model_version: Mapped[str | None] = mapped_column(String(64))
    policy_version: Mapped[str | None] = mapped_column(String(64))
    action: Mapped[str | None] = mapped_column(String(24))
    script_locked: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    risk_episodes: Mapped[list | None] = mapped_column(JSONType)
    analysis_summary: Mapped[dict | None] = mapped_column(JSONType)
    error_message: Mapped[str | None] = mapped_column(Text)

    windows: Mapped[list["WindowScore"]] = relationship(
        back_populates="call", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint("source IN ('upload','live')", name="ck_calls_source"),
        CheckConstraint(
            "status IN ('created','awaiting_upload','uploading','queued',"
            "'processing','active','completed','awaiting_review','failed')",
            name="ck_calls_status",
        ),
        Index("ix_calls_tenant_created", "tenant_id", "created_at"),
        Index("ix_calls_tenant_action", "tenant_id", "action"),
    )


class WindowScore(Base):
    __tablename__ = "window_scores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("calls.id", ondelete="CASCADE"), nullable=False
    )
    window_index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds: Mapped[float] = mapped_column(Float, nullable=False)

    arousal: Mapped[float] = mapped_column(Float, nullable=False)
    valence: Mapped[float] = mapped_column(Float, nullable=False)
    dominance: Mapped[float] = mapped_column(Float, nullable=False)
    arousal_ema: Mapped[float] = mapped_column(Float, nullable=False)
    valence_ema: Mapped[float] = mapped_column(Float, nullable=False)
    dominance_ema: Mapped[float] = mapped_column(Float, nullable=False)
    arousal_std: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    p_calm: Mapped[float] = mapped_column(Float, nullable=False)
    p_engaged: Mapped[float] = mapped_column(Float, nullable=False)
    p_frustrated: Mapped[float] = mapped_column(Float, nullable=False)
    p_distressed: Mapped[float] = mapped_column(Float, nullable=False)
    p_unclear: Mapped[float] = mapped_column(Float, nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    speech_ratio: Mapped[float] = mapped_column(Float, nullable=False)
    quality_status: Mapped[str] = mapped_column(String(20), nullable=False)
    rms_dbfs: Mapped[float] = mapped_column(Float, nullable=False)
    consecutive_high_arousal_windows: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    speech_seconds_last_30s: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    features: Mapped[dict] = mapped_column(JSONType, nullable=False)

    call: Mapped[Call] = relationship(back_populates="windows")

    __table_args__ = (
        UniqueConstraint("call_id", "window_index", name="uq_window_call_index"),
        Index("ix_windows_call_start", "call_id", "start_seconds"),
    )


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("calls.id", ondelete="CASCADE"), nullable=False
    )
    window_index: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    action: Mapped[str] = mapped_column(String(24), nullable=False)
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    rules_fired: Mapped[list] = mapped_column(JSONType, nullable=False)
    features: Mapped[dict] = mapped_column(JSONType, nullable=False)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )

    __table_args__ = (
        UniqueConstraint("call_id", "window_index", name="uq_decision_call_index"),
        CheckConstraint(
            "action IN ('CONTINUE','REVIEW','HANDOFF_IMMEDIATE')",
            name="ck_decisions_action",
        ),
        Index("ix_decisions_call_action", "call_id", "action"),
    )


class Handoff(Base):
    __tablename__ = "handoffs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("calls.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    decision_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("decisions.id")
    )
    raised_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    trigger_rule: Mapped[str] = mapped_column(String(120), nullable=False)
    trigger_severity: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(24), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default="distress")
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=HandoffStatus.OPEN.value
    )
    assigned_supervisor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id")
    )
    acknowledged_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id")
    )
    acknowledged_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    resolution: Mapped[str | None] = mapped_column(String(24))
    resolution_notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("status IN ('open','acknowledged')", name="ck_handoff_status"),
        Index(
            "uq_handoff_open_call",
            "call_id",
            unique=True,
            sqlite_where=text("status = 'open'"),
            postgresql_where=text("status = 'open'"),
        ),
        Index("ix_handoffs_tenant_status", "tenant_id", "status", "raised_at"),
    )


class ScriptLockRelease(Base):
    __tablename__ = "script_lock_releases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("calls.id", ondelete="CASCADE"), nullable=False
    )
    released_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    handoff_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("handoffs.id"))
    released_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )

    __table_args__ = (
        CheckConstraint("length(reason) >= 10", name="ck_lock_reason_length"),
    )


class PolicyVersion(Base):
    __tablename__ = "policies"

    version: Mapped[str] = mapped_column(String(64), primary_key=True)
    yaml_body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    drafted_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    approved_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    submitted_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    approved_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    activated_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    retired_at: Mapped[dt.datetime | None] = mapped_column(DateTime)

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','review','active','retired')", name="ck_policy_status"
        ),
        CheckConstraint(
            "approved_by IS NULL OR drafted_by IS NULL OR approved_by <> drafted_by",
            name="ck_policy_two_person",
        ),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"

    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    occurred_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False)
    actor_id: Mapped[str | None] = mapped_column(String(36))
    actor_role: Mapped[str | None] = mapped_column(String(20))
    event: Mapped[str] = mapped_column(String(80), nullable=False)
    call_id: Mapped[str | None] = mapped_column(String(36), index=True)
    model_version: Mapped[str | None] = mapped_column(String(64))
    policy_version: Mapped[str | None] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSONType, nullable=False, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    hash: Mapped[str] = mapped_column(String(64), nullable=False)

    __table_args__ = (Index("ix_audit_event_time", "occurred_at"),)


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    call_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("calls.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=JobStatus.QUEUED.value
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    error: Mapped[str | None] = mapped_column(Text)
    metrics: Mapped[dict | None] = mapped_column(JSONType)

    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','succeeded','failed')",
            name="ck_job_status",
        ),
        Index("ix_jobs_status_created", "status", "created_at"),
        Index("ix_jobs_call", "call_id"),
    )


class ModelVersion(Base):
    __tablename__ = "model_versions"

    version: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    artifact_digest: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    deployed_at: Mapped[dt.datetime] = mapped_column(
        DateTime, nullable=False, default=utcnow
    )
    notes: Mapped[str | None] = mapped_column(Text)
    metrics: Mapped[dict | None] = mapped_column(JSONType)


class ServiceHeartbeat(Base):
    __tablename__ = "service_heartbeats"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    last_seen_at: Mapped[dt.datetime] = mapped_column(DateTime, nullable=False)
    detail: Mapped[dict | None] = mapped_column(JSONType)
