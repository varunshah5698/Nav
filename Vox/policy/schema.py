"""Versioned policy schema for VoxSafe.

The policy layer is deliberately independent of the ML layer and of the web
application.  It receives a flat mapping of already-computed, already-smoothed
features and returns an action.  It cannot read audio, call a model, or perform
I/O.
"""

from __future__ import annotations

import datetime as dt
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Action(str, Enum):
    CONTINUE = "CONTINUE"
    REVIEW = "REVIEW"
    HANDOFF_IMMEDIATE = "HANDOFF_IMMEDIATE"


#: Monotonic severity ordering.  Higher values demand more human involvement.
#: This mapping is the single source of truth for the escalate-only guarantee.
SEVERITY: dict[Action, int] = {
    Action.CONTINUE: 0,
    Action.REVIEW: 1,
    Action.HANDOFF_IMMEDIATE: 2,
}


class Operator(str, Enum):
    GTE = "gte"
    LTE = "lte"
    GT = "gt"
    LT = "lt"


#: Explicit allow-list.  A policy file can never reference arbitrary Python or
#: an unvetted feature name.
NUMERIC_FEATURES: frozenset[str] = frozenset(
    {
        "arousal",
        "valence",
        "dominance",
        "arousal_ema",
        "valence_ema",
        "dominance_ema",
        "arousal_std",
        "p_calm",
        "p_engaged",
        "p_frustrated",
        "p_distressed",
        "p_unclear",
        "consecutive_high_arousal_windows",
        "speech_seconds_last_30s",
        "speech_ratio",
        "rms_db",
        "f0_std_semitones",
        "cred_ema",
    }
)

#: Features that are only available when an explicitly approved capability is
#: enabled.  Credibility is disabled by default and is review-only.
GATED_FEATURES: dict[str, str] = {"cred_ema": "credibility"}


class PolicyError(ValueError):
    """Raised when a policy document is structurally invalid or unsafe."""


class Condition(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    feature: str
    op: Operator
    value: float

    @field_validator("feature")
    @classmethod
    def _known_feature(cls, v: str) -> str:
        if v not in NUMERIC_FEATURES:
            raise ValueError(f"unknown feature {v!r}; not in policy allow-list")
        return v


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=1, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    description: str = Field(min_length=1, max_length=280)
    action: Action
    all_of: tuple[Condition, ...] = Field(min_length=1)
    requires_feature: str | None = None
    enabled: bool = True

    @field_validator("requires_feature")
    @classmethod
    def _known_capability(cls, v: str | None) -> str | None:
        if v is not None and v not in GATED_FEATURES.values():
            raise ValueError(f"unknown gated capability {v!r}")
        return v

    @model_validator(mode="after")
    def _credibility_is_never_decisive(self) -> "Rule":
        uses_credibility = any(c.feature in GATED_FEATURES for c in self.all_of)
        if uses_credibility and self.action is Action.HANDOFF_IMMEDIATE:
            raise ValueError(
                f"rule {self.id}: credibility features may never trigger "
                "HANDOFF_IMMEDIATE (review-only capability)"
            )
        return self


class Policy(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    version: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    description: str = Field(min_length=1, max_length=500)
    effective_from: dt.date | None = None
    notes: str | None = None
    rules: tuple[Rule, ...] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_rule_ids(self) -> "Policy":
        ids = [r.id for r in self.rules]
        if len(ids) != len(set(ids)):
            raise ValueError("rule ids must be unique within a policy")
        return self

    def to_yaml(self) -> str:
        return yaml.safe_dump(
            self.model_dump(mode="json", exclude_none=True),
            sort_keys=False,
            default_flow_style=False,
        )


def parse_policy(document: str | bytes | dict[str, Any]) -> Policy:
    """Parse and validate a policy from YAML text or an already-decoded mapping."""
    try:
        if isinstance(document, dict):
            data: Any = document
        else:
            data = yaml.safe_load(document)
    except yaml.YAMLError as exc:  # pragma: no cover - defensive
        raise PolicyError(f"invalid YAML: {exc}") from exc

    if not isinstance(data, dict):
        raise PolicyError("policy document must be a mapping at the top level")
    try:
        return Policy.model_validate(data)
    except ValueError as exc:
        raise PolicyError(str(exc)) from exc


def load_policy(path: str | Path) -> Policy:
    return parse_policy(Path(path).read_text(encoding="utf-8"))


PolicyKind = Literal["draft", "review", "active", "retired"]
