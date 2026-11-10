"""Authorization, tenant isolation and handoff state-machine tests."""

from __future__ import annotations

import pytest


def _make_call(session, owner, *, tenant: str | None = None, with_handoff: bool = True):
    from app.models import Call, Handoff

    call = Call(
        tenant_id=tenant or owner["tenant"],
        created_by=owner["id"],
        source="upload",
        status="awaiting_review",
        original_filename="fixture.wav",
        consent_confirmed=True,
        script_locked=with_handoff,
    )
    session.add(call)
    session.flush()

    handoff = None
    if with_handoff:
        handoff = Handoff(
            call_id=call.id,
            tenant_id=call.tenant_id,
            trigger_rule="R1",
            trigger_severity=2,
            action="HANDOFF_IMMEDIATE",
            status="open",
        )
        session.add(handoff)
    session.commit()
    session.refresh(call)
    if handoff is not None:
        session.refresh(handoff)
    return call, handoff


def test_unauthenticated_requests_are_rejected(client):
    assert client.get("/v1/calls").status_code == 401
    assert client.get("/v1/policies/active").status_code == 401
    assert client.get("/v1/audit").status_code == 401


def test_agent_can_read_the_active_policy_but_not_policy_administration(client, make_account):
    agent = make_account("agent")
    active = client.get("/v1/policies/active", headers=agent["headers"])
    assert active.status_code == 200
    assert {rule["id"] for rule in active.json()["rules"]} >= {"R1", "R2", "R3", "R4"}

    assert client.get("/v1/policies", headers=agent["headers"]).status_code == 403
    assert client.post("/v1/audit/verify", headers=agent["headers"]).status_code == 403


def test_agent_cannot_create_a_call_without_consent(client, make_account):
    agent = make_account("agent")
    response = client.post(
        "/v1/calls",
        headers=agent["headers"],
        json={"original_filename": "call.wav", "consent_confirmed": False},
    )
    assert response.status_code == 422


def test_handoff_acknowledgment_requires_supervisor_role(client, make_account, db):
    agent = make_account("agent")
    auditor = make_account("auditor")
    _, handoff = _make_call(db, agent)

    body = {"resolution": "resumed_human", "notes": "Called the borrower directly."}
    assert (
        client.post(f"/v1/handoffs/{handoff.id}/ack", headers=agent["headers"], json=body).status_code
        == 403
    )
    assert (
        client.post(f"/v1/handoffs/{handoff.id}/ack", headers=auditor["headers"], json=body).status_code
        == 403
    )


def test_acknowledgment_is_human_recorded_idempotent_and_keeps_the_lock(
    client, make_account, db
):
    from app.models import Call, Handoff

    agent = make_account("agent")
    supervisor = make_account("supervisor")
    call, handoff = _make_call(db, agent)

    body = {"resolution": "escalated", "notes": "Borrower asked for a hardship review."}
    first = client.post(f"/v1/handoffs/{handoff.id}/ack", headers=supervisor["headers"], json=body)
    assert first.status_code == 200, first.text
    payload = first.json()
    assert payload["status"] == "acknowledged"
    assert payload["resolution"] == "escalated"
    assert payload["script_locked"] is True

    second = client.post(f"/v1/handoffs/{handoff.id}/ack", headers=supervisor["headers"], json=body)
    assert second.status_code == 409

    db.expire_all()
    stored = db.get(Handoff, handoff.id)
    assert stored.acknowledged_by == supervisor["id"]
    assert stored.acknowledged_at is not None
    assert db.get(Call, call.id).script_locked is True


def test_script_lock_release_requires_acknowledgment_reason_and_supervisor(
    client, make_account, db
):
    from app.models import Call

    agent = make_account("agent")
    supervisor = make_account("supervisor")
    call, handoff = _make_call(db, agent)

    release_url = f"/v1/calls/{call.id}/script-lock/release"

    # A live handoff blocks release.
    blocked = client.post(
        release_url,
        headers=supervisor["headers"],
        json={"reason": "Supervisor confirmed the conversation was closed."},
    )
    assert blocked.status_code == 409

    ack = client.post(
        f"/v1/handoffs/{handoff.id}/ack",
        headers=supervisor["headers"],
        json={"resolution": "closed", "notes": "Handled with the borrower."},
    )
    assert ack.status_code == 200

    # Agents can neither acknowledge nor release.
    assert (
        client.post(release_url, headers=agent["headers"], json={"reason": "agent wants it gone"}).status_code
        == 403
    )

    # A reason is mandatory and documented.
    assert (
        client.post(release_url, headers=supervisor["headers"], json={"reason": "ok"}).status_code
        == 422
    )

    released = client.post(
        release_url,
        headers=supervisor["headers"],
        json={"reason": "Borrower confirmed the call ended and no further prompts should run."},
    )
    assert released.status_code == 200, released.text
    assert released.json()["script_locked"] is False

    db.expire_all()
    assert db.get(Call, call.id).script_locked is False

    audit = client.get(f"/v1/calls/{call.id}/audit", headers=supervisor["headers"]).json()
    assert "script_lock.released" in [event["event"] for event in audit["events"]]


def test_agents_only_see_their_own_calls_and_tenants_are_isolated(client, make_account, db):
    first = make_account("agent", "tenant-alpha", "first")
    second = make_account("agent", "tenant-alpha", "second")
    supervisor = make_account("supervisor", "tenant-alpha")
    outsider = make_account("supervisor", "tenant-beta")

    call, _ = _make_call(db, first)

    assert client.get(f"/v1/calls/{call.id}", headers=first["headers"]).status_code == 200
    assert client.get(f"/v1/calls/{call.id}", headers=second["headers"]).status_code == 404
    assert client.get(f"/v1/calls/{call.id}", headers=supervisor["headers"]).status_code == 200

    for path in ("", "/timeline", "/audio", "/audit"):
        assert (
            client.get(f"/v1/calls/{call.id}{path}", headers=outsider["headers"]).status_code
            == 404
        ), path

    listed = client.get("/v1/calls", headers=second["headers"]).json()
    assert call.id not in {item["id"] for item in listed["calls"]}

    outsider_handoffs = client.get("/v1/handoffs", headers=outsider["headers"]).json()
    assert call.id not in {item["call_id"] for item in outsider_handoffs}


def test_auditor_can_verify_the_chain_but_not_triage(client, make_account, db):
    agent = make_account("agent")
    auditor = make_account("auditor")
    _, handoff = _make_call(db, agent)

    listing = client.get("/v1/handoffs", headers=auditor["headers"])
    assert listing.status_code == 200
    assert any(item["id"] == handoff.id for item in listing.json())

    verification = client.post("/v1/audit/verify", headers=auditor["headers"])
    assert verification.status_code == 200
    body = verification.json()
    assert body["valid"] is True
    assert body["events_checked"] > 0

    assert (
        client.post(
            f"/v1/handoffs/{handoff.id}/ack",
            headers=auditor["headers"],
            json={"resolution": "closed", "notes": "auditor cannot triage"},
        ).status_code
        == 403
    )

