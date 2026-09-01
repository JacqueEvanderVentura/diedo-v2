from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class PaymentMethod(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "payment_methods"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_payment_methods_workspace_id"),
        UniqueConstraint("workspace_id", "code", name="uq_payment_methods_workspace_code"),
        CheckConstraint("status IN ('active', 'inactive', 'archived')", name="status_values"),
        CheckConstraint(
            "channel IN ('cash', 'card', 'bank_transfer', 'payment_link', 'credit', 'other')",
            name="channel_values",
        ),
        CheckConstraint(
            "settlement_policy IN ('immediate', 'pending_confirmation', 'receivable')",
            name="settlement_policy_values",
        ),
        CheckConstraint(
            "NOT affects_cash_drawer OR channel = 'cash'",
            name="cash_drawer_requires_cash_channel",
        ),
        Index("ix_payment_methods_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    icon: Mapped[str] = mapped_column(String(48), nullable=False, server_default=text("'Wallet'"))
    status: Mapped[str] = mapped_column(String(16), nullable=False, server_default=text("'active'"))
    is_system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    channel: Mapped[str] = mapped_column(
        String(24), nullable=False, default="other", server_default=text("'other'")
    )
    settlement_policy: Mapped[str] = mapped_column(
        String(24), nullable=False, default="immediate", server_default=text("'immediate'")
    )
    affects_cash_drawer: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    requires_evidence: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )


class UserInvitation(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "user_invitations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_user_invitations_workspace_membership",
        ),
        CheckConstraint(
            "NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)",
            name="terminal_state",
        ),
        Index("ix_user_invitations_workspace_expiry", "workspace_id", "expires_at"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    membership_id: Mapped[UUID] = mapped_column(nullable=False)
    invited_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DemoSeedRegistry(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "demo_seed_registry"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "entity_type",
            "seed_key",
            name="uq_demo_seed_registry_key",
        ),
        CheckConstraint("char_length(checksum) = 64", name="checksum_length"),
        Index("ix_demo_seed_registry_version", "workspace_id", "seed_version"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    seed_key: Mapped[str] = mapped_column(String(96), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(nullable=False)
    seed_version: Mapped[str] = mapped_column(String(32), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
