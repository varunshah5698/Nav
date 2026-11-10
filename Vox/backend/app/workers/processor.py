"""Single-process analysis worker.

RQ + Redis is the production target; this worker uses the durable
``processing_jobs`` table so the pipeline runs with no external services while
keeping the same at-least-once semantics.  Job claiming is a conditional UPDATE,
so two workers cannot process the same job twice.
"""

from __future__ import annotations

import logging
import threading

from sqlalchemy import func, select

from ..db.base import session_scope
from ..models import JobStatus, ProcessingJob, ServiceHeartbeat, utcnow
from ..services.analysis import (
    WORKER_NAME,
    claim_next_job,
    heartbeat,
    process_call,
    requeue_stale_jobs,
)

log = logging.getLogger("voxsafe.worker")


class AnalysisWorker(threading.Thread):
    def __init__(self, poll_seconds: float = 0.4) -> None:
        super().__init__(name="voxsafe-analysis-worker", daemon=True)
        self.poll_seconds = poll_seconds
        # NOTE: must not be named ``_stop`` — threading.Thread uses that name
        # internally for its own bookkeeping method.
        self._stopping = threading.Event()

    def stop(self) -> None:
        self._stopping.set()

    def run(self) -> None:  # pragma: no cover - exercised via integration tests
        with session_scope() as session:
            requeued = requeue_stale_jobs(session)
            if requeued:
                log.warning("requeued %s interrupted job(s)", requeued)

        while not self._stopping.is_set():
            job_id = None
            try:
                with session_scope() as session:
                    job = claim_next_job(session)
                    job_id = job.id if job else None
                if job_id:
                    process_call(job_id)
                    continue
                with session_scope() as session:
                    heartbeat(session, {"state": "idle"})
            except Exception:  # pragma: no cover - keep the worker alive
                log.exception("worker loop error")
                try:
                    if job_id:
                        _fail_job(job_id)
                except Exception:
                    log.exception("could not mark job failed")
                self._stopping.wait(2.0)
            self._stopping.wait(self.poll_seconds)


def _fail_job(job_id: str) -> None:
    with session_scope() as session:
        job = session.get(ProcessingJob, job_id)
        if job and job.status == JobStatus.RUNNING.value:
            job.status = JobStatus.FAILED.value
            job.error = "worker crashed while processing this job"
            job.finished_at = utcnow()


def worker_status(session) -> dict:
    record = session.get(ServiceHeartbeat, WORKER_NAME)
    queued = int(
        session.execute(
            select(func.count(ProcessingJob.id)).where(
                ProcessingJob.status == JobStatus.QUEUED.value
            )
        ).scalar_one()
    )
    running = int(
        session.execute(
            select(func.count(ProcessingJob.id)).where(
                ProcessingJob.status == JobStatus.RUNNING.value
            )
        ).scalar_one()
    )
    age = None
    if record is not None:
        age = (utcnow() - record.last_seen_at).total_seconds()
    return {
        "name": WORKER_NAME,
        "last_seen_seconds_ago": round(age, 1) if age is not None else None,
        "healthy": age is not None and age < 10.0,
        "queued_jobs": queued,
        "running_jobs": running,
    }
