"""CRM funnel on leads; drop opportunities.

Revision ID: 20261004_0058
Revises: 20261004_0057
Create Date: 2026-10-04

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261004_0058"
down_revision: str | Sequence[str] | None = "20261004_0057"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("crm_leads", sa.Column("lost_reason", sa.String(length=1000), nullable=True))
    op.add_column(
        "crm_leads",
        sa.Column(
            "pipeline_value",
            sa.Numeric(precision=14, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )
    op.add_column(
        "crm_leads",
        sa.Column("pipeline_closed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        op.f("ck_crm_leads_pipeline_value_non_negative"),
        "crm_leads",
        "pipeline_value >= 0",
    )

    op.drop_constraint(op.f("ck_crm_leads_status_values"), "crm_leads", type_="check")
    op.drop_constraint(op.f("ck_crm_leads_conversion_state_consistent"), "crm_leads", type_="check")

    op.execute(
        sa.text(
            """
            UPDATE crm_leads AS l
            SET
                status = CASE
                    WHEN o.stage = 'cerrado' AND l.converted_customer_id IS NOT NULL THEN 'cerrado'
                    WHEN o.stage = 'cerrado' THEN 'negociacion'
                    WHEN o.stage = 'nuevo' THEN 'nuevo'
                    WHEN o.stage = 'contactado' THEN 'contactado'
                    WHEN o.stage = 'propuesta' THEN 'propuesta'
                    WHEN o.stage = 'negociacion' THEN 'negociacion'
                    WHEN o.stage = 'perdido' THEN 'perdido'
                    ELSE l.status
                END,
                pipeline_value = o.value,
                lost_reason = o.lost_reason,
                pipeline_closed_at = CASE
                    WHEN o.stage = 'perdido' THEN o.closed_at
                    ELSE l.pipeline_closed_at
                END
            FROM crm_opportunities AS o
            WHERE o.workspace_id = l.workspace_id AND o.lead_id = l.id
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE crm_leads
            SET status = CASE status
                WHEN 'calificado' THEN 'propuesta'
                WHEN 'convertido' THEN 'cerrado'
                WHEN 'descartado' THEN 'perdido'
                ELSE status
            END
            WHERE status IN ('calificado', 'convertido', 'descartado')
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE crm_leads
            SET
                lost_reason = COALESCE(lost_reason, 'Sin especificar'),
                pipeline_closed_at = COALESCE(pipeline_closed_at, converted_at, updated_at)
            WHERE status = 'perdido'
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE crm_leads
            SET status = 'negociacion'
            WHERE status = 'cerrado'
              AND (
                converted_customer_id IS NULL
                OR converted_at IS NULL
                OR conversion_idempotency_key IS NULL
                OR conversion_request_fingerprint IS NULL
              )
            """
        )
    )

    op.execute(
        sa.text(
            """
            UPDATE crm_leads
            SET
                converted_customer_id = NULL,
                converted_at = NULL,
                conversion_idempotency_key = NULL,
                conversion_request_fingerprint = NULL
            WHERE status <> 'cerrado'
              AND converted_customer_id IS NOT NULL
            """
        )
    )

    op.create_check_constraint(
        op.f("ck_crm_leads_status_values"),
        "crm_leads",
        "status IN ('nuevo', 'contactado', 'propuesta', 'negociacion', 'cerrado', 'perdido')",
    )
    op.create_check_constraint(
        op.f("ck_crm_leads_conversion_state_consistent"),
        "crm_leads",
        "(status = 'cerrado' AND converted_customer_id IS NOT NULL AND "
        "converted_at IS NOT NULL AND conversion_idempotency_key IS NOT NULL AND "
        "conversion_request_fingerprint IS NOT NULL) OR "
        "(status <> 'cerrado' AND converted_customer_id IS NULL AND converted_at IS NULL "
        "AND conversion_idempotency_key IS NULL AND conversion_request_fingerprint IS NULL)",
    )
    op.create_check_constraint(
        op.f("ck_crm_leads_lost_reason_required"),
        "crm_leads",
        "status <> 'perdido' OR lost_reason IS NOT NULL",
    )
    op.create_check_constraint(
        op.f("ck_crm_leads_pipeline_closed_consistent"),
        "crm_leads",
        "(status = 'perdido' AND pipeline_closed_at IS NOT NULL) OR "
        "(status <> 'perdido' AND pipeline_closed_at IS NULL)",
    )

    op.add_column("sales_quotes", sa.Column("lead_id", sa.Uuid(), nullable=True))
    op.execute(
        sa.text(
            """
            UPDATE sales_quotes AS q
            SET lead_id = o.lead_id
            FROM crm_opportunities AS o
            WHERE q.workspace_id = o.workspace_id AND q.opportunity_id = o.id
            """
        )
    )
    op.create_foreign_key(
        op.f("fk_sales_quotes_workspace_lead"),
        "sales_quotes",
        "crm_leads",
        ["workspace_id", "lead_id"],
        ["workspace_id", "id"],
        ondelete="RESTRICT",
    )
    op.drop_index("ix_sales_quotes_workspace_opportunity", table_name="sales_quotes")
    op.drop_constraint(
        op.f("fk_sales_quotes_workspace_opportunity"), "sales_quotes", type_="foreignkey"
    )
    op.drop_constraint(op.f("ck_sales_quotes_crm_origin_consistent"), "sales_quotes", type_="check")
    op.drop_column("sales_quotes", "opportunity_id")
    op.create_check_constraint(
        op.f("ck_sales_quotes_crm_origin_consistent"),
        "sales_quotes",
        "(origin = 'pos' AND lead_id IS NULL AND crm_status IS NULL) OR "
        "(origin = 'crm' AND crm_status IN "
        "('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'))",
    )
    op.create_index(
        "ix_sales_quotes_workspace_lead",
        "sales_quotes",
        ["workspace_id", "lead_id", "updated_at"],
        unique=False,
    )

    op.drop_index("ix_crm_activities_workspace_opportunity_created", table_name="crm_activities")
    op.drop_constraint(
        op.f("fk_crm_activities_workspace_opportunity"), "crm_activities", type_="foreignkey"
    )
    op.drop_column("crm_activities", "opportunity_id")

    op.drop_index("ix_crm_opportunities_workspace_customer", table_name="crm_opportunities")
    op.drop_index(
        "ix_crm_opportunities_workspace_branch_stage_updated", table_name="crm_opportunities"
    )
    op.drop_index("uq_crm_opportunities_workspace_lead", table_name="crm_opportunities")
    op.drop_table("crm_opportunities")


def downgrade() -> None:
    raise NotImplementedError("Downgrade is not supported for CRM funnel migration.")
