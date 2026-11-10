from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from policy import PolicyError, parse_policy
from policy.evaluator import rule_summary

from ..db.base import get_session
from ..models import Role, User
from ..services.policy_registry import get_active_policy, list_policies
from .deps import get_current_user, require_roles

router = APIRouter(tags=["policies"])


@router.get("/policies")
def read_policies(
    user: User = Depends(require_roles(Role.ADMIN, Role.AUDITOR, Role.SUPERVISOR)),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    records = list_policies(session)
    out = []
    for record in records:
        try:
            policy = parse_policy(record.yaml_body)
            rules = [
                {
                    "id": r.id,
                    "description": r.description,
                    "action": r.action.value,
                    "expression": rule_summary(r),
                    "requires_feature": r.requires_feature,
                    "enabled": r.enabled,
                }
                for r in policy.rules
            ]
            description = policy.description
        except PolicyError:
            rules = []
            description = "policy body is invalid"
        out.append(
            {
                "version": record.version,
                "status": record.status,
                "description": description,
                "rules": rules,
                "drafted_by": record.drafted_by,
                "approved_by": record.approved_by,
                "created_at": record.created_at,
                "activated_at": record.activated_at,
                "retired_at": record.retired_at,
            }
        )
    return {"policies": out}


@router.get("/policies/active")
def read_active_policy(
    # Readable by every authenticated role: an agent must be able to see the
    # rules that flagged their call. Editing/activation remains restricted.
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    try:
        policy = get_active_policy(session)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {
        "version": policy.version,
        "description": policy.description,
        "yaml": policy.to_yaml(),
        "rules": [
            {
                "id": r.id,
                "description": r.description,
                "action": r.action.value,
                "expression": rule_summary(r),
                "requires_feature": r.requires_feature,
                "enabled": r.enabled,
            }
            for r in policy.rules
        ],
    }
