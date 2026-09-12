"""Subscription plans and workspace subscriptions.

Revision ID: 20260912_0030
Revises: 20260912_0029
Create Date: 2026-09-12

"""

from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import uuid7
import json

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "20260912_0030"
down_revision: str | Sequence[str] | None = "20260912_0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CORE = ("foundation", "iam")
_BASICO = (
    "dashboard",
    "crm",
    "catalog",
    "sales",
    "inventory",
    "pos",
    "appointments",
    "reporting",
)
_PRO_EXTRA = ("purchasing", "incidents", "hr", "finance")
_COMPLETO = (
    "dashboard",
    "crm",
    "catalog",
    "sales",
    "inventory",
    "pos",
    "appointments",
    "reporting",
    "purchasing",
    "incidents",
    "hr",
    "finance",
)

_SEED_PLANS = (
    (
        "basico",
        "Básico",
        "CRM, ventas, POS, agenda y reportes esenciales.",
        10,
        list(_CORE + _BASICO),
    ),
    (
        "pro",
        "Pro",
        "Básico más inventario extendido, compras, incidencias, RRHH y finanzas.",
        20,
        list(_CORE + _BASICO + _PRO_EXTRA),
    ),
    (
        "completo",
        "Completo",
        "Todos los módulos disponibles en la plataforma.",
        30,
        list(_CORE + _COMPLETO),
    ),
)


def upgrade() -> None:
    op.create_table(
        "subscription_plans",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("code", sa.String(length=48), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=400), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("module_codes", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="status_values"),
        sa.CheckConstraint("sort_order >= 0", name="sort_order_non_negative"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code", name="uq_subscription_plans_code"),
    )

    op.create_table(
        "workspace_subscriptions",
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("plan_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.CheckConstraint(
            "status IN ('trial', 'active', 'cancelled', 'expired')",
            name="status_values",
        ),
        sa.CheckConstraint(
            "ends_at IS NULL OR ends_at >= started_at",
            name="subscription_period",
        ),
        sa.ForeignKeyConstraint(["plan_id"], ["subscription_plans.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", name="uq_workspace_subscriptions_workspace"),
    )
    op.create_index(
        "ix_workspace_subscriptions_plan",
        "workspace_subscriptions",
        ["plan_id"],
    )

    bind = op.get_bind()
    now = datetime.now(UTC)
    for code, name, description, sort_order, module_codes in _SEED_PLANS:
        bind.execute(
            sa.text(
                """
                INSERT INTO subscription_plans (
                    id, code, name, description, status, module_codes,
                    sort_order, created_at, updated_at, version
                ) VALUES (
                    :id, :code, :name, :description, 'active', CAST(:module_codes AS jsonb),
                    :sort_order, :now, :now, 1
                )
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    module_codes = EXCLUDED.module_codes,
                    sort_order = EXCLUDED.sort_order,
                    updated_at = EXCLUDED.updated_at,
                    version = subscription_plans.version + 1
                """
            ),
            {
                "id": uuid7(),
                "code": code,
                "name": name,
                "description": description,
                "module_codes": json.dumps(module_codes),
                "sort_order": sort_order,
                "now": now,
            },
        )

    op.execute(
        sa.text(
            """
            INSERT INTO workspace_subscriptions (
                id, workspace_id, plan_id, status, started_at, created_at, updated_at, version
            )
            SELECT
                gen_random_uuid(),
                w.id,
                p.id,
                'active',
                COALESCE(w.created_at, NOW()),
                NOW(),
                NOW(),
                1
            FROM workspaces w
            JOIN subscription_plans p ON p.code = 'completo'
            WHERE w.slug <> 'helios-platform'
              AND NOT EXISTS (
                SELECT 1 FROM workspace_subscriptions ws WHERE ws.workspace_id = w.id
              )
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_workspace_subscriptions_plan", table_name="workspace_subscriptions")
    op.drop_table("workspace_subscriptions")
    op.drop_table("subscription_plans")
