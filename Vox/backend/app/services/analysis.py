"""Call analysis orchestration: storage -> ML pipeline -> persistence.

The worker calls :func:`process_call`.  Everything that constitutes a safety
decision is written inside a single transaction together with its audit events,
so a handoff can never exist without a matching script-lock state and audit
trail.
"""

from __future__ import annotations

import datetime as dt
import time
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from policy import Action, severity
from voxml.audio import AudioError, decode_16k_mono, normalize, write_wav_16k_mono
from voxml.pipeline import CallAnalysis, analyze_samples
from voxml.scoring import MODEL_VERSION

from ..core.config import get_settings
from ..db.base import session_scope
from ..models import (
    Call,
    CallStatus,
    Decision,
    Handoff,
    HandoffStatus,
    JobStatus,
    ProcessingJob,
    ServiceHeartbeat,
    WindowScore,
    utcnow,
)
from .audit import append
from .policy_registry import PolicyUnavailable, get_active_policy
from .storage import get_store

WORKER_NAME = "analysis-worker"


def enqueue(session: Session, call: Call) -> ProcessingJob:
    job = ProcessingJob(call_id=call.id, status=JobStatus.QUEUED.value)
    call.status = CallStatus.QUEUED.value
    call.error_message = None
    session.add(job)
    session.flush()
    return job


def requeue_stale_jobs(session: Session) -> int:
    """Jobs left 'running' by a crash are retried, never silently dropped."""
    stale = list(
        session.execute(
            select(ProcessingJob).where(ProcessingJob.status == JobStatus.RUNNING.value)
        ).scalars()
    )
    for job in stale:
        job.status = JobStatus.QUEUED.value
        job.error = "requeued after worker restart"
    return len(stale)


def claim_next_job(session: Session) -> ProcessingJob | None:
    row = session.execute(
        select(ProcessingJob)
        .where(ProcessingJob.status == JobStatus.QUEUED.value)
        .order_by(ProcessingJob.created_at.asc())
        .limit(1)
    ).scalar_one_or_none()
    if row is None:
        return None
    updated = session.execute(
        ProcessingJob.__table__.update()
        .where(
            ProcessingJob.id == row.id,
            ProcessingJob.status == JobStatus.QUEUED.value,
        )
        .values(
            status=JobStatus.RUNNING.value,
            started_at=utcnow(),
            attempts=ProcessingJob.attempts + 1,
        )
    )
    if updated.rowcount != 1:  # pragma: no cover - single worker
        return None
    session.commit()
    return session.get(ProcessingJob, row.id)


def heartbeat(session: Session, detail: dict[str, Any] | None = None) -> None:
    record = session.get(ServiceHeartbeat, WORKER_NAME)
    if record is None:
        session.add(
            ServiceHeartbeat(name=WORKER_NAME, last_seen_at=utcnow(), detail=detail)
        )
    else:
        record.last_seen_at = utcnow()
        record.detail = detail
    session.commit()


def process_call(job_id: str) -> None:
    """Run one queued job. Never raises for expected failures."""
    settings = get_settings()
    store = get_store()

    with session_scope() as session:
        job = session.get(ProcessingJob, job_id)
        if job is None:
            return
        call = session.get(Call, job.call_id)
        if call is None:
            job.status = JobStatus.FAILED.value
            job.error = "call no longer exists"
            job.finished_at = utcnow()
            return
        call.status = CallStatus.PROCESSING.value
        call.started_at = call.started_at or utcnow()
        policy = get_active_policy(session)

    upload_path = _resolve_upload(call_id=job.call_id, session_factory=session_scope)

    try:
        analysis, samples = _analyze(upload_path, policy)
    except (AudioError, ValueError, PolicyUnavailable) as exc:
        _mark_failed(job_id, str(exc))
        store.discard(Path(upload_path) if upload_path else None)
        return
    except Exception as exc:  # pragma: no cover - unexpected
        _mark_failed(job_id, f"analysis pipeline error: {type(exc).__name__}")
        store.discard(Path(upload_path) if upload_path else None)
        return

    normalized = store.normalized_path(job.call_id)
    write_wav_16k_mono(normalized, samples)

    with session_scope() as session:
        job = session.get(ProcessingJob, job_id)
        call = session.get(Call, job.call_id)
        assert job is not None and call is not None  # guarded above
        _persist(session, call, analysis, normalized)
        job.status = JobStatus.SUCCEEDED.value
        job.finished_at = utcnow()
        job.metrics = {
            **analysis.timings_ms,
            "window_count": len(analysis.windows),
            "audio_seconds": round(analysis.duration_seconds, 2),
            "first_scorable_window_seconds": 3.0,
        }

    store.discard(Path(upload_path))
    _heartbeat_safe()


