"""Enforce one active workspace membership per platform user.

Revision ID: 20261008_0065
Revises: 20261007_0064
"""

from collections.abc import Sequence

from alembic import op

revision: str = "20261008_0065"
down_revision: str | Sequence[str] | None = "20261007_0064"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY platform_user_id
                    ORDER BY is_default DESC, activated_at DESC NULLS LAST, created_at DESC
                ) AS rn
            FROM workspace_memberships
            WHERE status = 'active'
        )
        UPDATE workspace_memberships AS m
        SET status = 'suspended', revoked_at = COALESCE(m.revoked_at, NOW())
        FROM ranked AS r
        WHERE m.id = r.id AND r.rn > 1
        """
    )
    op.create_index(
        "uq_memberships_one_active_per_user",
        "workspace_memberships",
        ["platform_user_id"],
        unique=True,
        postgresql_where="status = 'active'",
    )


def downgrade() -> None:
    op.drop_index(
        "uq_memberships_one_active_per_user",
        table_name="workspace_memberships",
        postgresql_where="status = 'active'",
    )
