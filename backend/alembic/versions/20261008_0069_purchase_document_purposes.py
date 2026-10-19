"""Purchase request invoice and payment attachment purposes.

Revision ID: 20261008_0069
Revises: 20261008_0068
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261008_0069"
down_revision: str | Sequence[str] | None = "20261008_0068"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_document_attachments_purpose_values"),
        "document_attachments",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_document_attachments_purpose_values"),
        "document_attachments",
        "purpose IN ('quote', 'invoice', 'payment', 'receipt')",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_document_attachments_purpose_values"),
        "document_attachments",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_document_attachments_purpose_values"),
        "document_attachments",
        "purpose IN ('quote', 'receipt')",
    )
