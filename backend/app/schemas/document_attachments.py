from __future__ import annotations

from datetime import datetime
from uuid import UUID

from app.schemas.common import ApiModel


class DocumentAttachmentResponse(ApiModel):
    id: UUID
    original_filename: str
    content_type: str
    size_bytes: int
    checksum_sha256: str
    preview_url: str
    created_at: datetime
