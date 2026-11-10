from __future__ import annotations

import datetime as dt
from typing import Any

from pydantic import BaseModel, ConfigDict


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    seq: int
    occurred_at: dt.datetime
    actor_id: str | None
    actor_role: str | None
    event: str
    call_id: str | None
    model_version: str | None
    policy_version: str | None
    payload: dict[str, Any]
    prev_hash: str
    hash: str


class AuditListResponse(BaseModel):
    events: list[AuditEventOut]
    total: int
    head_hash: str


class ChainVerification(BaseModel):
    valid: bool
    events_checked: int
    first_failing_seq: int | None
    errors: list[str]
    head_hash: str
    verified_at: dt.datetime
    duration_ms: float
