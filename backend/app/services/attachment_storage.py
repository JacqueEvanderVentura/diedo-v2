from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Protocol


class AttachmentTooLargeError(Exception):
    pass


class AttachmentContentMismatchError(Exception):
    pass


@dataclass(frozen=True)
class StoredBlob:
    storage_key: str
    size_bytes: int
    checksum_sha256: str


class AttachmentStorage(Protocol):
    def save(
        self,
        source: BinaryIO,
        *,
        storage_key: str,
        content_type: str,
        max_bytes: int,
    ) -> StoredBlob: ...

    def path_for(self, storage_key: str) -> Path: ...

    def delete(self, storage_key: str) -> None: ...


class LocalAttachmentStorage:
    def __init__(self, root: Path) -> None:
        self._root = root.resolve()

    def save(
        self,
        source: BinaryIO,
        *,
        storage_key: str,
        content_type: str,
        max_bytes: int,
    ) -> StoredBlob:
        destination = self.path_for(storage_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".part")
        digest = hashlib.sha256()
        total = 0
        first_bytes = b""
        try:
            with temporary.open("xb") as target:
                while chunk := source.read(64 * 1024):
                    if not first_bytes:
                        first_bytes = chunk[:16]
                    total += len(chunk)
                    if total > max_bytes:
                        raise AttachmentTooLargeError
                    digest.update(chunk)
                    target.write(chunk)
            if total == 0:
                raise AttachmentContentMismatchError
            if _detected_content_type(first_bytes) != content_type:
                raise AttachmentContentMismatchError
            temporary.replace(destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        return StoredBlob(storage_key, total, digest.hexdigest())

    def path_for(self, storage_key: str) -> Path:
        candidate = (self._root / storage_key).resolve()
        if candidate == self._root or self._root not in candidate.parents:
            raise ValueError("Invalid attachment storage key.")
        return candidate

    def delete(self, storage_key: str) -> None:
        self.path_for(storage_key).unlink(missing_ok=True)


def _detected_content_type(value: bytes) -> str | None:
    if value.startswith(b"%PDF-"):
        return "application/pdf"
    if value.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if value.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(value) >= 12 and value.startswith(b"RIFF") and value[8:12] == b"WEBP":
        return "image/webp"
    return None
