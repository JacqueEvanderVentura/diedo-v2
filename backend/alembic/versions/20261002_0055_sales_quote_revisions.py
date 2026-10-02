"""Quote revision snapshots for CRM history.

Revision ID: 20261002_0055
Revises: 20261002_0054
Create Date: 2026-10-02

"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import uuid7

import sqlalchemy as sa
from alembic import op
from sqlalchemy import select

from app.db.models.sales import SalesQuote, SalesQuoteLine, SalesQuoteRevision

revision: str = "20261002_0055"
down_revision: str | Sequence[str] | None = "20261002_0054"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sales_quote_revisions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("quote_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("event", sa.String(length=16), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("actor_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("snapshot", sa.dialects.postgresql.JSONB(), nullable=False),
        sa.CheckConstraint("revision >= 1", name="revision_positive"),
        sa.CheckConstraint(
            "event IN ('created', 'updated', 'invoiced', 'cancelled')",
            name="event_values",
        ),
        sa.CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="snapshot_object"),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_sales_quote_revisions_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "quote_id"],
            ["sales_quotes.workspace_id", "sales_quotes.id"],
            name="fk_sales_quote_revisions_workspace_quote",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_platform_user_id"],
            ["platform_users.id"],
            name=op.f(
                "fk_sales_quote_revisions_actor_platform_user_id_platform_users"
            ),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sales_quote_revisions")),
        sa.UniqueConstraint(
            "workspace_id",
            "quote_id",
            "revision",
            name="uq_sales_quote_revisions_quote_revision",
        ),
    )
    op.create_index(
        "ix_sales_quote_revisions_workspace_quote_occurred",
        "sales_quote_revisions",
        ["workspace_id", "quote_id", "occurred_at"],
        unique=False,
    )

    bind = op.get_bind()
    session = sa.orm.Session(bind=bind)
    try:
        quotes = session.scalars(select(SalesQuote)).all()
        for quote in quotes:
            lines = session.scalars(
                select(SalesQuoteLine)
                .where(
                    SalesQuoteLine.workspace_id == quote.workspace_id,
                    SalesQuoteLine.quote_id == quote.id,
                )
                .order_by(SalesQuoteLine.position)
            ).all()
            snapshot = {
                "number": quote.document_number,
                "crmStatus": quote.crm_status,
                "structuralStatus": quote.status,
                "customerName": quote.customer_name,
                "notes": quote.notes,
                "subtotal": str(quote.subtotal),
                "discountAmount": str(quote.discount_amount),
                "taxAmount": str(quote.tax_amount),
                "total": str(quote.total),
                "dueAt": quote.expires_at.isoformat() if quote.expires_at else None,
                "invoiceNumber": None,
                "lines": [
                    {
                        "name": line.item_name,
                        "qty": str(line.quantity),
                        "unitPrice": str(line.unit_price),
                        "lineTotal": str(line.line_total),
                    }
                    for line in lines
                ],
            }
            event = "created"
            if quote.status == "cancelled":
                event = "cancelled"
            elif quote.status == "converted":
                event = "invoiced"
            occurred = quote.created_at
            if event in {"cancelled", "invoiced"} and quote.closed_at is not None:
                occurred = quote.closed_at
            session.add(
                SalesQuoteRevision(
                    id=uuid7(),
                    workspace_id=quote.workspace_id,
                    quote_id=quote.id,
                    revision=1,
                    event=event,
                    occurred_at=occurred or datetime.now(UTC),
                    actor_platform_user_id=quote.created_by_platform_user_id,
                    snapshot=snapshot,
                )
            )
        session.commit()
    finally:
        session.close()


def downgrade() -> None:
    op.drop_index(
        "ix_sales_quote_revisions_workspace_quote_occurred",
        table_name="sales_quote_revisions",
    )
    op.drop_table("sales_quote_revisions")
