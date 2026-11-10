"""Object storage for call audio.

Development uses a local directory behind the same narrow interface a
presigned-S3 implementation would expose, so swapping backends does not touch
route or worker code.  Files are stored under opaque call identifiers, never
under caller-supplied names.
"""

from __future__ import annotations

import datetime as dt
import re
import uuid
from pathlib import Path

from fastapi import UploadFile

from ..core.config import get_settings

SAFE_SUFFIX = re.compile(r"^\.(wav|mp3|opus|ogg|m4a|webm)$")


class StorageError(ValueError):
    pass


class MediaStore:
    def __init__(self, root: Path | None = None) -> None:
        settings = get_settings()
        self.root = Path(root or settings.media_root)
        self.uploads = self.root / "uploads"
        self.audio = self.root / "audio"
        for directory in (self.uploads, self.audio):
            directory.mkdir(parents=True, exist_ok=True)

    def new_upload_path(self, filename: str) -> Path:
        suffix = Path(filename).suffix.lower()
        if not SAFE_SUFFIX.match(suffix):
            raise StorageError(
                "unsupported file type; upload WAV, MP3 or Opus audio"
            )
        return self.uploads / f"{uuid.uuid4().hex}{suffix}"

    async def save_upload(self, upload: UploadFile, *, max_bytes: int) -> tuple[Path, int]:
        target = self.new_upload_path(upload.filename or "recording")
        size = 0
        try:
            with target.open("wb") as fh:
                while chunk := await upload.read(1024 * 256):
                    size += len(chunk)
                    if size > max_bytes:
                        raise StorageError(
                            f"file exceeds the {max_bytes // (1024 * 1024)} MB limit"
                        )
                    fh.write(chunk)
        except Exception:
            target.unlink(missing_ok=True)
            raise
        if size == 0:
            target.unlink(missing_ok=True)
            raise StorageError("uploaded file is empty")
        return target, size

    def normalized_path(self, call_id: str) -> Path:
        return self.audio / f"{call_id}.wav"

    def discard(self, path: Path | None) -> None:
        if path is None:
            return
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            pass

    def expires_at(self, *, days: int) -> dt.datetime:
        return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(
            days=days
        )


_store: MediaStore | None = None


def get_store() -> MediaStore:
    global _store
    if _store is None:
        _store = MediaStore()
    return _store
