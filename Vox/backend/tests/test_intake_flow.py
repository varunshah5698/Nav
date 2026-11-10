"""End-to-end intake: real audio in, persisted decisions and handoff out."""

from __future__ import annotations

import pathlib
import time

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
AGITATED = REPO_ROOT / "fixtures" / "audio" / "synthetic_agitated_turn.wav"
CALM = REPO_ROOT / "fixtures" / "audio" / "synthetic_calm_turn.wav"
SILENCE = REPO_ROOT / "fixtures" / "audio" / "synthetic_silence.wav"


def _submit(client, headers, path: pathlib.Path) -> str:
    created = client.post(
        "/v1/calls",
        headers=headers,
        json={
            "original_filename": path.name,
            "consent_confirmed": True,
            "consent_reference": "PYTEST-SYNTHETIC-FIXTURE",
        },
    )
    assert created.status_code == 201, created.text
    call_id = created.json()["id"]

    with path.open("rb") as handle:
        upload = client.post(
            f"/v1/calls/{call_id}/audio",
            headers=headers,
            files={"file": (path.name, handle, "audio/wav")},
        )
    assert upload.status_code == 200, upload.text
    return call_id


def _wait_for_analysis(client, headers, call_id: str, timeout: float = 90.0) -> dict:
    deadline = time.time() + timeout
    last: dict | None = None
    while time.time() < deadline:
        response = client.get(f"/v1/calls/{call_id}/timeline", headers=headers)
        assert response.status_code == 200, response.text
        last = response.json()
        status = last["call"]["status"]
        if status in {"awaiting_review", "completed", "failed"}:
            if status == "failed":
                pytest.fail(f"analysis failed: {last['call'].get('error_message')}")
            return last
        time.sleep(0.5)
    pytest.fail(f"analysis did not finish in {timeout}s; last status={last and last['call']['status']}")


def test_recording_to_handoff_to_acknowledgment(client, make_account):
    agent = make_account("agent", "tenant-alpha", "intake")
    supervisor = make_account("supervisor", "tenant-alpha")
    auditor = make_account("auditor", "tenant-alpha")

    call_id = _submit(client, agent["headers"], AGITATED)
    timeline = _wait_for_analysis(client, agent["headers"], call_id)

    assert timeline["call"]["action"] == "HANDOFF_IMMEDIATE"
    assert timeline["call"]["script_locked"] is True
    assert len(timeline["windows"]) >= 10
    assert timeline["handoff"] is not None
    assert timeline["handoff"]["status"] == "open"
    assert "R1" in timeline["handoff"]["trigger_rule"]
    assert timeline["episodes"], "a flagged moment must be persisted"
    assert timeline["model"]["version"] == "baseline-acoustic-v1"
    assert timeline["policy"]["version"]

    # The agent who uploaded the recording cannot acknowledge their own alert.
    ack_body = {"resolution": "resumed_human", "notes": "Taking over the call."}
    assert (
        client.post(
            f"/v1/handoffs/{timeline['handoff']['id']}/ack",
            headers=agent["headers"],
            json=ack_body,
        ).status_code
        == 403
    )

    ack = client.post(
        f"/v1/handoffs/{timeline['handoff']['id']}/ack",
        headers=supervisor["headers"],
        json=ack_body,
    )
    assert ack.status_code == 200, ack.text
    assert ack.json()["script_locked"] is True

    after = client.get(f"/v1/calls/{call_id}/timeline", headers=supervisor["headers"]).json()
    assert after["call"]["script_locked"] is True
    assert after["handoff"]["status"] == "acknowledged"

    audit = client.get(f"/v1/calls/{call_id}/audit", headers=auditor["headers"]).json()
    events = [event["event"] for event in audit["events"]]
    for expected in (
        "call.created",
        "call.audio_uploaded",
        "call.analysis_completed",
        "handoff.created",
        "script_lock.engaged",
        "handoff.acknowledged",
    ):
        assert expected in events, expected

    verification = client.post("/v1/audit/verify", headers=auditor["headers"])
    assert verification.status_code == 200
    assert verification.json()["valid"] is True


def test_silence_is_reviewed_not_treated_as_calm(client, make_account):
    agent = make_account("agent", "tenant-alpha", "silence")
    call_id = _submit(client, agent["headers"], SILENCE)
    timeline = _wait_for_analysis(client, agent["headers"], call_id)

    assert timeline["call"]["action"] == "REVIEW"
    assert timeline["call"]["script_locked"] is False
    assert timeline["handoff"] is None
    states = {window["state"] for window in timeline["windows"]}
    assert "unclear" in states
    assert "calm" not in states


def test_private_audio_is_served_only_to_authorized_users_and_is_audited(
    client, make_account
):
    agent = make_account("agent", "tenant-alpha", "audio")
    outsider = make_account("supervisor", "tenant-beta")

    call_id = _submit(client, agent["headers"], CALM)
    _wait_for_analysis(client, agent["headers"], call_id)

    audio = client.get(f"/v1/calls/{call_id}/audio", headers=agent["headers"])
    assert audio.status_code == 200
    assert audio.headers["content-type"].startswith("audio/")
    assert "no-store" in audio.headers.get("cache-control", "")

    assert (
        client.get(f"/v1/calls/{call_id}/audio", headers=outsider["headers"]).status_code
        == 404
    )

    audit = client.get(f"/v1/calls/{call_id}/audit", headers=agent["headers"]).json()
    assert "audio.accessed" in [event["event"] for event in audit["events"]]