def _resolve_upload(*, call_id: str, session_factory) -> str | None:
    with session_factory() as session:
        call = session.get(Call, call_id)
        return call.audio_uri if call else None


def _analyze(path: str | None, policy) -> tuple[CallAnalysis, Any]:
    if not path or not Path(path).is_file():
        raise AudioError("uploaded audio is no longer available")
    timings: dict[str, float] = {}
    t0 = time.perf_counter()
    raw = decode_16k_mono(path)
    timings["decode_ms"] = round((time.perf_counter() - t0) * 1000, 2)
    t1 = time.perf_counter()
    samples, quality = normalize(raw)
    timings["normalize_ms"] = round((time.perf_counter() - t1) * 1000, 2)
    analysis = analyze_samples(
        samples,
        policy=policy,
        quality=quality,
        model_version=MODEL_VERSION,
        enabled_capabilities=get_settings().capabilities,
        timings=timings,
    )
    return analysis, samples


def _persist(session: Session, call: Call, analysis: CallAnalysis, audio_path: Path) -> None:
    settings = get_settings()
    store = get_store()

    # Re-analysis of the same call replaces its derived rows; audit history is
    # untouched and remains the source of truth for what happened before.
    session.execute(delete(WindowScore).where(WindowScore.call_id == call.id))
    session.execute(delete(Decision).where(Decision.call_id == call.id))

    windows: list[WindowScore] = []
    decisions: list[Decision] = []
    for result in analysis.windows:
        f = result.features
        s = result.score
        windows.append(
            WindowScore(
                call_id=call.id,
                window_index=f.window_index,
                start_seconds=f.start_seconds,
                end_seconds=f.end_seconds,
                arousal=s.arousal,
                valence=s.valence,
                dominance=s.dominance,
                arousal_ema=round(result.smoothed.arousal_ema, 4),
                valence_ema=round(result.smoothed.valence_ema, 4),
                dominance_ema=round(result.smoothed.dominance_ema, 4),
                arousal_std=round(result.smoothed.arousal_std, 4),
                p_calm=s.p_calm,
                p_engaged=s.p_engaged,
                p_frustrated=s.p_frustrated,
                p_distressed=s.p_distressed,
                p_unclear=s.p_unclear,
                state=s.state,
                confidence=s.confidence,
                speech_ratio=s.speech_ratio,
                quality_status=s.quality_status,
                rms_dbfs=f.rms_dbfs,
                consecutive_high_arousal_windows=(
                    result.smoothed.consecutive_high_arousal_windows
                ),
                speech_seconds_last_30s=round(
                    result.smoothed.speech_seconds_last_30s, 3
                ),
                features={
                    **f.to_dict(),
                    "score": s.to_dict(),
                    "policy_features": result.policy_features,
                },
            )
        )
        decisions.append(
            Decision(
                call_id=call.id,
                window_index=f.window_index,
                timestamp_seconds=f.start_seconds,
                action=result.decision.action.value,
                severity=severity(result.decision.action),
                rules_fired=[
                    h.to_dict() for h in result.decision.fired
                ],
                features=result.policy_features,
                model_version=analysis.model_version,
                policy_version=analysis.policy_version,
            )
        )
    session.add_all(windows)
    session.add_all(decisions)

    call.duration_seconds = round(analysis.duration_seconds, 3)
    call.audio_uri = str(audio_path)
    call.audio_expires_at = store.expires_at(days=settings.audio_retention_days)
    call.ended_at = utcnow()
    call.model_version = analysis.model_version
    call.policy_version = analysis.policy_version
    call.action = analysis.action.value
    call.risk_episodes = [e.to_dict() for e in analysis.episodes]
    call.analysis_summary = analysis.summary()
    call.status = (
        CallStatus.AWAITING_REVIEW.value
        if analysis.action is not Action.CONTINUE
        else CallStatus.COMPLETED.value
    )
    session.flush()

    append(
        session,
        event="call.analysis_completed",
        call_id=call.id,
        model_version=analysis.model_version,
        policy_version=analysis.policy_version,
        payload={
            "action": analysis.action.value,
            "window_count": len(analysis.windows),
            "episode_count": len(analysis.episodes),
            "speech_seconds": round(analysis.speech_seconds, 2),
            "duration_seconds": round(analysis.duration_seconds, 2),
            "state_counts": analysis.summary()["state_counts"],
            "timings_ms": analysis.timings_ms,
            "triggered_by": call.created_by,
            "audio_retention_days": settings.audio_retention_days,
        },
    )

    if analysis.handoff_required:
        _raise_handoff(session, call, analysis)


