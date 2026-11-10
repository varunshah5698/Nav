"""Test fixtures for the VoxSafe API.

The database, media root and secret are redirected to throwaway locations
*before* the application modules are imported, because the engine and settings
are module-level singletons.  No test touches the development database.
"""

from __future__ import annotations

import os
import pathlib
import sys
import uuid

import pytest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
VAR_DIR = REPO_ROOT / "backend" / "var"
VAR_DIR.mkdir(parents=True, exist_ok=True)
TEST_DB = VAR_DIR / "test_voxsafe.db"
TEST_MEDIA = VAR_DIR / "test_media"

for suffix in ("", "-wal", "-shm"):
    (VAR_DIR / f"test_voxsafe.db{suffix}").unlink(missing_ok=True)

for entry in (str(REPO_ROOT), str(REPO_ROOT / "backend"), str(REPO_ROOT / "ml")):
    if entry not in sys.path:
        sys.path.insert(0, entry)

os.environ.update(
    {
        "APP_ENV": "test",
        "DATABASE_URL": f"sqlite:///{TEST_DB}",
        "MEDIA_ROOT": str(TEST_MEDIA),
        "SECRET_KEY": "test-only-secret-key-never-used-outside-pytest",
        "CORS_ORIGINS": "http://127.0.0.1:5174",
        "ENABLED_CAPABILITIES": "",
        "BOOTSTRAP_EMAIL": "",
        "BOOTSTRAP_PASSWORD": "",
        "AUDIO_RETENTION_DAYS": "90",
    }
)

TEST_PASSWORD = "test-password-2026"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def make_account(client):
    """Create a user directly in the database and log in through the API."""

    cache: dict[str, dict[str, str]] = {}

    def _make(role: str, tenant: str = "tenant-alpha", label: str = "") -> dict[str, str]:
        key = f"{role}:{tenant}:{label}"
        if key in cache:
            return cache[key]

        from app.core.security import hash_password
        from app.db.base import SessionLocal
        from app.models import User

        email = f"{role}{'-' + label if label else ''}-{uuid.uuid4().hex[:8]}@voxsafe.dev"
        with SessionLocal() as session:
            user = User(
                tenant_id=tenant,
                email=email,
                password_hash=hash_password(TEST_PASSWORD),
                full_name=f"{role.title()} {tenant}",
                role=role,
                is_active=True,
            )
            session.add(user)
            session.commit()
            user_id = user.id

        response = client.post(
            "/v1/auth/login", json={"email": email, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200, response.text
        token = response.json()["access_token"]

        account = {
            "id": user_id,
            "email": email,
            "role": role,
            "tenant": tenant,
            "headers": {"Authorization": f"Bearer {token}"},
        }
        cache[key] = account
        return account

    return _make


@pytest.fixture()
def db():
    from app.db.base import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
