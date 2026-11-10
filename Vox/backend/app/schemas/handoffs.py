from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field


class AcknowledgeRequest(BaseModel):
    resolution: Literal["resumed_human", "closed", "escalated"]
    notes: str | None = Field(default=None, max_length=2000)


class AcknowledgeResponse(BaseModel):
    handoff_id: str
    status: str
    resolution: str
    acknowledged_at: dt.datetime
    script_locked: bool


class LockReleaseRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)


class LockReleaseResponse(BaseModel):
    call_id: str
    script_locked: bool
    released_at: dt.datetime
    released_by: str
