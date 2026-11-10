"""Loading and validating the active decision policy."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from policy import Policy, PolicyError, load_policy, parse_policy

from ..core.config import get_settings
from ..models import PolicyStatus, PolicyVersion, utcnow


class PolicyUnavailable(RuntimeError):
    """No valid active policy exists; analysis must not proceed."""


def seed_baseline_policy(session: Session) -> PolicyVersion:
    """Install the packaged baseline policy once, as the active version.

    Changes to this policy after v1 must pass the two-person approval workflow;
    the packaged baseline is the system's initial configuration, recorded with
    no human drafter and an explicit activation timestamp.
    """
    settings = get_settings()
    policy = load_policy(settings.policy_path)
    existing = session.get(PolicyVersion, policy.version)
    if existing:
        return existing

    record = PolicyVersion(
        version=policy.version,
        yaml_body=policy.to_yaml(),
        status=PolicyStatus.ACTIVE.value,
        notes="Packaged baseline policy (build-guide default rules R1-R5).",
        activated_at=utcnow(),
    )
    session.add(record)
    session.flush()
    return record


def get_active_policy(session: Session) -> Policy:
    record = session.execute(
        select(PolicyVersion)
        .where(PolicyVersion.status == PolicyStatus.ACTIVE.value)
        .order_by(PolicyVersion.activated_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if record is None:
        raise PolicyUnavailable("no active policy version is configured")
    try:
        return parse_policy(record.yaml_body)
    except PolicyError as exc:  # pragma: no cover - guarded on write
        raise PolicyUnavailable(f"active policy {record.version} is invalid: {exc}")


def list_policies(session: Session) -> list[PolicyVersion]:
    return list(
        session.execute(
            select(PolicyVersion).order_by(PolicyVersion.created_at.desc())
        ).scalars()
    )
