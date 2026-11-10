from __future__ import annotations

import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CallCreate(BaseModel):
    source: Literal["upload"] = "upload"
    original_filename: str = Field(min_length=1, max_length=255)
    size_bytes: int | None = Field(default=None, ge=1)
    recording_date: dt.date | None = None
    consent_confirmed: bool
    consent_reference: str | None = Field(default=None, max_length=200)

    @field_validator("consent_confirmed")
    @classmethod
    def _consent_required(cls, value: bool) -> bool:
        if not value:
            raise ValueError(
                "recording consent/notice must be confirmed before upload"
            )
        return value


class CallSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    source: str
    created_at: dt.datetime
    duration_seconds: float | None
    original_filename: str | None
    action: str | None
    script_locked: bool
    model_version: str | None
    policy_version: str | None
    error_message: str | None
    episode_count: int = 0


class CallListResponse(BaseModel):
    calls: list[CallSummary]
    total: int


class UploadAccepted(BaseModel):
    call_id: str
    status: str
    filename: str
    size_bytes: int
    duration_seconds: float
    sample_rate: int
    channels: int
    job_id: str


class WindowPoint(BaseModel):
    index: int
    start: float
    end: float
    arousal: float
    valence: float
    dominance: float
    arousal_ema: float
    valence_ema: float
    dominance_ema: float
    state: str
    probabilities: dict[str, float]
    speech_ratio: float
    quality_status: str
    action: str
    rules: list[str]
    confidence: float


class EpisodeOut(BaseModel):
    start_seconds: float
    end_seconds: float
    action: str
    severity: int
    kind: str
    window_indices: list[int]
    evidence: list[dict[str, Any]]
    peak: dict[str, Any]


class HandoffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    call_id: str
    raised_at: dt.datetime
    trigger_rule: str
    trigger_severity: int
    action: str
    status: str
    acknowledged_by: str | None
    acknowledged_at: dt.datetime | None
    resolution: str | None
    resolution_notes: str | None


class TimelineResponse(BaseModel):
    call: dict[str, Any]
    handoff: HandoffOut | None
    windows: list[WindowPoint]
    episodes: list[EpisodeOut]
    summary: dict[str, Any] | None
    policy: dict[str, Any]
    model: dict[str, Any]
