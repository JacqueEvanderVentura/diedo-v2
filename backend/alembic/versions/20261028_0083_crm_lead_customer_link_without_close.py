"""Let CRM leads link a customer without closing them as won.

Revision ID: 20261028_0083
Revises: 20261028_0082
Create Date: 2026-10-28

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20261028_0083"
down_revision: str | Sequence[str] | None = "20261028_0082"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_CONVERSION_STATE_SQL = (
    "(status <> 'cerrado' OR converted_customer_id IS NOT NULL) AND "
    "((converted_customer_id IS NULL) = (converted_at IS NULL)) AND "
    "((conversion_idempotency_key IS NULL) = (conversion_request_fingerprint IS NULL)) AND "
    "(conversion_idempotency_key IS NULL OR converted_customer_id IS NOT NULL)"
)

_LEGACY_CONVERSION_STATE_SQL = (
    "(status = 'cerrado' AND converted_customer_id IS NOT NULL AND "
    "converted_at IS NOT NULL AND conversion_idempotency_key IS NOT NULL AND "
    "conversion_request_fingerprint IS NOT NULL) OR "
    "(status <> 'cerrado' AND converted_customer_id IS NULL AND converted_at IS NULL "
    "AND conversion_idempotency_key IS NULL AND conversion_request_fingerprint IS NULL)"
)


def upgrade() -> None:
    op.drop_constraint(op.f("ck_crm_leads_conversion_state_consistent"), "crm_leads", type_="check")
    op.create_check_constraint(
        op.f("ck_crm_leads_conversion_state_consistent"),
        "crm_leads",
        _CONVERSION_STATE_SQL,
    )
    op.drop_index("uq_crm_leads_workspace_converted_customer", table_name="crm_leads")
    op.create_index(
        "ix_crm_leads_workspace_converted_customer",
        "crm_leads",
        ["workspace_id", "converted_customer_id"],
        unique=False,
        postgresql_where=sa.text("converted_customer_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_crm_leads_workspace_converted_customer", table_name="crm_leads")
    op.create_index(
        "uq_crm_leads_workspace_converted_customer",
        "crm_leads",
        ["workspace_id", "converted_customer_id"],
        unique=True,
        postgresql_where=sa.text("converted_customer_id IS NOT NULL"),
    )
    op.drop_constraint(op.f("ck_crm_leads_conversion_state_consistent"), "crm_leads", type_="check")
    op.create_check_constraint(
        op.f("ck_crm_leads_conversion_state_consistent"),
        "crm_leads",
        _LEGACY_CONVERSION_STATE_SQL,
    )
