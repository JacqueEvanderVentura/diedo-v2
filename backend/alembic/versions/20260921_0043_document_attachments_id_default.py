"""Align document_attachments.id default with ORM mixin.

Revision ID: 20260921_0043
Revises: 20260921_0042
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260921_0043"
down_revision: str | Sequence[str] | None = "20260921_0042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "document_attachments",
        "id",
        server_default=sa.text("uuidv7()"),
        existing_type=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "document_attachments",
        "id",
        server_default=None,
        existing_type=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
    )
