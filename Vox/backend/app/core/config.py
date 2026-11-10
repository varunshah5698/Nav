from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .paths import REPO_ROOT


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(REPO_ROOT / ".env"), str(REPO_ROOT / "backend" / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "VoxSafe"
    app_env: str = "development"
    api_prefix: str = "/v1"

    # Secrets -----------------------------------------------------------------
    secret_key: str | None = None
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 7

    # Data --------------------------------------------------------------------
    database_url: str = f"sqlite:///{REPO_ROOT / 'backend' / 'var' / 'voxsafe.db'}"
    media_root: Path = REPO_ROOT / "backend" / "var" / "media"

    # Intake ------------------------------------------------------------------
    max_upload_mb: int = 50
    audio_retention_days: int = 90

    # Policy ------------------------------------------------------------------
    policy_path: Path = REPO_ROOT / "policy" / "policies" / "v1.yaml"
    enabled_capabilities: str = ""

    # Auth rate limiting ------------------------------------------------------
    login_max_attempts: int = 5
    login_window_seconds: int = 900

    # CORS --------------------------------------------------------------------
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Bootstrap ---------------------------------------------------------------
    bootstrap_email: str | None = None
    bootstrap_password: str | None = None
    bootstrap_name: str = "VoxSafe Agent"

    @field_validator("media_root", "policy_path", mode="before")
    @classmethod
    def _expand(cls, value):
        return Path(str(value)).expanduser()

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def capabilities(self) -> frozenset[str]:
        return frozenset(
            c.strip() for c in self.enabled_capabilities.split(",") if c.strip()
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def resolve_secret_key(self) -> str:
        if self.secret_key:
            return self.secret_key
        if self.is_production:
            raise RuntimeError(
                "SECRET_KEY must be set in production; refusing to start with a "
                "development key"
            )
        path = REPO_ROOT / "backend" / "var" / "dev_secret.key"
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            return path.read_text(encoding="utf-8").strip()
        value = secrets.token_urlsafe(48)
        path.write_text(value, encoding="utf-8")
        path.chmod(0o600)
        return value

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
