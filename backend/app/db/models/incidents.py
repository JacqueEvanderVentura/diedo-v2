from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.db.models.mixins import TimestampMixin, UuidPrimaryKeyMixin, VersionMixin


class IncidentCounter(Base):
    """Workspace-local sequence used to produce human-friendly INC-NNNN codes."""

    __tablename__ = "incident_counters"

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), primary_key=True
    )
    last_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1193, server_default=text("1193")
    )


class Incident(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "incidents"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_incidents_workspace_id"),
        UniqueConstraint("workspace_id", "code", name="uq_incidents_workspace_code"),
        ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            ondelete="RESTRICT",
            name="fk_incidents_workspace_branch",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "asset_id"],
            ["assets.workspace_id", "assets.id"],
            ondelete="RESTRICT",
            name="fk_incidents_workspace_asset",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "reported_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_incidents_workspace_reporter",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_incidents_workspace_employee",
        ),
        CheckConstraint(
            "incident_type IN ('activo', 'infraestructura', 'personal')",
            name="type_values",
        ),
        CheckConstraint(
            "priority IN ('baja', 'media', 'alta', 'critica')",
            name="priority_values",
        ),
        CheckConstraint(
            "status IN ('abierta', 'en_proceso', 'resuelta', 'cerrada')",
            name="status_values",
        ),
        CheckConstraint(
            "asset_id IS NULL OR incident_type = 'activo'",
            name="asset_requires_asset_type",
        ),
        CheckConstraint(
            "(incident_type = 'personal' AND "
            "((employee_id IS NULL AND employee_incident_kind IS NULL) OR "
            "(employee_id IS NOT NULL AND employee_incident_kind IN "
            "('ausencia', 'tardanza', 'amonestacion', 'licencia_medica', 'otro')))) OR "
            "(incident_type <> 'personal' AND employee_id IS NULL "
            "AND employee_incident_kind IS NULL)",
            name="employee_incident_fields",
        ),
        Index(
            "ix_incidents_workspace_branch_status_created",
            "workspace_id",
            "branch_id",
            "status",
            "created_at",
        ),
        Index(
            "ix_incidents_workspace_type_created",
            "workspace_id",
            "incident_type",
            "created_at",
        ),
        Index(
            "ix_incidents_workspace_priority_created",
            "workspace_id",
            "priority",
            "created_at",
        ),
        Index(
            "ix_incidents_workspace_employee_created",
            "workspace_id",
            "employee_id",
            "created_at",
            postgresql_where=text("employee_id IS NOT NULL"),
        ),
        Index(
            "uq_incidents_workspace_idempotency",
            "workspace_id",
            "creation_idempotency_key",
            unique=True,
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    branch_id: Mapped[UUID] = mapped_column(nullable=False)
    asset_id: Mapped[UUID | None] = mapped_column()
    employee_id: Mapped[UUID | None] = mapped_column(nullable=True)
    employee_incident_kind: Mapped[str | None] = mapped_column(String(24))
    reported_by_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    reported_by_name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    incident_type: Mapped[str] = mapped_column(String(24), nullable=False)
    priority: Mapped[str] = mapped_column(
        String(16), nullable=False, default="media", server_default=text("'media'")
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="abierta", server_default=text("'abierta'")
    )
    creation_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_by_platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )


class IncidentParticipant(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "incident_participants"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "incident_id"],
            ["incidents.workspace_id", "incidents.id"],
            ondelete="CASCADE",
            name="fk_incident_participants_workspace_incident",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_incident_participants_workspace_membership",
        ),
        UniqueConstraint(
            "workspace_id",
            "incident_id",
            "membership_id",
            name="uq_incident_participants_incident_membership",
        ),
        Index(
            "ix_incident_participants_workspace_membership",
            "workspace_id",
            "membership_id",
            "incident_id",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    incident_id: Mapped[UUID] = mapped_column(nullable=False)
    membership_id: Mapped[UUID] = mapped_column(nullable=False)
    participant_name: Mapped[str] = mapped_column(String(160), nullable=False)


class IncidentActivity(UuidPrimaryKeyMixin, Base):
    __tablename__ = "incident_activity"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "incident_id"],
            ["incidents.workspace_id", "incidents.id"],
            ondelete="CASCADE",
            name="fk_incident_activity_workspace_incident",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "author_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_incident_activity_workspace_author",
        ),
        CheckConstraint(
            "activity_type IN ('created', 'status_changed', 'comment')",
            name="type_values",
        ),
        Index(
            "ix_incident_activity_workspace_incident_created",
            "workspace_id",
            "incident_id",
            "created_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    incident_id: Mapped[UUID] = mapped_column(nullable=False)
    activity_type: Mapped[str] = mapped_column(String(24), nullable=False)
    author_membership_id: Mapped[UUID | None] = mapped_column()
    author_name: Mapped[str] = mapped_column(String(160), nullable=False)
    message: Mapped[str] = mapped_column(String(2000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class IncidentAttachment(UuidPrimaryKeyMixin, Base):
    __tablename__ = "incident_attachments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "incident_id"],
            ["incidents.workspace_id", "incidents.id"],
            ondelete="CASCADE",
            name="fk_incident_attachments_workspace_incident",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "uploaded_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_incident_attachments_workspace_uploader",
        ),
        CheckConstraint("size_bytes > 0", name="size_positive"),
        CheckConstraint("char_length(checksum_sha256) = 64", name="checksum_length"),
        CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')",
            name="content_type_values",
        ),
        Index(
            "ix_incident_attachments_workspace_incident_created",
            "workspace_id",
            "incident_id",
            "created_at",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    incident_id: Mapped[UUID] = mapped_column(nullable=False)
    uploaded_by_membership_id: Mapped[UUID] = mapped_column(nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
