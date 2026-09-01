"""Add incidents, activity, participants, and database-backed image evidence.

Revision ID: 20260831_0012
Revises: 20260831_0011
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0012"
down_revision: str | Sequence[str] | None = "20260831_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PERMISSION_CODES = ("incidents.read", "incidents.create", "incidents.manage")


def _id_column() -> sa.Column[object]:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False)


def _created_at_column() -> sa.Column[object]:
    return sa.Column(
        "created_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def _updated_at_column() -> sa.Column[object]:
    return sa.Column(
        "updated_at",
        sa.DateTime(timezone=True),
        server_default=sa.text("now()"),
        nullable=False,
    )


def _version_column() -> sa.Column[object]:
    return sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "incident_counters",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("last_value", sa.Integer(), server_default=sa.text("1193"), nullable=False),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_incident_counters_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("workspace_id", name=op.f("pk_incident_counters")),
    )
    op.execute(
        "INSERT INTO incident_counters (workspace_id, last_value) "
        "SELECT id, 1193 FROM workspaces ON CONFLICT (workspace_id) DO NOTHING"
    )

    op.create_table(
        "incidents",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("asset_id", sa.Uuid()),
        sa.Column("reported_by_membership_id", sa.Uuid(), nullable=False),
        sa.Column("reported_by_name", sa.String(160), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("incident_type", sa.String(24), nullable=False),
        sa.Column("priority", sa.String(16), server_default=sa.text("'media'"), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'abierta'"), nullable=False),
        sa.Column("creation_idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.CheckConstraint(
            "incident_type IN ('activo', 'infraestructura', 'personal')",
            name=op.f("ck_incidents_type_values"),
        ),
        sa.CheckConstraint(
            "priority IN ('baja', 'media', 'alta', 'critica')",
            name=op.f("ck_incidents_priority_values"),
        ),
        sa.CheckConstraint(
            "status IN ('abierta', 'en_proceso', 'resuelta', 'cerrada')",
            name=op.f("ck_incidents_status_values"),
        ),
        sa.CheckConstraint(
            "asset_id IS NULL OR incident_type = 'activo'",
            name=op.f("ck_incidents_asset_requires_asset_type"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_incidents_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_incidents_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "asset_id"],
            ["assets.workspace_id", "assets.id"],
            name="fk_incidents_workspace_asset",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "reported_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_incidents_workspace_reporter",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_incidents_updated_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_incidents")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_incidents_workspace_id"),
        sa.UniqueConstraint("workspace_id", "code", name="uq_incidents_workspace_code"),
    )
    op.create_index(
        "ix_incidents_workspace_branch_status_created",
        "incidents",
        ["workspace_id", "branch_id", "status", "created_at"],
    )
    op.create_index(
        "ix_incidents_workspace_type_created",
        "incidents",
        ["workspace_id", "incident_type", "created_at"],
    )
    op.create_index(
        "ix_incidents_workspace_priority_created",
        "incidents",
        ["workspace_id", "priority", "created_at"],
    )
    op.create_index(
        "uq_incidents_workspace_idempotency",
        "incidents",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
    )

    op.create_table(
        "incident_participants",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("incident_id", sa.Uuid(), nullable=False),
        sa.Column("membership_id", sa.Uuid(), nullable=False),
        sa.Column("participant_name", sa.String(160), nullable=False),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        sa.ForeignKeyConstraint(
            ["workspace_id", "incident_id"],
            ["incidents.workspace_id", "incidents.id"],
            name="fk_incident_participants_workspace_incident",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_incident_participants_workspace_membership",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_incident_participants")),
        sa.UniqueConstraint(
            "workspace_id",
            "incident_id",
            "membership_id",
            name="uq_incident_participants_incident_membership",
        ),
    )
    op.create_index(
        "ix_incident_participants_workspace_membership",
        "incident_participants",
        ["workspace_id", "membership_id", "incident_id"],
    )

    op.create_table(
        "incident_activity",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("incident_id", sa.Uuid(), nullable=False),
        sa.Column("activity_type", sa.String(24), nullable=False),
        sa.Column("author_membership_id", sa.Uuid()),
        sa.Column("author_name", sa.String(160), nullable=False),
        sa.Column("message", sa.String(2000), nullable=False),
        _id_column(),
        _created_at_column(),
        sa.CheckConstraint(
            "activity_type IN ('created', 'status_changed', 'comment')",
            name=op.f("ck_incident_activity_type_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "incident_id"],
            ["incidents.workspace_id", "incidents.id"],
            name="fk_incident_activity_workspace_incident",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "author_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_incident_activity_workspace_author",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_incident_activity")),
    )
    op.create_index(
        "ix_incident_activity_workspace_incident_created",
        "incident_activity",
        ["workspace_id", "incident_id", "created_at"],
    )

    op.create_table(
        "incident_attachments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("incident_id", sa.Uuid(), nullable=False),
        sa.Column("uploaded_by_membership_id", sa.Uuid(), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("checksum_sha256", sa.String(64), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        _id_column(),
        _created_at_column(),
        sa.CheckConstraint("size_bytes > 0", name=op.f("ck_incident_attachments_size_positive")),
        sa.CheckConstraint(
            "char_length(checksum_sha256) = 64",
            name=op.f("ck_incident_attachments_checksum_length"),
        ),
        sa.CheckConstraint(
            "content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')",
            name=op.f("ck_incident_attachments_content_type_values"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "incident_id"],
            ["incidents.workspace_id", "incidents.id"],
            name="fk_incident_attachments_workspace_incident",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "uploaded_by_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_incident_attachments_workspace_uploader",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_incident_attachments")),
    )
    op.create_index(
        "ix_incident_attachments_workspace_incident_created",
        "incident_attachments",
        ["workspace_id", "incident_id", "created_at"],
    )

    _install_incident_catalogs()


def _install_incident_catalogs() -> None:
    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('incidents', 'Incidents', 'optional', 'available', '["foundation"]')
        ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            kind = EXCLUDED.kind,
            status = EXCLUDED.status,
            dependency_codes = EXCLUDED.dependency_codes,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO permissions
            (code, module_code, action, name, description, sort_order, is_platform_only)
        VALUES
            ('incidents.read', 'incidents', 'read', 'Ver incidencias',
             'View branch-scoped incidents, activity, participants, and evidence.', 10, false),
            ('incidents.create', 'incidents', 'create', 'Reportar incidencias',
             'Create incidents in authorized branches.', 20, false),
            ('incidents.manage', 'incidents', 'manage', 'Gestionar incidencias',
             'Change status, comment, and attach image evidence.', 30, false)
        ON CONFLICT (code) DO UPDATE SET
            module_code = EXCLUDED.module_code,
            action = EXCLUDED.action,
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            sort_order = EXCLUDED.sort_order,
            is_platform_only = EXCLUDED.is_platform_only,
            updated_at = now()
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (workspace_id, role_id, permission_id)
        SELECT role.workspace_id, role.id, permission.id
        FROM roles AS role
        CROSS JOIN permissions AS permission
        WHERE role.code = 'workspace_admin'
          AND role.status = 'active'
          AND permission.code IN ('incidents.read', 'incidents.create', 'incidents.manage')
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO module_entitlements
            (workspace_id, module_definition_id, status, effective_from)
        SELECT workspace.id, module.id, 'enabled', now()
        FROM workspaces AS workspace
        JOIN module_definitions AS module ON module.code = 'incidents'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions
            WHERE code IN ('incidents.read', 'incidents.create', 'incidents.manage')
        )
        """
    )
    op.execute(
        """
        DELETE FROM module_entitlements
        WHERE module_definition_id = (
            SELECT id FROM module_definitions WHERE code = 'incidents'
        )
        """
    )
    op.execute(
        "DELETE FROM permissions WHERE code IN "
        "('incidents.read', 'incidents.create', 'incidents.manage')"
    )
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'incidents'")

    op.drop_index(
        "ix_incident_attachments_workspace_incident_created",
        table_name="incident_attachments",
    )
    op.drop_table("incident_attachments")
    op.drop_index("ix_incident_activity_workspace_incident_created", table_name="incident_activity")
    op.drop_table("incident_activity")
    op.drop_index(
        "ix_incident_participants_workspace_membership",
        table_name="incident_participants",
    )
    op.drop_table("incident_participants")
    op.drop_index("uq_incidents_workspace_idempotency", table_name="incidents")
    op.drop_index("ix_incidents_workspace_priority_created", table_name="incidents")
    op.drop_index("ix_incidents_workspace_type_created", table_name="incidents")
    op.drop_index("ix_incidents_workspace_branch_status_created", table_name="incidents")
    op.drop_table("incidents")
    op.drop_table("incident_counters")
