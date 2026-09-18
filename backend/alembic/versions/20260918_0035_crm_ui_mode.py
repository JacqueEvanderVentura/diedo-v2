"""Add CRM workspace UI mode (standard vs simplified).

Revision ID: 20260918_0035
Revises: 20260916_0034
"""

import sqlalchemy as sa
from alembic import op

revision = "20260918_0035"
down_revision = "20260916_0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_settings",
        sa.Column(
            "ui_mode",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'standard'"),
        ),
    )
    op.create_check_constraint(
        op.f("ck_crm_settings_ui_mode_values"),
        "crm_settings",
        "ui_mode IN ('standard', 'simplified')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_crm_settings_ui_mode_values"), "crm_settings", type_="check")
    op.drop_column("crm_settings", "ui_mode")
