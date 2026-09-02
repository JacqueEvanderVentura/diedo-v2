"""Implement the operational finance module.

Revision ID: 20260901_0016
Revises: 20260901_0015
Create Date: 2026-09-01

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260901_0016"
down_revision: str | Sequence[str] | None = "20260901_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _identity_columns() -> list[sa.Column]:
    return [
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
    ]


def _actor_columns() -> list[sa.Column]:
    return [
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
    ]


def _actor_foreign_keys() -> list[sa.ForeignKeyConstraint]:
    return [
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "finance_budgets",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("normalized_name", sa.String(length=160), nullable=False),
        sa.Column("budget_group", sa.String(length=24), nullable=False),
        sa.Column("monthly_limit", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        *_actor_columns(),
        *_identity_columns(),
        sa.CheckConstraint(
            "budget_group IN ('marketing', 'operaciones', 'rh', 'it')",
            name=op.f("ck_finance_budgets_group_values"),
        ),
        sa.CheckConstraint(
            "monthly_limit > 0", name=op.f("ck_finance_budgets_monthly_limit_positive")
        ),
        sa.CheckConstraint(
            "status IN ('active', 'archived')",
            name=op.f("ck_finance_budgets_status_values"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_finance_budgets_workspace_branch",
            ondelete="RESTRICT",
        ),
        *_actor_foreign_keys(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finance_budgets")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_finance_budgets_workspace_id"),
        sa.UniqueConstraint("workspace_id", "branch_id", "id", name="uq_finance_budgets_scope_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "normalized_name",
            name="uq_finance_budgets_scope_name",
        ),
    )
    op.create_index(
        "ix_finance_budgets_workspace_branch_status",
        "finance_budgets",
        ["workspace_id", "branch_id", "status"],
    )
    op.create_index(
        "uq_finance_budgets_workspace_idempotency",
        "finance_budgets",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
    )

    op.create_table(
        "finance_expenses",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("concept", sa.String(length=240), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("payment_status", sa.String(length=16), nullable=False),
        sa.Column("budget_id", sa.Uuid(), nullable=True),
        sa.Column("record_status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_platform_user_id", sa.Uuid(), nullable=True),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        *_actor_columns(),
        *_identity_columns(),
        sa.CheckConstraint(
            "category IN ('alquiler', 'servicios', 'nomina', 'insumos', 'marketing', "
            "'mantenimiento', 'otros')",
            name=op.f("ck_finance_expenses_category_values"),
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_finance_expenses_amount_positive")),
        sa.CheckConstraint(
            "payment_status IN ('pagado', 'pendiente')",
            name=op.f("ck_finance_expenses_payment_status_values"),
        ),
        sa.CheckConstraint(
            "record_status IN ('active', 'voided')",
            name=op.f("ck_finance_expenses_record_status_values"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_finance_expenses_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "budget_id"],
            [
                "finance_budgets.workspace_id",
                "finance_budgets.branch_id",
                "finance_budgets.id",
            ],
            name="fk_finance_expenses_scope_budget",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["voided_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        *_actor_foreign_keys(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finance_expenses")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_finance_expenses_workspace_id"),
    )
    op.create_index(
        "ix_finance_expenses_workspace_branch_date",
        "finance_expenses",
        ["workspace_id", "branch_id", "expense_date"],
    )
    op.create_index(
        "ix_finance_expenses_workspace_budget_date",
        "finance_expenses",
        ["workspace_id", "budget_id", "expense_date"],
    )
    op.create_index(
        "uq_finance_expenses_workspace_idempotency",
        "finance_expenses",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
    )

    op.create_table(
        "finance_fixed_expenses",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("concept", sa.String(length=240), nullable=False),
        sa.Column("normalized_concept", sa.String(length=240), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("day_of_month", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        *_actor_columns(),
        *_identity_columns(),
        sa.CheckConstraint(
            "category IN ('alquiler', 'servicios', 'nomina', 'insumos', 'marketing', "
            "'mantenimiento', 'otros')",
            name=op.f("ck_finance_fixed_expenses_category_values"),
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_finance_fixed_expenses_amount_positive")),
        sa.CheckConstraint(
            "day_of_month BETWEEN 1 AND 31",
            name=op.f("ck_finance_fixed_expenses_day_of_month_range"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'archived')",
            name=op.f("ck_finance_fixed_expenses_status_values"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_finance_fixed_expenses_workspace_branch",
            ondelete="RESTRICT",
        ),
        *_actor_foreign_keys(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finance_fixed_expenses")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_finance_fixed_expenses_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "id",
            name="uq_finance_fixed_expenses_scope_id",
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "normalized_concept",
            name="uq_finance_fixed_expenses_scope_concept",
        ),
    )
    op.create_index(
        "ix_finance_fixed_expenses_workspace_branch_status",
        "finance_fixed_expenses",
        ["workspace_id", "branch_id", "status"],
    )
    op.create_index(
        "uq_finance_fixed_expenses_workspace_idempotency",
        "finance_fixed_expenses",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
    )

    op.create_table(
        "finance_fixed_expense_payments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("fixed_expense_id", sa.Uuid(), nullable=False),
        sa.Column("period", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "amount > 0",
            name=op.f("ck_finance_fixed_expense_payments_amount_positive"),
        ),
        sa.CheckConstraint(
            "period = date_trunc('month', period)::date",
            name=op.f("ck_finance_fixed_expense_payments_period_first_day"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_finance_fixed_expense_payments_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "fixed_expense_id"],
            [
                "finance_fixed_expenses.workspace_id",
                "finance_fixed_expenses.branch_id",
                "finance_fixed_expenses.id",
            ],
            name="fk_finance_fixed_expense_payments_workspace_expense",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finance_fixed_expense_payments")),
        sa.UniqueConstraint(
            "workspace_id", "id", name="uq_finance_fixed_expense_payments_workspace_id"
        ),
        sa.UniqueConstraint(
            "workspace_id",
            "fixed_expense_id",
            "period",
            name="uq_finance_fixed_expense_payments_period",
        ),
    )
    op.create_index(
        "ix_finance_fixed_expense_payments_workspace_branch_period",
        "finance_fixed_expense_payments",
        ["workspace_id", "branch_id", "period"],
    )
    op.create_index(
        "uq_finance_fixed_expense_payments_workspace_idempotency",
        "finance_fixed_expense_payments",
        ["workspace_id", "idempotency_key"],
        unique=True,
    )

    op.create_table(
        "finance_liabilities",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("normalized_name", sa.String(length=200), nullable=False),
        sa.Column("liability_type", sa.String(length=16), nullable=False),
        sa.Column("initial_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("pending_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("pay_day", sa.Integer(), nullable=False),
        sa.Column("cut_day", sa.Integer(), nullable=True),
        sa.Column("installment", sa.Numeric(precision=14, scale=2), nullable=True),
        sa.Column("paid_installments", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("total_installments", sa.Integer(), nullable=True),
        sa.Column(
            "category_ids",
            postgresql.ARRAY(sa.String(length=24)),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        *_actor_columns(),
        *_identity_columns(),
        sa.CheckConstraint(
            "liability_type IN ('prestamo', 'tarjeta')",
            name=op.f("ck_finance_liabilities_type_values"),
        ),
        sa.CheckConstraint(
            "initial_amount > 0",
            name=op.f("ck_finance_liabilities_initial_amount_positive"),
        ),
        sa.CheckConstraint(
            "pending_amount >= 0 AND pending_amount <= initial_amount",
            name=op.f("ck_finance_liabilities_pending_amount_range"),
        ),
        sa.CheckConstraint(
            "pay_day BETWEEN 1 AND 31",
            name=op.f("ck_finance_liabilities_pay_day_range"),
        ),
        sa.CheckConstraint(
            "cut_day IS NULL OR cut_day BETWEEN 1 AND 31",
            name=op.f("ck_finance_liabilities_cut_day_range"),
        ),
        sa.CheckConstraint(
            "installment IS NULL OR installment > 0",
            name=op.f("ck_finance_liabilities_installment_positive"),
        ),
        sa.CheckConstraint(
            "paid_installments >= 0",
            name=op.f("ck_finance_liabilities_paid_installments_non_negative"),
        ),
        sa.CheckConstraint(
            "total_installments IS NULL OR total_installments > 0",
            name=op.f("ck_finance_liabilities_total_installments_positive"),
        ),
        sa.CheckConstraint(
            "total_installments IS NULL OR paid_installments <= total_installments",
            name=op.f("ck_finance_liabilities_installment_progress_range"),
        ),
        sa.CheckConstraint(
            "(liability_type = 'prestamo' AND cut_day IS NULL) OR "
            "(liability_type = 'tarjeta' AND cut_day IS NOT NULL AND installment IS NULL "
            "AND total_installments IS NULL AND paid_installments = 0)",
            name=op.f("ck_finance_liabilities_type_fields_consistent"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'archived')",
            name=op.f("ck_finance_liabilities_status_values"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_finance_liabilities_workspace_branch",
            ondelete="RESTRICT",
        ),
        *_actor_foreign_keys(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finance_liabilities")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_finance_liabilities_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "normalized_name",
            name="uq_finance_liabilities_scope_name",
        ),
    )
    op.create_index(
        "ix_finance_liabilities_workspace_branch_status",
        "finance_liabilities",
        ["workspace_id", "branch_id", "status"],
    )
    op.create_index(
        "uq_finance_liabilities_workspace_idempotency",
        "finance_liabilities",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
    )

    op.create_table(
        "finance_accounts",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("normalized_name", sa.String(length=160), nullable=False),
        sa.Column("account_type", sa.String(length=24), nullable=False),
        sa.Column("bank", sa.String(length=160), server_default="", nullable=False),
        sa.Column("account_number_masked", sa.String(length=32), server_default="", nullable=False),
        sa.Column("balance", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("currency_code", sa.String(length=3), nullable=False),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        *_actor_columns(),
        *_identity_columns(),
        sa.CheckConstraint(
            "account_type IN ('banco', 'inversion', 'accionistas')",
            name=op.f("ck_finance_accounts_type_values"),
        ),
        sa.CheckConstraint(
            "char_length(currency_code) = 3",
            name=op.f("ck_finance_accounts_currency_code_length"),
        ),
        sa.CheckConstraint(
            "currency_code = upper(currency_code)",
            name=op.f("ck_finance_accounts_currency_code_uppercase"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'archived')",
            name=op.f("ck_finance_accounts_status_values"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_finance_accounts_workspace_branch",
            ondelete="RESTRICT",
        ),
        *_actor_foreign_keys(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finance_accounts")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_finance_accounts_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id",
            "branch_id",
            "normalized_name",
            name="uq_finance_accounts_scope_name",
        ),
    )
    op.create_index(
        "ix_finance_accounts_workspace_branch_status",
        "finance_accounts",
        ["workspace_id", "branch_id", "status"],
    )
    op.create_index(
        "uq_finance_accounts_workspace_idempotency",
        "finance_accounts",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
    )

    op.create_table(
        "finance_manual_incomes",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("income_date", sa.Date(), nullable=False),
        sa.Column("customer", sa.String(length=200), server_default="", nullable=False),
        sa.Column("source", sa.String(length=48), nullable=False),
        sa.Column("payment_status", sa.String(length=16), nullable=False),
        sa.Column("record_status", sa.String(length=16), server_default="active", nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_platform_user_id", sa.Uuid(), nullable=True),
        sa.Column("creation_idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        *_actor_columns(),
        *_identity_columns(),
        sa.CheckConstraint(
            "category IN ('servicios', 'efectivo', 'tarjeta', 'transferencia', 'link')",
            name=op.f("ck_finance_manual_incomes_category_values"),
        ),
        sa.CheckConstraint("amount > 0", name=op.f("ck_finance_manual_incomes_amount_positive")),
        sa.CheckConstraint(
            "payment_status IN ('pagado', 'pendiente')",
            name=op.f("ck_finance_manual_incomes_payment_status_values"),
        ),
        sa.CheckConstraint(
            "record_status IN ('active', 'voided')",
            name=op.f("ck_finance_manual_incomes_record_status_values"),
        ),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id"],
            ["branches.workspace_id", "branches.id"],
            name="fk_finance_manual_incomes_workspace_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["voided_by_platform_user_id"], ["platform_users.id"], ondelete="RESTRICT"
        ),
        *_actor_foreign_keys(),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_finance_manual_incomes")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_finance_manual_incomes_workspace_id"),
    )
    op.create_index(
        "ix_finance_manual_incomes_workspace_branch_date",
        "finance_manual_incomes",
        ["workspace_id", "branch_id", "income_date"],
    )
    op.create_index(
        "uq_finance_manual_incomes_workspace_idempotency",
        "finance_manual_incomes",
        ["workspace_id", "creation_idempotency_key"],
        unique=True,
    )

    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('finance', 'Finanzas', 'optional', 'available', '["foundation"]')
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
            ('finance.read', 'finance', 'read', 'Ver finanzas',
             'View branch-scoped financial data and summaries.', 10, false),
            ('finance.manage', 'finance', 'manage', 'Gestionar finanzas',
             'Create, update, archive, void, and pay operational financial records.', 20, false)
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
        WHERE role.status = 'active'
          AND (
            (role.code IN ('workspace_admin', 'manager')
             AND permission.code IN ('finance.read', 'finance.manage'))
            OR (role.code = 'supervisor' AND permission.code = 'finance.read')
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
        JOIN module_definitions AS module ON module.code = 'finance'
        ON CONFLICT (workspace_id, module_definition_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM demo_seed_registry WHERE entity_type IN "
        "('finance_income', 'finance_account', 'finance_liability', 'finance_fixed_payment', "
        "'finance_fixed_expense', 'finance_expense', 'finance_budget')"
    )
    op.execute(
        "DELETE FROM role_permissions WHERE permission_id IN "
        "(SELECT id FROM permissions WHERE code IN ('finance.read', 'finance.manage'))"
    )
    op.execute("DELETE FROM permissions WHERE code IN ('finance.read', 'finance.manage')")
    op.execute(
        "DELETE FROM module_entitlements WHERE module_definition_id = "
        "(SELECT id FROM module_definitions WHERE code = 'finance')"
    )
    op.execute("UPDATE module_definitions SET status = 'planned' WHERE code = 'finance'")
    op.drop_index(
        "uq_finance_manual_incomes_workspace_idempotency",
        table_name="finance_manual_incomes",
    )
    op.drop_index(
        "ix_finance_manual_incomes_workspace_branch_date",
        table_name="finance_manual_incomes",
    )
    op.drop_table("finance_manual_incomes")
    op.drop_index("uq_finance_accounts_workspace_idempotency", table_name="finance_accounts")
    op.drop_index("ix_finance_accounts_workspace_branch_status", table_name="finance_accounts")
    op.drop_table("finance_accounts")
    op.drop_index("uq_finance_liabilities_workspace_idempotency", table_name="finance_liabilities")
    op.drop_index(
        "ix_finance_liabilities_workspace_branch_status", table_name="finance_liabilities"
    )
    op.drop_table("finance_liabilities")
    op.drop_index(
        "uq_finance_fixed_expense_payments_workspace_idempotency",
        table_name="finance_fixed_expense_payments",
    )
    op.drop_index(
        "ix_finance_fixed_expense_payments_workspace_branch_period",
        table_name="finance_fixed_expense_payments",
    )
    op.drop_table("finance_fixed_expense_payments")
    op.drop_index(
        "uq_finance_fixed_expenses_workspace_idempotency",
        table_name="finance_fixed_expenses",
    )
    op.drop_index(
        "ix_finance_fixed_expenses_workspace_branch_status",
        table_name="finance_fixed_expenses",
    )
    op.drop_table("finance_fixed_expenses")
    op.drop_index("uq_finance_expenses_workspace_idempotency", table_name="finance_expenses")
    op.drop_index("ix_finance_expenses_workspace_budget_date", table_name="finance_expenses")
    op.drop_index("ix_finance_expenses_workspace_branch_date", table_name="finance_expenses")
    op.drop_table("finance_expenses")
    op.drop_index("uq_finance_budgets_workspace_idempotency", table_name="finance_budgets")
    op.drop_index("ix_finance_budgets_workspace_branch_status", table_name="finance_budgets")
    op.drop_table("finance_budgets")
