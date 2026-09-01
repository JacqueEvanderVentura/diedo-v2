"""Implement the CRM lifecycle and link commercial quotes.

Revision ID: 20260901_0015
Revises: 20260901_0014
Create Date: 2026-09-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260901_0015"
down_revision: str | Sequence[str] | None = "20260901_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "customer_crm_profiles",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column(
            "lifecycle_status", sa.String(length=16), server_default="activo", nullable=False
        ),
        sa.Column("loyalty_points", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint(
            "lifecycle_status IN ('activo', 'prospecto', 'inactivo')",
            name=op.f("ck_customer_crm_profiles_lifecycle_status_values"),
        ),
        sa.CheckConstraint(
            "loyalty_points >= 0",
            name=op.f("ck_customer_crm_profiles_loyalty_points_non_negative"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            name="fk_customer_crm_profiles_workspace_customer",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_customer_crm_profiles")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_customer_crm_profiles_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id", "customer_id", name="uq_customer_crm_profiles_workspace_customer"
        ),
    )
    op.create_index(
        "ix_customer_crm_profiles_workspace_status",
        "customer_crm_profiles",
        ["workspace_id", "lifecycle_status"],
    )
    op.execute(
        """
        INSERT INTO customer_crm_profiles
            (workspace_id, customer_id, lifecycle_status, loyalty_points,
             created_by_platform_user_id, updated_by_platform_user_id)
        SELECT customer.workspace_id, customer.id, 'activo', 0,
               customer.created_by_platform_user_id, customer.updated_by_platform_user_id
        FROM customers AS customer
        ON CONFLICT (workspace_id, customer_id) DO NOTHING
        """
    )

    op.create_table(
        "crm_leads",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_membership_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), server_default="", nullable=False),
        sa.Column("company", sa.String(length=200), server_default="", nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("website", sa.String(length=500), nullable=True),
        sa.Column("location", sa.String(length=240), nullable=True),
        sa.Column("source", sa.String(length=16), server_default="manual", nullable=False),
        sa.Column("source_url", sa.String(length=1000), nullable=True),
        sa.Column("scraped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_snippet", sa.String(length=4000), nullable=True),
        sa.Column("status", sa.String(length=16), server_default="nuevo", nullable=False),
        sa.Column("score_auto", sa.Integer(), nullable=False),
        sa.Column("score_manual", sa.Integer(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column(
            "module_fits",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "score_reasons",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("score_notes", sa.String(length=2000), nullable=True),
        sa.Column("converted_customer_id", sa.Uuid(), nullable=True),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("conversion_idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("conversion_request_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint(
            "status IN ('nuevo', 'contactado', 'calificado', 'descartado', 'convertido')",
            name=op.f("ck_crm_leads_status_values"),
        ),
        sa.CheckConstraint(
            "source IN ('manual', 'serp', 'serper', 'referral', 'import')",
            name=op.f("ck_crm_leads_source_values"),
        ),
        sa.CheckConstraint(
            "char_length(name) > 0 OR char_length(company) > 0",
            name=op.f("ck_crm_leads_identity_required"),
        ),
        sa.CheckConstraint(
            "score_auto BETWEEN 0 AND 100", name=op.f("ck_crm_leads_score_auto_range")
        ),
        sa.CheckConstraint(
            "score_manual IS NULL OR score_manual BETWEEN 0 AND 100",
            name=op.f("ck_crm_leads_score_manual_range"),
        ),
        sa.CheckConstraint("score BETWEEN 0 AND 100", name=op.f("ck_crm_leads_score_range")),
        sa.CheckConstraint(
            "(status = 'convertido' AND converted_customer_id IS NOT NULL AND "
            "converted_at IS NOT NULL AND conversion_idempotency_key IS NOT NULL AND "
            "conversion_request_fingerprint IS NOT NULL) OR "
            "(status <> 'convertido' AND converted_customer_id IS NULL AND converted_at IS NULL "
            "AND conversion_idempotency_key IS NULL AND conversion_request_fingerprint IS NULL)",
            name=op.f("ck_crm_leads_conversion_state_consistent"),
        ),
        sa.CheckConstraint(
            "char_length(creation_idempotency_key) >= 8",
            name=op.f("ck_crm_leads_idempotency_key_length"),
        ),
        sa.CheckConstraint(
            "char_length(request_fingerprint) = 64", name=op.f("ck_crm_leads_fingerprint_length")
        ),
        sa.CheckConstraint(
            "conversion_idempotency_key IS NULL OR char_length(conversion_idempotency_key) >= 8",
            name=op.f("ck_crm_leads_conversion_idempotency_key_length"),
        ),
        sa.CheckConstraint(
            "conversion_request_fingerprint IS NULL OR char_length(conversion_request_fingerprint) = 64",
            name=op.f("ck_crm_leads_conversion_fingerprint_length"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_crm_leads_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "assigned_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_crm_leads_workspace_assignee",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "converted_customer_id"],
            ["customers.workspace_id", "customers.id"],
            name="fk_crm_leads_workspace_converted_customer",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_leads")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_crm_leads_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id", "creation_idempotency_key", name="uq_crm_leads_workspace_idempotency"
        ),
    )
    op.create_index(
        "uq_crm_leads_workspace_converted_customer",
        "crm_leads",
        ["workspace_id", "converted_customer_id"],
        unique=True,
        postgresql_where=sa.text("converted_customer_id IS NOT NULL"),
    )
    op.create_index(
        "uq_crm_leads_workspace_conversion_idempotency",
        "crm_leads",
        ["workspace_id", "conversion_idempotency_key"],
        unique=True,
        postgresql_where=sa.text("conversion_idempotency_key IS NOT NULL"),
    )
    op.create_index(
        "ix_crm_leads_workspace_branch_status_updated",
        "crm_leads",
        ["workspace_id", "branch_id", "status", "updated_at"],
    )
    op.create_index(
        "ix_crm_leads_workspace_assignee_status",
        "crm_leads",
        ["workspace_id", "assigned_membership_id", "status"],
    )

    op.create_table(
        "crm_opportunities",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("lead_id", sa.Uuid(), nullable=True),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_membership_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("stage", sa.String(length=16), server_default="nuevo", nullable=False),
        sa.Column("value", sa.Numeric(14, 2), server_default=sa.text("0"), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("lost_reason", sa.String(length=1000), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint(
            "stage IN ('nuevo', 'contactado', 'propuesta', 'negociacion', 'cerrado', 'perdido')",
            name=op.f("ck_crm_opportunities_stage_values"),
        ),
        sa.CheckConstraint("value >= 0", name=op.f("ck_crm_opportunities_value_non_negative")),
        sa.CheckConstraint(
            "char_length(currency_code) = 3", name=op.f("ck_crm_opportunities_currency_code_length")
        ),
        sa.CheckConstraint(
            "currency_code = upper(currency_code)",
            name=op.f("ck_crm_opportunities_currency_code_uppercase"),
        ),
        sa.CheckConstraint(
            "(stage IN ('cerrado', 'perdido') AND closed_at IS NOT NULL) OR (stage NOT IN ('cerrado', 'perdido') AND closed_at IS NULL)",
            name=op.f("ck_crm_opportunities_closed_state_consistent"),
        ),
        sa.CheckConstraint(
            "stage <> 'perdido' OR lost_reason IS NOT NULL",
            name=op.f("ck_crm_opportunities_lost_reason_required"),
        ),
        sa.CheckConstraint(
            "char_length(creation_idempotency_key) >= 8",
            name=op.f("ck_crm_opportunities_idempotency_key_length"),
        ),
        sa.CheckConstraint(
            "char_length(request_fingerprint) = 64",
            name=op.f("ck_crm_opportunities_fingerprint_length"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_crm_opportunities_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "lead_id"],
            ["crm_leads.workspace_id", "crm_leads.id"],
            name="fk_crm_opportunities_workspace_lead",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            name="fk_crm_opportunities_workspace_customer",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "assigned_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_crm_opportunities_workspace_assignee",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_opportunities")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_crm_opportunities_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "creation_idempotency_key",
            name="uq_crm_opportunities_workspace_idempotency",
        ),
    )
    op.create_index(
        "uq_crm_opportunities_workspace_lead",
        "crm_opportunities",
        ["workspace_id", "lead_id"],
        unique=True,
        postgresql_where=sa.text("lead_id IS NOT NULL"),
    )
    op.create_index(
        "ix_crm_opportunities_workspace_branch_stage_updated",
        "crm_opportunities",
        ["workspace_id", "branch_id", "stage", "updated_at"],
    )
    op.create_index(
        "ix_crm_opportunities_workspace_customer",
        "crm_opportunities",
        ["workspace_id", "customer_id", "updated_at"],
    )

    op.create_table(
        "crm_activities",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("lead_id", sa.Uuid(), nullable=True),
        sa.Column("opportunity_id", sa.Uuid(), nullable=True),
        sa.Column("customer_id", sa.Uuid(), nullable=True),
        sa.Column("assigned_membership_id", sa.Uuid(), nullable=False),
        sa.Column("activity_type", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("customer_name", sa.String(length=200), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.CheckConstraint(
            "activity_type IN ('llamada', 'email', 'reunion', 'nota', 'tarea')",
            name=op.f("ck_crm_activities_activity_type_values"),
        ),
        sa.CheckConstraint(
            "char_length(creation_idempotency_key) >= 8",
            name=op.f("ck_crm_activities_idempotency_key_length"),
        ),
        sa.CheckConstraint(
            "char_length(request_fingerprint) = 64",
            name=op.f("ck_crm_activities_fingerprint_length"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_crm_activities_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "lead_id"],
            ["crm_leads.workspace_id", "crm_leads.id"],
            name="fk_crm_activities_workspace_lead",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "opportunity_id"],
            ["crm_opportunities.workspace_id", "crm_opportunities.id"],
            name="fk_crm_activities_workspace_opportunity",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "customer_id"],
            ["customers.workspace_id", "customers.id"],
            name="fk_crm_activities_workspace_customer",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "assigned_membership_id"],
            ["workspace_memberships.workspace_id", "workspace_memberships.id"],
            name="fk_crm_activities_workspace_assignee",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_activities")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_crm_activities_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "creation_idempotency_key",
            name="uq_crm_activities_workspace_idempotency",
        ),
    )
    op.create_index(
        "ix_crm_activities_workspace_branch_completed_due",
        "crm_activities",
        ["workspace_id", "branch_id", "completed_at", "due_at"],
    )
    op.create_index(
        "ix_crm_activities_workspace_opportunity_created",
        "crm_activities",
        ["workspace_id", "opportunity_id", "created_at"],
    )
    op.create_index(
        "ix_crm_activities_workspace_customer_created",
        "crm_activities",
        ["workspace_id", "customer_id", "created_at"],
    )

    op.create_table(
        "crm_settings",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column(
            "scoring_weights",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=True),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crm_settings")),
        sa.UniqueConstraint("workspace_id", name="uq_crm_settings_workspace"),
    )
    op.execute(
        """
        INSERT INTO crm_settings (id, workspace_id, scoring_weights)
        SELECT gen_random_uuid(), workspace.id,
               '{"pos": 1, "agenda": 1, "inventarios": 1, "finanzas": 1,
                 "crm": 1, "incidencias": 0.8, "config": 0.6}'::jsonb
        FROM workspaces AS workspace
        ON CONFLICT (workspace_id) DO NOTHING
        """
    )

    op.add_column("sales_quotes", sa.Column("opportunity_id", sa.Uuid(), nullable=True))
    op.add_column("sales_quotes", sa.Column("crm_status", sa.String(length=16), nullable=True))
    op.create_foreign_key(
        "fk_sales_quotes_workspace_opportunity",
        "sales_quotes",
        "crm_opportunities",
        ["workspace_id", "opportunity_id"],
        ["workspace_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "crm_origin_consistent",
        "sales_quotes",
        "(origin = 'pos' AND opportunity_id IS NULL AND crm_status IS NULL) OR "
        "(origin = 'crm' AND crm_status IN ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'))",
    )
    op.create_index(
        "ix_sales_quotes_workspace_opportunity",
        "sales_quotes",
        ["workspace_id", "opportunity_id", "updated_at"],
    )

    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('crm', 'CRM', 'optional', 'available', '["foundation"]')
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
            ('crm.read', 'crm', 'read', 'Ver CRM',
             'View leads, pipeline, activities, customer commerce, and CRM summaries.', 30, false),
            ('crm.manage', 'crm', 'manage', 'Gestionar CRM',
             'Create and update leads, opportunities, activities, scoring, and conversions.', 40, false)
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
        WHERE role.code IN ('workspace_admin', 'manager', 'supervisor', 'seller')
          AND role.status = 'active'
          AND permission.code IN ('crm.read', 'crm.manage')
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO module_entitlements
            (workspace_id, module_definition_id, status, effective_from)
        SELECT workspace.id, module.id, 'enabled', now()
        FROM workspaces AS workspace
        JOIN module_definitions AS module ON module.code = 'crm'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM demo_seed_registry WHERE entity_type IN "
        "('crm_activity', 'crm_opportunity', 'crm_lead', 'customer_crm_profile')"
    )
    op.execute(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE code IN ('crm.read', 'crm.manage'))"
    )
    op.execute("DELETE FROM permissions WHERE code IN ('crm.read', 'crm.manage')")
    op.execute(
        "DELETE FROM module_entitlements WHERE module_definition_id = "
        "(SELECT id FROM module_definitions WHERE code = 'crm')"
    )
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'crm'")
    op.drop_index("ix_sales_quotes_workspace_opportunity", table_name="sales_quotes")
    op.drop_constraint(op.f("ck_sales_quotes_crm_origin_consistent"), "sales_quotes", type_="check")
    op.drop_constraint("fk_sales_quotes_workspace_opportunity", "sales_quotes", type_="foreignkey")
    op.drop_column("sales_quotes", "crm_status")
    op.drop_column("sales_quotes", "opportunity_id")
    op.drop_table("crm_settings")
    op.drop_index("ix_crm_activities_workspace_customer_created", table_name="crm_activities")
    op.drop_index("ix_crm_activities_workspace_opportunity_created", table_name="crm_activities")
    op.drop_index("ix_crm_activities_workspace_branch_completed_due", table_name="crm_activities")
    op.drop_table("crm_activities")
    op.drop_index("ix_crm_opportunities_workspace_customer", table_name="crm_opportunities")
    op.drop_index(
        "ix_crm_opportunities_workspace_branch_stage_updated", table_name="crm_opportunities"
    )
    op.drop_index("uq_crm_opportunities_workspace_lead", table_name="crm_opportunities")
    op.drop_table("crm_opportunities")
    op.drop_index("ix_crm_leads_workspace_assignee_status", table_name="crm_leads")
    op.drop_index("ix_crm_leads_workspace_branch_status_updated", table_name="crm_leads")
    op.drop_index("uq_crm_leads_workspace_conversion_idempotency", table_name="crm_leads")
    op.drop_index("uq_crm_leads_workspace_converted_customer", table_name="crm_leads")
    op.drop_table("crm_leads")
    op.drop_index("ix_customer_crm_profiles_workspace_status", table_name="customer_crm_profiles")
    op.drop_table("customer_crm_profiles")
