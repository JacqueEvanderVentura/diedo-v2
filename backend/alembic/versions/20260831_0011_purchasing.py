"""Add suppliers, purchase requests, approvals, and purchasing settings.

Revision ID: 20260831_0011
Revises: 20260831_0010
Create Date: 2026-08-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260831_0011"
down_revision: str | Sequence[str] | None = "20260831_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PERMISSION_CODES = (
    "purchasing.read",
    "purchasing.suppliers.manage",
    "purchasing.requests.create",
    "purchasing.requests.review",
    "purchasing.settings.manage",
)


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
        "suppliers",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("normalized_name", sa.String(240), nullable=False),
        sa.Column("tax_identifier", sa.String(80)),
        sa.Column("contact_name", sa.String(160)),
        sa.Column("phone", sa.String(40)),
        sa.Column("email", sa.String(254)),
        sa.Column("address", sa.String(500)),
        sa.Column("product_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("status", sa.String(16), server_default=sa.text("'active'"), nullable=False),
        sa.Column("creation_idempotency_key", sa.String(128)),
        sa.Column("request_fingerprint", sa.String(64)),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.CheckConstraint(
            "status IN ('active', 'inactive', 'archived')",
            name=op.f("ck_suppliers_status_values"),
        ),
        sa.CheckConstraint(
            "product_count >= 0", name=op.f("ck_suppliers_product_count_non_negative")
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_suppliers_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_suppliers_created_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_suppliers_updated_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_suppliers")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_suppliers_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id", "normalized_name", name="uq_suppliers_workspace_name"
        ),
    )
    op.create_index(
        "ix_suppliers_workspace_status_name",
        "suppliers",
        ["workspace_id", "status", "normalized_name"],
    )
    op.create_index(
        "uq_suppliers_workspace_tax_identifier",
        "suppliers",
        ["workspace_id", "tax_identifier"],
        unique=True,
        postgresql_where=sa.text("tax_identifier IS NOT NULL AND status <> 'archived'"),
    )
    op.create_index(
        "uq_suppliers_workspace_idempotency",
        "suppliers",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
        postgresql_where=sa.text("creation_idempotency_key IS NOT NULL"),
    )

    op.create_table(
        "supplier_branch_assignments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        sa.ForeignKeyConstraint(
            ["workspace_id", "supplier_id"],
            ["suppliers.workspace_id", "suppliers.id"],
            name="fk_supplier_branch_assignments_workspace_supplier",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_supplier_branch_assignments_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_supplier_branch_assignments")),
        sa.UniqueConstraint(
            "workspace_id",
            "supplier_id",
            "branch_id",
            name="uq_supplier_branch_assignments_supplier_branch",
        ),
    )
    op.create_index(
        "ix_supplier_branch_assignments_workspace_branch",
        "supplier_branch_assignments",
        ["workspace_id", "branch_id", "supplier_id"],
    )

    op.create_table(
        "purchase_requests",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("request_number", sa.String(32), nullable=False),
        sa.Column("supplier_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("requester_membership_id", sa.Uuid(), nullable=False),
        sa.Column("requester_name", sa.String(160), nullable=False),
        sa.Column(
            "status", sa.String(16), server_default=sa.text("'pendiente'"), nullable=False
        ),
        sa.Column(
            "priority", sa.String(16), server_default=sa.text("'normal'"), nullable=False
        ),
        sa.Column("notes", sa.String(2000)),
        sa.Column("quote_file_name", sa.String(255)),
        sa.Column("reviewer_membership_id", sa.Uuid()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("creation_idempotency_key", sa.String(128), nullable=False),
        sa.Column("request_fingerprint", sa.String(64), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.CheckConstraint(
            "status IN ('pendiente', 'aprobada', 'rechazada', 'entregada')",
            name=op.f("ck_purchase_requests_status_values"),
        ),
        sa.CheckConstraint(
            "priority IN ('normal', 'alta')",
            name=op.f("ck_purchase_requests_priority_values"),
        ),
        sa.CheckConstraint(
            "(status = 'pendiente' AND reviewer_membership_id IS NULL "
            "AND reviewed_at IS NULL AND delivered_at IS NULL) OR "
            "(status IN ('aprobada', 'rechazada') AND reviewer_membership_id IS NOT NULL "
            "AND reviewed_at IS NOT NULL AND delivered_at IS NULL) OR "
            "(status = 'entregada' AND reviewer_membership_id IS NOT NULL "
            "AND reviewed_at IS NOT NULL AND delivered_at IS NOT NULL)",
            name=op.f("ck_purchase_requests_status_timestamps_consistent"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "supplier_id"],
            ["suppliers.workspace_id", "suppliers.id"],
            name="fk_purchase_requests_workspace_supplier",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_purchase_requests_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "requester_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_purchase_requests_workspace_requester",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "reviewer_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_purchase_requests_workspace_reviewer",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_purchase_requests_created_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_purchase_requests_updated_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchase_requests")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_purchase_requests_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id", "request_number", name="uq_purchase_requests_workspace_number"
        ),
    )
    op.create_index(
        "ix_purchase_requests_workspace_branch_status_created",
        "purchase_requests",
        ["workspace_id", "branch_id", "status", "created_at"],
    )
    op.create_index(
        "ix_purchase_requests_workspace_supplier_created",
        "purchase_requests",
        ["workspace_id", "supplier_id", "created_at"],
    )
    op.create_index(
        "uq_purchase_requests_workspace_idempotency",
        "purchase_requests",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
    )

    op.create_table(
        "purchase_request_items",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("purchase_request_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit", sa.String(40), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        _id_column(),
        sa.CheckConstraint(
            "position >= 1", name=op.f("ck_purchase_request_items_position_positive")
        ),
        sa.CheckConstraint(
            "quantity > 0", name=op.f("ck_purchase_request_items_quantity_positive")
        ),
        sa.CheckConstraint(
            "unit_price >= 0",
            name=op.f("ck_purchase_request_items_unit_price_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "purchase_request_id"],
            ["purchase_requests.workspace_id", "purchase_requests.id"],
            name="fk_purchase_request_items_workspace_request",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchase_request_items")),
        sa.UniqueConstraint(
            "workspace_id",
            "purchase_request_id",
            "position",
            name="uq_purchase_request_items_request_position",
        ),
    )
    op.create_index(
        "ix_purchase_request_items_workspace_request",
        "purchase_request_items",
        ["workspace_id", "purchase_request_id"],
    )

    op.create_table(
        "purchasing_settings",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("approver_membership_id", sa.Uuid()),
        sa.Column(
            "notify_on_request", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column("updated_by_platform_user_id", sa.Uuid()),
        _id_column(),
        _created_at_column(),
        _updated_at_column(),
        _version_column(),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            name=op.f("fk_purchasing_settings_workspace_id_workspaces"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "approver_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_purchasing_settings_workspace_approver",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            name=op.f("fk_purchasing_settings_updated_by_platform_user_id_platform_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_purchasing_settings")),
        sa.UniqueConstraint("workspace_id", name="uq_purchasing_settings_workspace"),
    )

    _install_purchasing_catalogs()
    op.execute(
        """
        INSERT INTO purchasing_settings (workspace_id, notify_on_request)
        SELECT id, true FROM workspaces
        ON CONFLICT (workspace_id) DO NOTHING
        """
    )


def _install_purchasing_catalogs() -> None:
    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('purchasing', 'Purchasing', 'optional', 'available',
                '["foundation", "catalog"]')
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
            ('purchasing.read', 'purchasing', 'read', 'Ver compras',
             'View suppliers, purchase requests, statistics, and settings.', 10, false),
            ('purchasing.suppliers.manage', 'purchasing', 'suppliers.manage',
             'Gestionar proveedores',
             'Create, update, deactivate, and archive suppliers.', 20, false),
            ('purchasing.requests.create', 'purchasing', 'requests.create',
             'Crear solicitudes de compra',
             'Create and edit pending purchase requests.', 30, false),
            ('purchasing.requests.review', 'purchasing', 'requests.review',
             'Aprobar solicitudes de compra',
             'Approve, reject, and mark approved requests as delivered.', 40, false),
            ('purchasing.settings.manage', 'purchasing', 'settings.manage',
             'Configurar compras',
             'Choose the designated approver and notification preference.', 50, false)
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
          AND permission.code IN (
              'purchasing.read',
              'purchasing.suppliers.manage',
              'purchasing.requests.create',
              'purchasing.requests.review',
              'purchasing.settings.manage'
          )
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO module_entitlements
            (workspace_id, module_definition_id, status, effective_from)
        SELECT workspace.id, module.id, 'enabled', now()
        FROM workspaces AS workspace
        JOIN module_definitions AS module ON module.code = 'purchasing'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions
            WHERE code IN (
                'purchasing.read',
                'purchasing.suppliers.manage',
                'purchasing.requests.create',
                'purchasing.requests.review',
                'purchasing.settings.manage'
            )
        )
        """
    )
    op.execute(
        """
        DELETE FROM module_entitlements
        WHERE module_definition_id = (
            SELECT id FROM module_definitions WHERE code = 'purchasing'
        )
        """
    )
    op.execute(
        "DELETE FROM permissions WHERE code IN "
        "('purchasing.read', 'purchasing.suppliers.manage', "
        "'purchasing.requests.create', 'purchasing.requests.review', "
        "'purchasing.settings.manage')"
    )
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'purchasing'")

    op.drop_table("purchasing_settings")
    op.drop_index(
        "ix_purchase_request_items_workspace_request", table_name="purchase_request_items"
    )
    op.drop_table("purchase_request_items")
    op.drop_index(
        "uq_purchase_requests_workspace_idempotency", table_name="purchase_requests"
    )
    op.drop_index(
        "ix_purchase_requests_workspace_supplier_created", table_name="purchase_requests"
    )
    op.drop_index(
        "ix_purchase_requests_workspace_branch_status_created", table_name="purchase_requests"
    )
    op.drop_table("purchase_requests")
    op.drop_index(
        "ix_supplier_branch_assignments_workspace_branch",
        table_name="supplier_branch_assignments",
    )
    op.drop_table("supplier_branch_assignments")
    op.drop_index("uq_suppliers_workspace_idempotency", table_name="suppliers")
    op.drop_index("uq_suppliers_workspace_tax_identifier", table_name="suppliers")
    op.drop_index("ix_suppliers_workspace_status_name", table_name="suppliers")
    op.drop_table("suppliers")
