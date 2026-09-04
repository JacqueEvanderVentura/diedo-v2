from collections.abc import Iterator
from typing import BinaryIO
from urllib.parse import quote

from fastapi.responses import StreamingResponse

from app.services.attachment_storage import AttachmentStorage


def _read_chunks(source: BinaryIO) -> Iterator[bytes]:
    try:
        while chunk := source.read(64 * 1024):
            yield chunk
    finally:
        source.close()


def authorized_attachment_response(
    storage: AttachmentStorage,
    *,
    storage_key: str,
    content_type: str,
    filename: str,
    size_bytes: int,
    headers: dict[str, str] | None = None,
) -> StreamingResponse:
    response_headers = {
        "Cache-Control": "private, no-store",
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename, safe='')}",
        "Content-Length": str(size_bytes),
        **(headers or {}),
    }
    return StreamingResponse(
        _read_chunks(storage.open(storage_key)),
        media_type=content_type,
        headers=response_headers,
    )
