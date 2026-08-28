from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import UuidPrimaryKeyMixin


class AuditEntry(UuidPrimaryKeyMixin, Base):
    """Append-only security and business audit record."""

    __tablename__ = "audit_entries"
    __table_args__ = (
        CheckConstraint("outcome IN ('success', 'denied', 'failure')", name="outcome_values"),
        Index("ix_audit_entries_actor", "actor_platform_user_id"),
        Index("ix_audit_entries_workspace_occurred", "workspace_id", "occurred_at"),
        Index("ix_audit_entries_target", "target_type", "target_id"),
        Index("ix_audit_entries_request", "request_id"),
    )

    workspace_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT")
    )
    actor_platform_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT")
    )
    action: Mapped[str] = mapped_column(String(96), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(128))
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
