"""Make the monorepo's ``policy`` and ``voxml`` packages importable.

The backend is intentionally kept as a thin web layer over the ML and policy
packages rather than duplicating their logic, so those packages live at the
repository root.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


def ensure_paths() -> None:
    for candidate in (REPO_ROOT, REPO_ROOT / "ml"):
        if str(candidate) not in sys.path:
            sys.path.insert(0, str(candidate))


ensure_paths()
