"""Select login workspace through an internal primary membership.

Revision ID: 20260823_0003
Revises: 20260823_0002
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260823_0003"
down_revision: str | Sequence[str] | None = "20260823_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspace_memberships",
        sa.Column(
            "is_default",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.execute(
        """
        WITH ranked_memberships AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY platform_user_id
                       ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END,
                                created_at,
                                id
                   ) AS position
            FROM workspace_memberships
        )
        UPDATE workspace_memberships AS membership
        SET is_default = true
        FROM ranked_memberships
        WHERE membership.id = ranked_memberships.id
          AND ranked_memberships.position = 1
        """
    )
    op.create_index(
        "uq_memberships_default_workspace",
        "workspace_memberships",
        ["platform_user_id"],
        unique=True,
        postgresql_where=sa.text("is_default"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_memberships_default_workspace",
        table_name="workspace_memberships",
    )
    op.drop_column("workspace_memberships", "is_default")
