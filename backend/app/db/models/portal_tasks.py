from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin


class PortalTaskTemplate(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "portal_task_templates"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_portal_task_templates_workspace_id"),
        ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name="fk_portal_task_templates_workspace",
        ),
        ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name="fk_portal_task_templates_creator",
        ),
        CheckConstraint(
            "kind IN ('consent_document')",
            name="kind_values",
        ),
        CheckConstraint(
            "size_bytes > 0 AND size_bytes <= 10485760",
            name="size_range",
        ),
        CheckConstraint("char_length(checksum_sha256) = 64", name="checksum_length"),
        CheckConstraint("content_type = 'application/pdf'", name="content_type_pdf"),
        Index(
            "ix_portal_task_templates_workspace_default",
            "workspace_id",
            "is_default_for_all",
            "is_active",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    checkbox_label: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default=text("'consent_document'")
    )
    is_default_for_all: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_platform_user_id: Mapped[UUID] = mapped_column(nullable=False)


class PortalTaskCompletion(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "portal_task_completions"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_portal_task_completions_workspace_id"),
        UniqueConstraint(
            "workspace_id",
            "template_id",
            "customer_id",
            name="uq_portal_task_completion_customer",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "template_id"],
            ["portal_task_templates.workspace_id", "portal_task_templates.id"],
            ondelete="RESTRICT",
            name="fk_portal_task_completions_template",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            ondelete="RESTRICT",
            name="fk_portal_task_completions_customer",
        ),
        Index("ix_portal_task_completions_customer", "workspace_id", "customer_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    template_id: Mapped[UUID] = mapped_column(nullable=False)
    customer_id: Mapped[UUID] = mapped_column(nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
