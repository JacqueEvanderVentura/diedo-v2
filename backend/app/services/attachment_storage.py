from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from tempfile import SpooledTemporaryFile
from typing import Any, BinaryIO, Protocol, cast

import boto3
from botocore.config import Config


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

    def open(self, storage_key: str) -> BinaryIO: ...

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
        safe_key = _validate_storage_key(storage_key)
        candidate = (self._root.joinpath(*safe_key.parts)).resolve()
        if candidate == self._root or self._root not in candidate.parents:
            raise ValueError("Invalid attachment storage key.")
        return candidate

    def open(self, storage_key: str) -> BinaryIO:
        return self.path_for(storage_key).open("rb")

    def delete(self, storage_key: str) -> None:
        self.path_for(storage_key).unlink(missing_ok=True)


class S3AttachmentStorage:
    def __init__(
        self,
        *,
        bucket: str,
        endpoint_url: str,
        region: str,
        connect_timeout_seconds: int = 5,
        read_timeout_seconds: int = 30,
        client: Any | None = None,
    ) -> None:
        self._bucket = bucket
        self._client = client or boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            config=Config(
                retries={"total_max_attempts": 3, "mode": "standard"},
                connect_timeout=connect_timeout_seconds,
                read_timeout=read_timeout_seconds,
                max_pool_connections=20,
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )

    def save(
        self,
        source: BinaryIO,
        *,
        storage_key: str,
        content_type: str,
        max_bytes: int,
    ) -> StoredBlob:
        key = str(_validate_storage_key(storage_key))
        digest = hashlib.sha256()
        total = 0
        first_bytes = b""
        with SpooledTemporaryFile(max_size=1024 * 1024, mode="w+b") as temporary:
            while chunk := source.read(64 * 1024):
                if not first_bytes:
                    first_bytes = chunk[:16]
                total += len(chunk)
                if total > max_bytes:
                    raise AttachmentTooLargeError
                digest.update(chunk)
                temporary.write(chunk)
            if total == 0 or _detected_content_type(first_bytes) != content_type:
                raise AttachmentContentMismatchError
            checksum = digest.hexdigest()
            temporary.seek(0)
            self._client.upload_fileobj(
                temporary,
                self._bucket,
                key,
                ExtraArgs={
                    "ContentType": content_type,
                    "Metadata": {"checksum-sha256": checksum},
                },
            )
        return StoredBlob(key, total, checksum)

    def open(self, storage_key: str) -> BinaryIO:
        key = str(_validate_storage_key(storage_key))
        response = self._client.get_object(Bucket=self._bucket, Key=key)
        return cast(BinaryIO, response["Body"])

    def delete(self, storage_key: str) -> None:
        key = str(_validate_storage_key(storage_key))
        self._client.delete_object(Bucket=self._bucket, Key=key)


def _validate_storage_key(storage_key: str) -> PurePosixPath:
    if not storage_key or "\\" in storage_key:
        raise ValueError("Invalid attachment storage key.")
    candidate = PurePosixPath(storage_key)
    if candidate.is_absolute() or any(part in {"", ".", ".."} for part in candidate.parts):
        raise ValueError("Invalid attachment storage key.")
    return candidate


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
