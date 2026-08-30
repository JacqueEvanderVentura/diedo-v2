"""HR profiles, leave requests, employee receivables, and documents.

Revision ID: 20260830_0008
Revises: 20260829_0007
Create Date: 2026-08-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260830_0008"
down_revision: str | Sequence[str] | None = "20260829_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_HR_PERMISSION_CODES = (
    "hr.overview.read",
    "hr.profile.read",
    "hr.profile.manage",
    "hr.leave.request",
    "hr.leave.review",
    "hr.debt.read",
    "hr.debt.manage",
    "hr.document.read",
    "hr.document.manage",
)


def _timestamps() -> list[sa.Column[object]]:
    return [
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
    ]


def _id_column() -> sa.Column[object]:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False)


def upgrade() -> None:
    op.create_table(
        "employee_hr_profiles",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("initial_salary", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("current_salary", sa.Numeric(14, 2), server_default="0", nullable=False),
        sa.Column("vacation_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("bank_name", sa.String(120)),
        sa.Column("bank_account_type", sa.String(16)),
        sa.Column("bank_account_number", sa.String(128)),
        sa.Column("bank_document", sa.String(64)),
        sa.Column("updated_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        *_timestamps(),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint(
            "bank_account_type IS NULL OR bank_account_type IN ('ahorro', 'corriente')",
            name=op.f("ck_employee_hr_profiles_bank_account_type_values"),
        ),
        sa.CheckConstraint(
            "initial_salary >= 0 AND current_salary >= 0",
            name=op.f("ck_employee_hr_profiles_salary_non_negative"),
        ),
        sa.CheckConstraint(
            "vacation_days >= 0 AND vacation_days <= 365",
            name=op.f("ck_employee_hr_profiles_vacation_days_range"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employee_hr_profiles_updated_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_hr_profiles_workspace_employee",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employee_hr_profiles_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_hr_profiles")),
        sa.UniqueConstraint("workspace_id", "employee_id", name="uq_employee_hr_profiles_employee"),
    )
    op.execute(
        """
        INSERT INTO employee_hr_profiles (
            workspace_id, employee_id, updated_by_platform_user_id
        )
        SELECT workspace_id, id, updated_by_platform_user_id
        FROM employees
        ON CONFLICT (workspace_id, employee_id) DO NOTHING
        """
    )
    op.create_table(
        "hr_leave_requests",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("status", sa.String(16), server_default="pendiente", nullable=False),
        sa.Column("requested_by_platform_user_id", sa.Uuid(), nullable=False),
        sa.Column("reviewed_by_platform_user_id", sa.Uuid()),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        _id_column(),
        *_timestamps(),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint("end_date >= start_date", name=op.f("ck_hr_leave_requests_date_order")),
        sa.CheckConstraint(
            "(status IN ('aprobada', 'rechazada') AND reviewed_at IS NOT NULL "
            "AND reviewed_by_platform_user_id IS NOT NULL) OR "
            "(status IN ('pendiente', 'cancelada') AND reviewed_at IS NULL "
            "AND reviewed_by_platform_user_id IS NULL)",
            name=op.f("ck_hr_leave_requests_review_metadata"),
        ),
        sa.CheckConstraint(
            "status IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')",
            name=op.f("ck_hr_leave_requests_status_values"),
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_hr_leave_requests_requested_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_hr_leave_requests_reviewed_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_hr_leave_requests_workspace_employee",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name=op.f("fk_hr_leave_requests_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hr_leave_requests")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_hr_leave_requests_workspace_id"),
    )
    op.create_index(
        "ix_hr_leave_requests_employee_dates",
        "hr_leave_requests",
        ["workspace_id", "employee_id", "start_date", "end_date"],
    )
    op.create_index(
        "ix_hr_leave_requests_workspace_status_created",
        "hr_leave_requests",
        ["workspace_id", "status", "created_at"],
    )

    op.create_table(
        "employee_debts",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("concept", sa.String(240), nullable=False),
        sa.Column("client_name", sa.String(200)),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency_code", sa.String(3), server_default="DOP", nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        *_timestamps(),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.CheckConstraint("amount > 0", name=op.f("ck_employee_debts_amount_positive")),
        sa.CheckConstraint(
            "char_length(currency_code) = 3",
            name=op.f("ck_employee_debts_currency_code_length"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employee_debts_created_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_employee_debts_workspace_employee",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employee_debts_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_debts")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_employee_debts_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_employee_debts_idempotency_key"
        ),
    )
    op.create_index(
        "ix_employee_debts_workspace_employee_created",
        "employee_debts",
        ["workspace_id", "employee_id", "created_at"],
    )

    op.create_table(
        "employee_debt_payments",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("debt_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("paid_on", sa.Date(), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("received_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        *_timestamps(),
        sa.CheckConstraint("amount > 0", name=op.f("ck_employee_debt_payments_amount_positive")),
        sa.ForeignKeyConstraint(
            ["received_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employee_debt_payments_received_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "debt_id"],
            ["employee_debts.workspace_id", "employee_debts.id"],
            ondelete="RESTRICT",
            name="fk_employee_debt_payments_workspace_debt",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name=op.f("fk_employee_debt_payments_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employee_debt_payments")),
        sa.UniqueConstraint(
            "workspace_id",
            "idempotency_key",
            name="uq_employee_debt_payments_idempotency_key",
        ),
    )
    op.create_index(
        "ix_employee_debt_payments_debt_created",
        "employee_debt_payments",
        ["workspace_id", "debt_id", "created_at"],
    )

    op.create_table(
        "hr_document_records",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("employee_id", sa.Uuid(), nullable=False),
        sa.Column("template_id", sa.String(24), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("include_salary", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("reference_code", sa.String(64), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("created_by_platform_user_id", sa.Uuid(), nullable=False),
        _id_column(),
        *_timestamps(),
        sa.CheckConstraint(
            "jsonb_typeof(snapshot) = 'object'",
            name=op.f("ck_hr_document_records_snapshot_object"),
        ),
        sa.CheckConstraint(
            "template_id IN ('certificado', 'bancaria', 'recomendacion', 'vacaciones')",
            name=op.f("ck_hr_document_records_template_values"),
        ),
        sa.CheckConstraint(
            "NOT include_salary OR template_id = 'bancaria'",
            name=op.f("ck_hr_document_records_salary_only_for_bank_letter"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by_platform_user_id"],
            ["platform_users.id"],
            ondelete="RESTRICT",
            name=op.f("fk_hr_document_records_created_by_platform_user_id_platform_users"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "employee_id"],
            ["employees.workspace_id", "employees.id"],
            ondelete="RESTRICT",
            name="fk_hr_document_records_workspace_employee",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["workspaces.id"],
            ondelete="RESTRICT",
            name=op.f("fk_hr_document_records_workspace_id_workspaces"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_hr_document_records")),
        sa.UniqueConstraint("workspace_id", "id", name="uq_hr_document_records_workspace_id"),
        sa.UniqueConstraint(
            "workspace_id", "idempotency_key", name="uq_hr_document_records_idempotency_key"
        ),
        sa.UniqueConstraint(
            "workspace_id", "reference_code", name="uq_hr_document_records_reference_code"
        ),
    )
    op.create_index(
        "ix_hr_document_records_employee_created",
        "hr_document_records",
        ["workspace_id", "employee_id", "created_at"],
    )
    op.create_index(
        "ix_hr_document_records_workspace_created",
        "hr_document_records",
        ["workspace_id", "created_at"],
    )

    op.execute(
        """
        INSERT INTO module_definitions (code, name, kind, status, dependency_codes)
        VALUES ('hr', 'Human resources', 'optional', 'available', '["foundation"]')
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
        INSERT INTO permissions (
            code, description, is_platform_only, module_code, action, name, sort_order
        ) VALUES
            ('hr.overview.read', 'View HR overview metrics.', false,
             'hr', 'read', 'Ver overview RRHH', 40),
            ('hr.profile.read', 'View sensitive employee HR profiles.', false,
             'hr', 'read', 'Ver fichas RRHH', 50),
            ('hr.profile.manage', 'Change sensitive employee HR profiles.', false,
             'hr', 'manage', 'Gestionar fichas RRHH', 60),
            ('hr.leave.request', 'Request and view own leave.', false,
             'hr', 'request', 'Solicitar vacaciones', 70),
            ('hr.leave.review', 'Review employee leave requests.', false,
             'hr', 'review', 'Aprobar vacaciones', 80),
            ('hr.debt.read', 'View employee receivables.', false,
             'hr', 'read', 'Ver cuentas por cobrar RRHH', 90),
            ('hr.debt.manage', 'Create debts and register payments.', false,
             'hr', 'manage', 'Gestionar cuentas por cobrar RRHH', 100),
            ('hr.document.read', 'View generated HR document history.', false,
             'hr', 'read', 'Ver documentos RRHH', 110),
            ('hr.document.manage', 'Generate HR document records.', false,
             'hr', 'manage', 'Generar documentos RRHH', 120)
        ON CONFLICT (code) DO UPDATE SET
            description = EXCLUDED.description,
            is_platform_only = EXCLUDED.is_platform_only,
            module_code = EXCLUDED.module_code,
            action = EXCLUDED.action,
            name = EXCLUDED.name,
            sort_order = EXCLUDED.sort_order
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
              'hr.overview.read',
              'hr.profile.read',
              'hr.profile.manage',
              'hr.leave.request',
              'hr.leave.review',
              'hr.debt.read',
              'hr.debt.manage',
              'hr.document.read',
              'hr.document.manage'
          )
        ON CONFLICT (workspace_id, role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code = ANY(:codes))"
        ).bindparams(
            sa.bindparam("codes", list(_HR_PERMISSION_CODES), type_=postgresql.ARRAY(sa.Text()))
        )
    )
    op.execute(
        sa.text("DELETE FROM permissions WHERE code = ANY(:codes)").bindparams(
            sa.bindparam("codes", list(_HR_PERMISSION_CODES), type_=postgresql.ARRAY(sa.Text()))
        )
    )
    op.drop_index("ix_hr_document_records_workspace_created", table_name="hr_document_records")
    op.drop_index("ix_hr_document_records_employee_created", table_name="hr_document_records")
    op.drop_table("hr_document_records")
    op.drop_index("ix_employee_debt_payments_debt_created", table_name="employee_debt_payments")
    op.drop_table("employee_debt_payments")
    op.drop_index("ix_employee_debts_workspace_employee_created", table_name="employee_debts")
    op.drop_table("employee_debts")
    op.drop_index("ix_hr_leave_requests_workspace_status_created", table_name="hr_leave_requests")
    op.drop_index("ix_hr_leave_requests_employee_dates", table_name="hr_leave_requests")
    op.drop_table("hr_leave_requests")
    op.drop_table("employee_hr_profiles")