def _raise_handoff(session: Session, call: Call, analysis: CallAnalysis) -> None:
    existing = session.execute(
        select(Handoff).where(
            Handoff.call_id == call.id,
            Handoff.status == HandoffStatus.OPEN.value,
        )
    ).scalar_one_or_none()
    if existing is not None:
        return

    first = next(
        (w for w in analysis.windows if w.decision.action is Action.HANDOFF_IMMEDIATE),
        analysis.windows[0],
    )
    rules = sorted({h.rule_id for h in first.decision.fired})
    episode = next((e for e in analysis.episodes if e.kind == "distress"), None)
    triggering_decision = session.execute(
        select(Decision)
        .where(
            Decision.call_id == call.id,
            Decision.window_index == first.features.window_index,
        )
        .limit(1)
    ).scalar_one_or_none()

    handoff = Handoff(
        call_id=call.id,
        tenant_id=call.tenant_id,
        decision_id=triggering_decision.id if triggering_decision else None,
        trigger_rule=",".join(rules) or "R1",
        trigger_severity=severity(first.decision.action),
        action=first.decision.action.value,
        kind="distress",
        status=HandoffStatus.OPEN.value,
    )
    session.add(handoff)
    call.script_locked = True
    session.flush()

    append(
        session,
        event="handoff.created",
        call_id=call.id,
        model_version=analysis.model_version,
        policy_version=analysis.policy_version,
        payload={
            "handoff_id": handoff.id,
            "trigger_rule": handoff.trigger_rule,
            "action": handoff.action,
            "window_index": first.features.window_index,
            "trigger_timestamp_seconds": first.features.start_seconds,
            "episode_start_seconds": episode.start_seconds if episode else None,
            "model_version": analysis.model_version,
            "policy_version": analysis.policy_version,
        },
    )
    append(
        session,
        event="script_lock.engaged",
        call_id=call.id,
        model_version=analysis.model_version,
        policy_version=analysis.policy_version,
        payload={
            "handoff_id": handoff.id,
            "reason": "HANDOFF_IMMEDIATE policy action; automated prompts disabled "
            "server-side until an authorized supervisor acts.",
        },
    )


def _mark_failed(job_id: str, message: str) -> None:
    safe = message[:500]
    with session_scope() as session:
        job = session.get(ProcessingJob, job_id)
        if job is None:  # pragma: no cover
            return
        job.status = JobStatus.FAILED.value
        job.error = safe
        job.finished_at = utcnow()
        call = session.get(Call, job.call_id)
        if call is not None:
            call.status = CallStatus.FAILED.value
            call.error_message = safe
            call.action = None
            append(
                session,
                event="call.processing_failed",
                call_id=call.id,
                model_version=None,
                policy_version=call.policy_version,
                payload={
                    "job_id": job.id,
                    "reason": safe,
                    "note": "No vocal-state assessment exists for this audio. "
                    "Absence of a result must not be read as a calm call.",
                },
            )
    _heartbeat_safe()


def _heartbeat_safe() -> None:
    try:
        with session_scope() as session:
            heartbeat(session, {"state": "idle"})
    except Exception:  # pragma: no cover - heartbeat must never break a job
        pass


def audio_expired(call: Call, now: dt.datetime | None = None) -> bool:
    if call.audio_expires_at is None:
        return False
    return call.audio_expires_at <= (now or utcnow())
