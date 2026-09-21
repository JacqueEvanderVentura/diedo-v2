"""Workspace document attachments for finance, POS, and purchasing."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import UuidPrimaryKeyMixin


class DocumentAttachment(UuidPrimaryKeyMixin, Base):
    __tablename__ = "document_attachments"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_document_attachments_workspace_id"),
        UniqueConstraint("workspace_id", "storage_key", name="uq_document_attachments_storage_key"),
        ForeignKeyConstraint(
            ["workspace_id", "finance_expense_id"],
            ["finance_expenses.workspace_id", "finance_expenses.id"],
            ondelete="CASCADE",
            name="fk_document_attachments_workspace_finance_expense",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "finance_fixed_expense_id"],
            ["finance_fixed_expenses.workspace_id", "finance_fixed_expenses.id"],
            ondelete="CASCADE",
            name="fk_document_attachments_workspace_finance_fixed",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "finance_manual_income_id"],
            ["finance_manual_incomes.workspace_id", "finance_manual_incomes.id"],
            ondelete="CASCADE",
            name="fk_document_attachments_workspace_finance_income",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "cash_movement_id"],
            ["cash_movements.workspace_id", "cash_movements.id"],
            ondelete="CASCADE",
            name="fk_document_attachments_workspace_cash_movement",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "purchase_request_id"],
            ["purchase_requests.workspace_id", "purchase_requests.id"],
            ondelete="CASCADE",
            name="fk_document_attachments_workspace_purchase_request",
        ),
        CheckConstraint(
            "num_nonnulls(finance_expense_id, finance_fixed_expense_id, "
            "finance_manual_income_id, cash_movement_id, purchase_request_id) = 1",
            name="single_owner",
        ),
        CheckConstraint("size_bytes > 0 AND size_bytes <= 10485760", name="size_range"),
        CheckConstraint("char_length(checksum_sha256) = 64", name="checksum_length"),
        CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif', "
            "'application/pdf')",
            name="content_type_values",
        ),
        Index("ix_document_attachments_finance_expense", "workspace_id", "finance_expense_id"),
        Index("ix_document_attachments_finance_fixed", "workspace_id", "finance_fixed_expense_id"),
        Index("ix_document_attachments_finance_income", "workspace_id", "finance_manual_income_id"),
        Index("ix_document_attachments_cash_movement", "workspace_id", "cash_movement_id"),
        Index("ix_document_attachments_purchase_request", "workspace_id", "purchase_request_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    finance_expense_id: Mapped[UUID | None] = mapped_column(nullable=True)
    finance_fixed_expense_id: Mapped[UUID | None] = mapped_column(nullable=True)
    finance_manual_income_id: Mapped[UUID | None] = mapped_column(nullable=True)
    cash_movement_id: Mapped[UUID | None] = mapped_column(nullable=True)
    purchase_request_id: Mapped[UUID | None] = mapped_column(nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
