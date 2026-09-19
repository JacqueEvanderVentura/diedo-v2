"""Replace CRM auto-scoring with nullable star_rating on leads.

Revision ID: 20260919_0037
Revises: 20260908_0023
Create Date: 2026-09-19

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260919_0037"
down_revision: str | Sequence[str] | None = "20260918_0036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "crm_leads",
        sa.Column("star_rating", sa.Numeric(2, 1), nullable=True),
    )
    op.create_check_constraint(
        "star_rating_range",
        "crm_leads",
        "star_rating IS NULL OR (star_rating >= 0 AND star_rating <= 5)",
    )
    op.create_check_constraint(
        "star_rating_half_step",
        "crm_leads",
        "star_rating IS NULL OR (star_rating * 2) = trunc(star_rating * 2)",
    )

    for name in ("score_auto_range", "score_manual_range", "score_range"):
        op.drop_constraint(name, "crm_leads", type_="check")

    op.drop_column("crm_leads", "score_auto")
    op.drop_column("crm_leads", "score_manual")
    op.drop_column("crm_leads", "score")
    op.drop_column("crm_leads", "module_fits")
    op.drop_column("crm_leads", "score_reasons")
    op.drop_column("crm_leads", "score_notes")

    op.drop_column("crm_settings", "scoring_weights")


def downgrade() -> None:
    op.add_column(
        "crm_settings",
        sa.Column(
            "scoring_weights",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column("crm_leads", sa.Column("score_notes", sa.String(length=2000), nullable=True))
    op.add_column(
        "crm_leads",
        sa.Column(
            "score_reasons",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "crm_leads",
        sa.Column(
            "module_fits",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column("crm_leads", sa.Column("score", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("crm_leads", sa.Column("score_manual", sa.Integer(), nullable=True))
    op.add_column("crm_leads", sa.Column("score_auto", sa.Integer(), nullable=False, server_default="0"))
    op.create_check_constraint(
        "score_auto_range", "crm_leads", "score_auto BETWEEN 0 AND 100"
    )
    op.create_check_constraint(
        "score_manual_range",
        "crm_leads",
        "score_manual IS NULL OR score_manual BETWEEN 0 AND 100",
    )
    op.create_check_constraint("score_range", "crm_leads", "score BETWEEN 0 AND 100")

    op.drop_constraint("star_rating_half_step", "crm_leads", type_="check")
    op.drop_constraint("star_rating_range", "crm_leads", type_="check")
    op.drop_column("crm_leads", "star_rating")
