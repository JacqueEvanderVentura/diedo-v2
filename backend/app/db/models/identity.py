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


class PlatformUser(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "platform_users"
    __table_args__ = (CheckConstraint("status IN ('active', 'disabled')", name="status_values"),)

    external_subject: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    normalized_email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="active", server_default=text("'active'")
    )


class WorkspaceMembership(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "workspace_memberships"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_memberships_workspace_id_id"),
        UniqueConstraint(
            "workspace_id",
            "id",
            "platform_user_id",
            name="uq_memberships_workspace_id_user",
        ),
        UniqueConstraint("workspace_id", "platform_user_id", name="uq_memberships_workspace_user"),
        CheckConstraint(
            "status IN ('invited', 'active', 'suspended', 'revoked', 'expired')",
            name="status_values",
        ),
        Index("ix_memberships_platform_user", "platform_user_id"),
        Index("ix_memberships_workspace_status", "workspace_id", "status"),
        Index(
            "uq_memberships_default_workspace",
            "platform_user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_access_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_default: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )


class Permission(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "permissions"
    __table_args__ = (
        CheckConstraint("sort_order >= 0", name="sort_order_non_negative"),
        Index("ix_permissions_module_sort", "module_code", "sort_order"),
    )

    code: Mapped[str] = mapped_column(String(96), nullable=False, unique=True)
    module_code: Mapped[str] = mapped_column(
        ForeignKey("module_definitions.code", ondelete="RESTRICT"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(String(240), nullable=False)
    sort_order: Mapped[int] = mapped_column(nullable=False, default=0, server_default=text("0"))
    is_platform_only: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )


class Role(UuidPrimaryKeyMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_roles_workspace_id_id"),
        UniqueConstraint("workspace_id", "code", name="uq_roles_workspace_code"),
        CheckConstraint("status IN ('active', 'archived')", name="status_values"),
        Index("ix_roles_workspace_status", "workspace_id", "status"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    is_system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )


class RolePermission(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "role_id"],
            ["roles.workspace_id", "roles.id"],
            ondelete="RESTRICT",
            name="fk_role_permissions_workspace_role",
        ),
        UniqueConstraint(
            "workspace_id", "role_id", "permission_id", name="uq_role_permissions_role_permission"
        ),
        Index("ix_role_permissions_permission", "permission_id"),
        Index("ix_role_permissions_workspace_role", "workspace_id", "role_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(nullable=False)
    role_id: Mapped[UUID] = mapped_column(nullable=False)
    permission_id: Mapped[UUID] = mapped_column(
        ForeignKey("permissions.id", ondelete="RESTRICT"), nullable=False
    )


class AccessScope(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "access_scopes"
    __table_args__ = (
        UniqueConstraint("workspace_id", "id", name="uq_access_scopes_workspace_id_id"),
        ForeignKeyConstraint(
            ["workspace_id", "legal_entity_id"],
            ["legal_entities.workspace_id", "legal_entities.id"],
            ondelete="RESTRICT",
            name="fk_access_scopes_workspace_entity",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "legal_entity_id", "branch_id"],
            ["branches.workspace_id", "branches.legal_entity_id", "branches.id"],
            ondelete="RESTRICT",
            onupdate="CASCADE",
            name="fk_access_scopes_workspace_entity_branch",
        ),
        CheckConstraint(
            "(scope_type = 'workspace' AND legal_entity_id IS NULL AND branch_id IS NULL) OR "
            "(scope_type = 'legal_entity' AND legal_entity_id IS NOT NULL "
            "AND branch_id IS NULL) OR "
            "(scope_type = 'branch' AND legal_entity_id IS NOT NULL AND branch_id IS NOT NULL)",
            name="target_shape",
        ),
        Index(
            "uq_access_scopes_workspace",
            "workspace_id",
            unique=True,
            postgresql_where=text("scope_type = 'workspace'"),
        ),
        Index(
            "uq_access_scopes_legal_entity",
            "workspace_id",
            "legal_entity_id",
            unique=True,
            postgresql_where=text("scope_type = 'legal_entity'"),
        ),
        Index(
            "uq_access_scopes_branch",
            "workspace_id",
            "branch_id",
            unique=True,
            postgresql_where=text("scope_type = 'branch'"),
        ),
        Index("ix_access_scopes_workspace_entity", "workspace_id", "legal_entity_id"),
        Index(
            "ix_access_scopes_workspace_entity_branch",
            "workspace_id",
            "legal_entity_id",
            "branch_id",
        ),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    scope_type: Mapped[str] = mapped_column(String(24), nullable=False)
    legal_entity_id: Mapped[UUID | None] = mapped_column()
    branch_id: Mapped[UUID | None] = mapped_column()


class RoleAssignment(UuidPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "role_assignments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            ondelete="RESTRICT",
            name="fk_role_assignments_workspace_membership",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "role_id"],
            ["roles.workspace_id", "roles.id"],
            ondelete="RESTRICT",
            name="fk_role_assignments_workspace_role",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "access_scope_id"],
            ["access_scopes.workspace_id", "access_scopes.id"],
            ondelete="RESTRICT",
            name="fk_role_assignments_workspace_scope",
        ),
        CheckConstraint("status IN ('active', 'revoked', 'expired')", name="status_values"),
        CheckConstraint("valid_until IS NULL OR valid_until >= valid_from", name="valid_period"),
        Index(
            "uq_role_assignments_active",
            "workspace_id",
            "membership_id",
            "role_id",
            "access_scope_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index("ix_role_assignments_workspace_member", "workspace_id", "membership_id"),
        Index("ix_role_assignments_workspace_scope", "workspace_id", "access_scope_id"),
    )

    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    membership_id: Mapped[UUID] = mapped_column(nullable=False)
    role_id: Mapped[UUID] = mapped_column(nullable=False)
    access_scope_id: Mapped[UUID] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuthSession(UuidPrimaryKeyMixin, TimestampMixin, Base):
    """Server-side refresh-session state; raw refresh tokens are never stored."""

    __tablename__ = "auth_sessions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "membership_id", "platform_user_id"],
            [
                "workspace_memberships.workspace_id",
                "workspace_memberships.id",
                "workspace_memberships.platform_user_id",
            ],
            ondelete="RESTRICT",
            name="fk_auth_sessions_membership_identity",
        ),
        CheckConstraint("expires_at > created_at", name="valid_expiry"),
        Index("ix_auth_sessions_membership_expiry", "membership_id", "expires_at"),
        Index("ix_auth_sessions_user_expiry", "platform_user_id", "expires_at"),
    )

    platform_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("platform_users.id", ondelete="RESTRICT"), nullable=False
    )
    workspace_id: Mapped[UUID] = mapped_column(
        ForeignKey("workspaces.id", ondelete="RESTRICT"), nullable=False
    )
    membership_id: Mapped[UUID] = mapped_column(nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
