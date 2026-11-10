from __future__ import annotations

import datetime as dt
from typing import Any

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    checked_at: dt.datetime
    version: str
    checks: dict[str, Any]
    degraded: list[str]
