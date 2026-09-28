"""carwash_operational_reception

Revision ID: 20260928_0051
Revises: 20260928_0050
Create Date: 2026-09-27 22:44:48.151411

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260928_0051"
down_revision: str | Sequence[str] | None = "20260928_0050"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "carwash_washes",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("customer_id", sa.Uuid(), nullable=False),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("plate", sa.String(length=32), nullable=False),
        sa.Column("vehicle_model", sa.String(length=120), nullable=True),
        sa.Column("vehicle_color", sa.String(length=60), nullable=True),
        sa.Column("washer_id", sa.Uuid(), nullable=False),
        sa.Column("washer_name", sa.String(length=201), nullable=False),
        sa.Column("supervisor_id", sa.Uuid(), nullable=False),
        sa.Column("supervisor_name", sa.String(length=201), nullable=False),
        sa.Column("payment_method_id", sa.Uuid(), nullable=True),
        sa.Column("payment_method_name", sa.String(length=120), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column(
            "status", sa.String(length=16), server_default=sa.text("'waiting'"), nullable=False
        ),
        sa.Column("subtotal", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("total", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancel_reason", sa.String(length=500), nullable=True),
        sa.Column("creation_key", sa.String(length=128), nullable=False),
        sa.Column("creation_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("start_key", sa.String(length=128), nullable=True),
        sa.Column("start_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("cancel_key", sa.String(length=128), nullable=True),
        sa.Column("cancel_fingerprint", sa.String(length=64), nullable=True),
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
            "(status = 'cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL "
            "AND cancel_key IS NOT NULL AND cancel_fingerprint IS NOT NULL)",
            name=op.f("ck_carwash_washes_cancellation_required"),
        ),
        sa.CheckConstraint(
            "status <> 'washing' OR started_at IS NOT NULL",
            name=op.f("ck_carwash_washes_washing_started"),
        ),
        sa.CheckConstraint(
            "status IN ('waiting', 'washing', 'cancelled')",
            name=op.f("ck_carwash_washes_status_values"),
        ),
        sa.CheckConstraint(
            "(started_at IS NULL) = (start_key IS NULL) "
            "AND (start_key IS NULL) = (start_fingerprint IS NULL)",
            name=op.f("ck_carwash_washes_start_metadata"),
        ),
        sa.CheckConstraint(
            "char_length(trim(plate)) > 0", name=op.f("ck_carwash_washes_plate_required")
        ),
        sa.CheckConstraint(
            "subtotal >= 0 AND tax_amount >= 0 AND total = subtotal + tax_amount",
            name=op.f("ck_carwash_washes_totals_valid"),
        ),
        sa.CheckConstraint("version >= 1", name=op.f("ck_carwash_washes_version_positive")),
        sa.ForeignKeyConstraint(
            ["workspace_id", "customer_id", "branch_id"],
            [
                "customer_branch_assignments.workspace_id",
                "customer_branch_assignments.customer_id",
                "customer_branch_assignments.branch_id",
            ],
            name=op.f("fk_carwash_washes_workspace_id_customer_branch_assignments"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "payment_method_id"],
            ["payment_methods.workspace_id", "payment_methods.id"],
            name=op.f("fk_carwash_washes_workspace_id_payment_methods"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "supervisor_id", "branch_id"],
            [
                "employee_branch_assignments.workspace_id",
                "employee_branch_assignments.employee_id",
                "employee_branch_assignments.branch_id",
            ],
            name="fk_carwash_washes_supervisor_branch",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "washer_id", "branch_id"],
            [
                "employee_branch_assignments.workspace_id",
                "employee_branch_assignments.employee_id",
                "employee_branch_assignments.branch_id",
            ],
            name="fk_carwash_washes_washer_branch",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_carwash_washes")),
        sa.UniqueConstraint("workspace_id", "branch_id", "id", name="uq_carwash_washes_scope_id"),
        sa.UniqueConstraint("workspace_id", "cancel_key", name="uq_carwash_washes_cancel"),
        sa.UniqueConstraint("workspace_id", "creation_key", name="uq_carwash_washes_creation"),
        sa.UniqueConstraint("workspace_id", "start_key", name="uq_carwash_washes_start"),
    )
    op.create_index(
        "ix_carwash_washes_scope_created",
        "carwash_washes",
        ["workspace_id", "branch_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_carwash_washes_scope_status",
        "carwash_washes",
        ["workspace_id", "branch_id", "status"],
        unique=False,
    )
    op.create_table(
        "carwash_wash_lines",
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("branch_id", sa.Uuid(), nullable=False),
        sa.Column("wash_id", sa.Uuid(), nullable=False),
        sa.Column("service_config_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("tax_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("total", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("washer_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("supervisor_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("config_version", sa.Integer(), nullable=False),
        sa.Column("catalog_version", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("id", sa.Uuid(), server_default=sa.text("uuidv7()"), nullable=False),
        sa.CheckConstraint(
            "config_version >= 1 AND catalog_version >= 1 AND position >= 0",
            name=op.f("ck_carwash_wash_lines_versions_valid"),
        ),
        sa.CheckConstraint(
            "unit_price >= 0 AND tax_rate BETWEEN 0 AND 100 AND tax_amount >= 0 "
            "AND total = unit_price + tax_amount",
            name=op.f("ck_carwash_wash_lines_amounts_valid"),
        ),
        sa.CheckConstraint(
            "washer_rate BETWEEN 0 AND 100 AND supervisor_rate BETWEEN 0 AND 100 "
            "AND washer_rate + supervisor_rate <= 100",
            name=op.f("ck_carwash_wash_lines_rates_valid"),
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "service_config_id"],
            [
                "carwash_service_configs.workspace_id",
                "carwash_service_configs.branch_id",
                "carwash_service_configs.id",
            ],
            name=op.f("fk_carwash_wash_lines_workspace_id_carwash_service_configs"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "branch_id", "wash_id"],
            ["carwash_washes.workspace_id", "carwash_washes.branch_id", "carwash_washes.id"],
            name=op.f("fk_carwash_wash_lines_workspace_id_carwash_washes"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id", "item_id"],
            ["items.workspace_id", "items.id"],
            name=op.f("fk_carwash_wash_lines_workspace_id_items"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_carwash_wash_lines")),
        sa.UniqueConstraint("wash_id", "service_config_id", name="uq_carwash_lines_wash_service"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("carwash_wash_lines")
    op.drop_index("ix_carwash_washes_scope_status", table_name="carwash_washes")
    op.drop_index("ix_carwash_washes_scope_created", table_name="carwash_washes")
    op.drop_table("carwash_washes")
