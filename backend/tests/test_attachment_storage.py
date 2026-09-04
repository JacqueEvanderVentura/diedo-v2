from io import BytesIO
from pathlib import Path
from typing import BinaryIO

import pytest
from app.services.attachment_storage import (
    AttachmentContentMismatchError,
    AttachmentTooLargeError,
    LocalAttachmentStorage,
    S3AttachmentStorage,
)


class FakeS3Client:
    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.extra_args: dict[str, object] | None = None

    def upload_fileobj(
        self,
        source: BinaryIO,
        bucket: str,
        key: str,
        *,
        ExtraArgs: dict[str, object],
    ) -> None:
        self.objects[(bucket, key)] = source.read()
        self.extra_args = ExtraArgs

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, BytesIO]:
        return {"Body": BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, *, Bucket: str, Key: str) -> None:
        self.objects.pop((Bucket, Key), None)


def _storage(client: FakeS3Client) -> S3AttachmentStorage:
    return S3AttachmentStorage(
        bucket="uploads",
        endpoint_url="https://storage.example.invalid",
        region="us-east-1",
        client=client,
    )


def test_s3_storage_uploads_streams_and_deletes_private_objects() -> None:
    client = FakeS3Client()
    storage = _storage(client)
    content = b"%PDF-1.4\nprivate attachment\n%%EOF"

    blob = storage.save(
        BytesIO(content),
        storage_key="workspace/customer/document.pdf",
        content_type="application/pdf",
        max_bytes=1024,
    )

    assert blob.size_bytes == len(content)
    assert client.objects[("uploads", blob.storage_key)] == content
    assert client.extra_args == {
        "ContentType": "application/pdf",
        "Metadata": {"checksum-sha256": blob.checksum_sha256},
    }
    with storage.open(blob.storage_key) as downloaded:
        assert downloaded.read() == content
    storage.delete(blob.storage_key)
    assert client.objects == {}


def test_s3_storage_rejects_invalid_content_size_and_keys() -> None:
    client = FakeS3Client()
    storage = _storage(client)

    with pytest.raises(AttachmentTooLargeError):
        storage.save(
            BytesIO(b"%PDF-1.4"),
            storage_key="workspace/large.pdf",
            content_type="application/pdf",
            max_bytes=4,
        )
    with pytest.raises(AttachmentContentMismatchError):
        storage.save(
            BytesIO(b"not a pdf"),
            storage_key="workspace/fake.pdf",
            content_type="application/pdf",
            max_bytes=1024,
        )
    with pytest.raises(ValueError, match="Invalid attachment storage key"):
        storage.open("../outside.pdf")
    assert client.objects == {}


def test_s3_storage_builds_a_bounded_client(monkeypatch: pytest.MonkeyPatch) -> None:
    client = FakeS3Client()
    captured: dict[str, object] = {}

    def fake_client(service: str, **kwargs: object) -> FakeS3Client:
        captured.update({"service": service, **kwargs})
        return client

    monkeypatch.setattr("app.services.attachment_storage.boto3.client", fake_client)
    storage = S3AttachmentStorage(
        bucket="uploads",
        endpoint_url="https://storage.example.invalid",
        region="us-east-1",
    )

    assert captured["service"] == "s3"
    assert captured["endpoint_url"] == "https://storage.example.invalid"
    assert storage.open.__self__ is storage


def test_local_storage_open_uses_the_confined_path(tmp_path: Path) -> None:
    storage = LocalAttachmentStorage(tmp_path)
    content = b"\x89PNG\r\n\x1a\ncontent"
    storage.save(
        BytesIO(content),
        storage_key="workspace/image.png",
        content_type="image/png",
        max_bytes=1024,
    )

    with storage.open("workspace/image.png") as downloaded:
        assert downloaded.read() == content
