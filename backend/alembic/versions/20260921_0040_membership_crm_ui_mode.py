"""Move CRM UI mode from workspace settings to per-membership preference.

Revision ID: 20260921_0040
Revises: 20260919_0039
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260921_0040"
down_revision: str | Sequence[str] | None = "20260919_0039"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspace_memberships",
        sa.Column(
            "crm_ui_mode",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'standard'"),
        ),
    )
    op.create_check_constraint(
        "membership_crm_ui_mode_values",
        "workspace_memberships",
        "crm_ui_mode IN ('standard', 'simplified')",
    )
    op.execute(
        sa.text(
            """
            UPDATE workspace_memberships AS wm
            SET crm_ui_mode = cs.ui_mode
            FROM crm_settings AS cs
            WHERE wm.workspace_id = cs.workspace_id
            """
        )
    )
    op.drop_constraint(op.f("ck_crm_settings_ui_mode_values"), "crm_settings", type_="check")
    op.drop_column("crm_settings", "ui_mode")


def downgrade() -> None:
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
    op.execute(
        sa.text(
            """
            UPDATE crm_settings AS cs
            SET ui_mode = sub.mode
            FROM (
                SELECT workspace_id, MIN(crm_ui_mode) AS mode
                FROM workspace_memberships
                GROUP BY workspace_id
            ) AS sub
            WHERE cs.workspace_id = sub.workspace_id
            """
        )
    )
    op.drop_constraint("membership_crm_ui_mode_values", "workspace_memberships", type_="check")
    op.drop_column("workspace_memberships", "crm_ui_mode")
