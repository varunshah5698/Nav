from __future__ import annotations

import shutil
import subprocess

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..core.config import get_settings
from ..db.base import get_session
from ..models import ModelVersion, ServiceHeartbeat, utcnow
from ..schemas import HealthResponse
from ..services.policy_registry import get_active_policy
from ..workers.processor import worker_status

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
def health(session: Session = Depends(get_session)) -> HealthResponse:
    checks: dict = {}
    degraded: list[str] = []

    try:
        session.execute(text("SELECT 1"))
        checks["database"] = {"ok": True}
    except Exception as exc:  # pragma: no cover - infra failure
        checks["database"] = {"ok": False, "error": type(exc).__name__}
        degraded.append("database")

    try:
        policy = get_active_policy(session)
        checks["policy"] = {"ok": True, "version": policy.version}
    except Exception:
        checks["policy"] = {"ok": False}
        degraded.append("policy")

    ffmpeg = shutil.which("ffmpeg")
    checks["audio_decoder"] = {"ok": bool(ffmpeg), "binary": ffmpeg}
    if not ffmpeg:
        degraded.append("audio_decoder")

    worker = worker_status(session)
    checks["inference_worker"] = worker
    if not worker["healthy"]:
        degraded.append("inference_worker")

    heartbeat = session.get(ServiceHeartbeat, "analysis-worker")
    checks["worker_last_seen"] = (
        heartbeat.last_seen_at.isoformat() if heartbeat else None
    )

    model = session.get(ModelVersion, "baseline-acoustic-v1")
    checks["model"] = {
        "ok": model is not None,
        "version": model.version if model else None,
        "kind": model.kind if model else None,
        "calibrated": False if model and model.kind == "heuristic-baseline" else None,
    }
    if model is None:
        degraded.append("model")

    return HealthResponse(
        status="degraded" if degraded else "ok",
        checked_at=utcnow(),
        version="1.0.0",
        checks=checks,
        degraded=degraded,
    )
