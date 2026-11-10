"""Password hashing, JWT issuance and verification, login throttling."""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import secrets
import threading
import uuid
from dataclasses import dataclass

import bcrypt
import jwt

from .config import get_settings


class AuthError(Exception):
    """Authentication or authorization failure."""


def hash_password(password: str) -> str:
    if len(password) < 10:
        raise ValueError("password must be at least 10 characters")
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def create_access_token(
    *, user_id: str, role: str, tenant_id: str, session_id: str
) -> tuple[str, int]:
    settings = get_settings()
    issued = _now()
    expires = issued + dt.timedelta(minutes=settings.access_token_ttl_minutes)
    payload = {
        "sub": user_id,
        "role": role,
        "tenant": tenant_id,
        "sid": session_id,
        "typ": "access",
        "iat": int(issued.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.resolve_secret_key(), algorithm="HS256")
    return token, int((expires - issued).total_seconds())


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.resolve_secret_key(),
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "typ"]},
        )
    except jwt.PyJWTError as exc:
        raise AuthError("invalid or expired session") from exc
    if payload.get("typ") != "access":
        raise AuthError("invalid session type")
    return payload


def new_refresh_token() -> tuple[str, str]:
    """Return (plaintext, sha256 digest). Only the digest is persisted."""
    raw = secrets.token_urlsafe(48)
    return raw, hashlib.sha256(raw.encode("utf-8")).hexdigest()


def digest_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


@dataclass(slots=True)
class _Bucket:
    count: int
    reset_at: float


class LoginThrottle:
    """In-process sliding-window limiter for authentication attempts.

    Single-process only; a multi-worker deployment must move this to Redis.
    Keyed by client address *and* submitted email so one noisy origin cannot
    lock every account, and one account cannot be attacked from many origins
    without limit.
    """

    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self._max = max_attempts
        self._window = window_seconds
        self._buckets: dict[str, _Bucket] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _key(ip: str, email: str) -> str:
        return f"{ip}|{email.strip().lower()}"

    def _now(self) -> float:
        return dt.datetime.now(dt.timezone.utc).timestamp()

    def check(self, ip: str, email: str) -> int | None:
        """Return remaining seconds of lockout, or None when allowed."""
        key = self._key(ip, email)
        now = self._now()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None:
                return None
            if bucket.reset_at <= now:
                self._buckets.pop(key, None)
                return None
            if bucket.count >= self._max:
                return max(1, int(bucket.reset_at - now))
            return None

    def record_failure(self, ip: str, email: str) -> None:
        key = self._key(ip, email)
        now = self._now()
        with self._lock:
            bucket = self._buckets.get(key)
            if bucket is None or bucket.reset_at <= now:
                self._buckets[key] = _Bucket(1, now + self._window)
            else:
                bucket.count += 1

    def reset(self, ip: str, email: str) -> None:
        with self._lock:
            self._buckets.pop(self._key(ip, email), None)

    def clear(self) -> None:
        with self._lock:
            self._buckets.clear()


_login_throttle: LoginThrottle | None = None


def get_login_throttle() -> LoginThrottle:
    global _login_throttle
    if _login_throttle is None:
        settings = get_settings()
        _login_throttle = LoginThrottle(
            settings.login_max_attempts, settings.login_window_seconds
        )
    return _login_throttle
