"""Hash-chain and append-only guarantees for the audit log."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base
from app.services.audit import (
    GENESIS_HASH,
    append,
    chain_length,
    install_append_only_triggers,
    verify_chain,
)


@pytest.fixture()
def sessions(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'audit.db'}", future=True)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False, future=True)
    first = factory()
    install_append_only_triggers(first)
    first.commit()

    created = [first]

    def new_session():
        session = factory()
        created.append(session)
        return session

    yield new_session()
    for session in created:
        session.close()
    engine.dispose()


def test_append_links_each_event_to_the_previous_hash(sessions):
    first = append(sessions, event="call.created", actor_id="u1", actor_role="agent", payload={"a": 1})
    second = append(sessions, event="call.audio_uploaded", actor_id="u1", actor_role="agent", payload={"b": 2})
    sessions.commit()

    assert first.prev_hash == GENESIS_HASH
    assert second.prev_hash == first.hash
    assert first.hash != second.hash

    result = verify_chain(sessions)
    assert result["valid"] is True
    assert result["events_checked"] == 2
    assert result["first_failing_seq"] is None
    assert result["head_hash"] == second.hash
    assert chain_length(sessions) == 2


def test_database_rejects_update_and_delete(sessions):
    append(sessions, event="call.created", actor_role="system", payload={})
    sessions.commit()

    with pytest.raises(Exception) as update_error:
        sessions.execute(text("UPDATE audit_events SET event = 'rewritten'"))
        sessions.commit()
    assert "append-only" in str(update_error.value)
    sessions.rollback()

    with pytest.raises(Exception) as delete_error:
        sessions.execute(text("DELETE FROM audit_events"))
        sessions.commit()
    assert "append-only" in str(delete_error.value)
    sessions.rollback()

    assert chain_length(sessions) == 1
    assert verify_chain(sessions)["valid"] is True


def test_payload_tampering_is_detected(sessions):
    append(sessions, event="call.created", actor_role="system", payload={"action": "CONTINUE"})
    append(sessions, event="handoff.created", actor_role="system", payload={"action": "HANDOFF_IMMEDIATE"})
    sessions.commit()

    assert verify_chain(sessions)["valid"] is True

    # An attacker with write access can drop the guard; the chain must still
    # make the rewrite evident because every hash is recomputed.
    sessions.execute(text("DROP TRIGGER audit_events_no_update"))
    sessions.execute(
        text("UPDATE audit_events SET payload = '{\"action\":\"CONTINUE\"}' WHERE seq = 2")
    )
    sessions.commit()

    result = verify_chain(sessions)
    assert result["valid"] is False
    assert result["first_failing_seq"] == 2
    assert any("event hash mismatch" in error for error in result["errors"])


def test_removed_event_is_detected_as_a_sequence_gap(sessions):
    append(sessions, event="e1", actor_role="system", payload={})
    append(sessions, event="e2", actor_role="system", payload={})
    append(sessions, event="e3", actor_role="system", payload={})
    sessions.commit()

    sessions.execute(text("DROP TRIGGER audit_events_no_delete"))
    sessions.execute(text("DELETE FROM audit_events WHERE seq = 2"))
    sessions.commit()

    result = verify_chain(sessions)
    assert result["valid"] is False
    assert result["first_failing_seq"] == 3
    assert result["events_checked"] == 2
    assert any("sequence gap" in error for error in result["errors"])
