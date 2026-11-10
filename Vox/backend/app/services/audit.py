"""Append-only, hash-chained audit log.

Each event hashes a canonical serialization of its own fields plus the previous
event's hash.  The database forbids UPDATE and DELETE on the table via triggers,
so removal of history requires bypassing the application and the schema; the
chain then makes the tampering evident to :func:`verify_chain`, which recomputes
every hash rather than trusting a stored status flag.

This is tamper-evident, not tamper-proof: an attacker with full database write
access could rewrite the whole chain.  Production deployments additionally ship
the head hash to write-once external storage; see docs/security.md.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import threading
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import AuditEvent, User

GENESIS_HASH = "0" * 64
_append_lock = threading.Lock()

_CHAIN_TRIGGERS = (
    """
    CREATE TRIGGER IF NOT EXISTS audit_events_no_update
    BEFORE UPDATE ON audit_events
    BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
    BEFORE DELETE ON audit_events
    BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
    END
    """,
)


def canonical_payload(payload: dict[str, Any] | None) -> str:
    return json.dumps(
        payload or {},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )


def compute_hash(
    *,
    seq: int,
    occurred_at: dt.datetime,
    actor_id: str | None,
    actor_role: str | None,
    event: str,
    call_id: str | None,
    model_version: str | None,
    policy_version: str | None,
    payload_json: str,
    prev_hash: str,
) -> str:
    material = "|".join(
        [
            str(seq),
            occurred_at.isoformat(timespec="microseconds"),
            actor_id or "",
            actor_role or "",
            event,
            call_id or "",
            model_version or "",
            policy_version or "",
            prev_hash,
            payload_json,
        ]
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def append(
    session: Session,
    *,
    event: str,
    actor: User | None = None,
    payload: dict[str, Any] | None = None,
    call_id: str | None = None,
    model_version: str | None = None,
    policy_version: str | None = None,
    occurred_at: dt.datetime | None = None,
    actor_id: str | None = None,
    actor_role: str | None = None,
) -> AuditEvent:
    """Append one event. Caller owns the surrounding transaction.

    ``seq`` is allocated explicitly so the hash can cover it.  Appends in this
    process are serialized by a lock; a multi-process deployment must use a
    database sequence lock (documented in docs/architecture.md).
    """
    when = occurred_at or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    payload_json = canonical_payload(payload)

    with _append_lock:
        last = session.execute(
            select(AuditEvent.seq, AuditEvent.hash).order_by(AuditEvent.seq.desc()).limit(1)
        ).first()
        seq = (last.seq + 1) if last else 1
        prev_hash = last.hash if last else GENESIS_HASH
        actor_identifier = actor.id if actor else actor_id
        role = actor.role if actor else actor_role

        record = AuditEvent(
            seq=seq,
            occurred_at=when,
            actor_id=actor_identifier,
            actor_role=role,
            event=event,
            call_id=call_id,
            model_version=model_version,
            policy_version=policy_version,
            payload=payload or {},
            prev_hash=prev_hash,
            hash=compute_hash(
                seq=seq,
                occurred_at=when,
                actor_id=actor_identifier,
                actor_role=role,
                event=event,
                call_id=call_id,
                model_version=model_version,
                policy_version=policy_version,
                payload_json=payload_json,
                prev_hash=prev_hash,
            ),
        )
        session.add(record)
        session.flush()
        return record


def install_append_only_triggers(session: Session) -> None:
    bind = session.get_bind()
    if bind is None or bind.dialect.name != "sqlite":
        return
    for statement in _CHAIN_TRIGGERS:
        session.connection().exec_driver_sql(statement)


def verify_chain(
    session: Session, *, limit: int | None = None
) -> dict[str, Any]:
    """Recompute the whole chain and report the first inconsistency."""
    stmt = select(AuditEvent).order_by(AuditEvent.seq.asc())
    if limit:
        stmt = stmt.limit(limit)
    events = list(session.execute(stmt).scalars())

    checked = 0
    expected_prev = GENESIS_HASH
    expected_seq = events[0].seq if events else 1
    for record in events:
        checked += 1
        problems: list[str] = []
        if record.seq != expected_seq:
            problems.append(
                f"sequence gap: expected {expected_seq}, found {record.seq}"
            )
        if record.prev_hash != expected_prev:
            problems.append("previous-hash reference does not match the prior event")
        recomputed = compute_hash(
            seq=record.seq,
            occurred_at=record.occurred_at,
            actor_id=record.actor_id,
            actor_role=record.actor_role,
            event=record.event,
            call_id=record.call_id,
            model_version=record.model_version,
            policy_version=record.policy_version,
            payload_json=canonical_payload(record.payload),
            prev_hash=record.prev_hash,
        )
        if recomputed != record.hash:
            problems.append(
                f"event hash mismatch (stored {record.hash[:16]}..., "
                f"recomputed {recomputed[:16]}...)"
            )
        if problems:
            return {
                "valid": False,
                "events_checked": checked,
                "first_failing_seq": record.seq,
                "errors": problems,
                "head_hash": events[-1].hash if events else GENESIS_HASH,
            }
        expected_prev = record.hash
        expected_seq = record.seq + 1

    return {
        "valid": True,
        "events_checked": checked,
        "first_failing_seq": None,
        "errors": [],
        "head_hash": events[-1].hash if events else GENESIS_HASH,
    }


def chain_length(session: Session) -> int:
    return int(session.execute(select(func.count(AuditEvent.seq))).scalar_one())
