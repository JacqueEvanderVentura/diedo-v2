"""Read-only inventory for selective workspace wipe (clients, agenda, finances).

Usage (production or QA — set DATABASE_URL first):

    python -m app.scripts.workspace_selective_wipe_dry_run \\
        --workspace-id 01a117e6-944e-75f4-a6dc-68907a10fa8c \\
        --expected-slug franchesko-columna

Optional: write storage keys for later blob purge to a JSON file (not printed in full):

    python -m app.scripts.workspace_selective_wipe_dry_run ... \\
        --storage-keys-out /tmp/charm-wipe-storage-keys.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import session_scope

WORKSPACE_COUNTS: list[tuple[str, str]] = [
    # Finance / POS
    ("document_attachments", "document_attachments"),
    ("payment_proofs", "payment_proofs"),
    ("finance_pos_income_corrections", "finance_pos_income_corrections"),
    ("cash_movement_lines", "cash_movement_lines"),
    ("cash_movements", "cash_movements"),
    ("customer_receivable_lines", "customer_receivable_lines"),
    ("customer_payments", "customer_payments"),
    ("customer_receivables", "customer_receivables"),
    ("sale_tender_lines", "sale_tender_lines"),
    ("sale_lines", "sale_lines"),
    ("sales", "sales"),
    ("sales_quote_lines", "sales_quote_lines"),
    ("sales_quote_revisions", "sales_quote_revisions"),
    ("sales_quotes", "sales_quotes"),
    ("cash_registers", "cash_registers"),
    ("finance_fixed_expense_payments", "finance_fixed_expense_payments"),
    ("finance_fixed_expenses", "finance_fixed_expenses"),
    ("finance_expenses", "finance_expenses"),
    ("finance_manual_incomes", "finance_manual_incomes"),
    ("finance_budgets", "finance_budgets"),
    ("finance_accounts", "finance_accounts"),
    ("finance_liabilities", "finance_liabilities"),
    ("carwash_settlement_details", "carwash_settlement_details"),
    ("carwash_settlements", "carwash_settlements"),
    ("carwash_commissions", "carwash_commissions"),
    ("carwash_wash_lines", "carwash_wash_lines"),
    ("carwash_washes", "carwash_washes"),
    # Agenda
    ("appointment_events", "appointment_events"),
    ("appointments", "appointments"),
    # Clients / CRM
    ("portal_task_completions", "portal_task_completions"),
    ("crm_activities", "crm_activities"),
    ("crm_leads", "crm_leads"),
    ("customer_crm_profiles", "customer_crm_profiles"),
    ("customer_branch_assignments", "customer_branch_assignments"),
    ("customers", "customers"),
]

CONDITIONAL_COUNTS: list[tuple[str, str, str]] = [
    (
        "document_attachments_finance_expense",
        "document_attachments",
        "finance_expense_id IS NOT NULL",
    ),
    (
        "document_attachments_fixed_expense",
        "document_attachments",
        "finance_fixed_expense_id IS NOT NULL",
    ),
    (
        "document_attachments_manual_income",
        "document_attachments",
        "finance_manual_income_id IS NOT NULL",
    ),
    (
        "document_attachments_cash_movement",
        "document_attachments",
        "cash_movement_id IS NOT NULL",
    ),
    (
        "document_attachments_purchase_request",
        "document_attachments",
        "purchase_request_id IS NOT NULL",
    ),
    ("email_notifications_appointment", "email_notifications", "appointment_id IS NOT NULL"),
    ("inventory_movements_appointment", "inventory_movements", "appointment_id IS NOT NULL"),
    ("attachments_customer", "attachments", "customer_id IS NOT NULL"),
    ("purchase_requests_linked_expense", "purchase_requests", "finance_expense_id IS NOT NULL"),
]

PRESERVE_COUNTS: list[tuple[str, str]] = [
    ("branches", "branches"),
    ("employees", "employees"),
    ("items", "items"),
    ("appointment_resources", "appointment_resources"),
    ("suppliers", "suppliers"),
]

STORAGE_KEY_QUERIES: list[tuple[str, str]] = [
    (
        "document_attachments_finance",
        """
        SELECT storage_key FROM document_attachments
        WHERE workspace_id = :ws
          AND (
            finance_expense_id IS NOT NULL
            OR finance_fixed_expense_id IS NOT NULL
            OR finance_manual_income_id IS NOT NULL
            OR cash_movement_id IS NOT NULL
          )
        ORDER BY storage_key
        """,
    ),
    (
        "payment_proofs",
        "SELECT storage_key FROM payment_proofs WHERE workspace_id = :ws ORDER BY storage_key",
    ),
    (
        "attachments_customer",
        """
        SELECT storage_key FROM attachments
        WHERE workspace_id = :ws AND customer_id IS NOT NULL
        ORDER BY storage_key
        """,
    ),
]


def _table_exists(session: Session, table: str) -> bool:
    row = session.execute(
        text("SELECT to_regclass(:name) IS NOT NULL AS ok"),
        {"name": table},
    ).one()
    return bool(row.ok)


def _count_workspace(session: Session, table: str, workspace_id: UUID) -> int | None:
    if not _table_exists(session, table):
        return None
    result = session.execute(
        text(f"SELECT count(*)::int AS c FROM {table} WHERE workspace_id = :ws"),
        {"ws": workspace_id},
    ).one()
    return int(result.c)


def _count_conditional(
    session: Session, table: str, condition: str, workspace_id: UUID
) -> int | None:
    if not _table_exists(session, table):
        return None
    result = session.execute(
        text(f"SELECT count(*)::int AS c FROM {table} WHERE workspace_id = :ws AND {condition}"),
        {"ws": workspace_id},
    ).one()
    return int(result.c)


def run_dry_run(
    workspace_id: UUID,
    *,
    expected_slug: str | None,
    storage_keys_out: Path | None,
) -> dict[str, Any]:
    with session_scope() as session:
        session.execute(text("SET default_transaction_read_only = ON"))
        ws_row = (
            session.execute(
                text("SELECT id::text, slug, name, version FROM workspaces WHERE id = :ws"),
                {"ws": workspace_id},
            )
            .mappings()
            .first()
        )
        if ws_row is None:
            raise SystemExit(f"Workspace not found: {workspace_id}")

        slug_ok = (
            expected_slug is None or str(ws_row["slug"]).lower() == expected_slug.strip().lower()
        )
        if expected_slug and not slug_ok:
            raise SystemExit(f"Slug mismatch: expected {expected_slug!r}, got {ws_row['slug']!r}")

        table_counts: dict[str, int | None] = {}
        for label, table in WORKSPACE_COUNTS:
            table_counts[label] = _count_workspace(session, table, workspace_id)

        conditional: dict[str, int | None] = {}
        for label, table, cond in CONDITIONAL_COUNTS:
            conditional[label] = _count_conditional(session, table, cond, workspace_id)

        preserve: dict[str, int | None] = {}
        for label, table in PRESERVE_COUNTS:
            preserve[label] = _count_workspace(session, table, workspace_id)

        counter_row = (
            session.execute(
                text(
                    """
                SELECT last_quote_value, last_sale_value, last_receivable_value
                FROM sales_document_counters WHERE workspace_id = :ws
                """
                ),
                {"ws": workspace_id},
            )
            .mappings()
            .first()
        )

        storage_inventory: dict[str, Any] = {}
        all_keys: list[str] = []
        for label, query in STORAGE_KEY_QUERIES:
            if label.startswith("document_attachments"):
                if not _table_exists(session, "document_attachments"):
                    storage_inventory[label] = {"count": 0, "sample_keys": []}
                    continue
            elif label == "payment_proofs" and not _table_exists(session, "payment_proofs"):
                storage_inventory[label] = {"count": 0, "sample_keys": []}
                continue
            elif label == "attachments_customer" and not _table_exists(session, "attachments"):
                storage_inventory[label] = {"count": 0, "sample_keys": []}
                continue

            keys = list(session.execute(text(query), {"ws": workspace_id}).scalars().all())
            storage_inventory[label] = {
                "count": len(keys),
                "sample_keys": keys[:5],
            }
            all_keys.extend(keys)

        if storage_keys_out is not None:
            storage_keys_out.parent.mkdir(parents=True, exist_ok=True)
            storage_keys_out.write_text(
                json.dumps(
                    {
                        "workspace_id": str(workspace_id),
                        "slug": ws_row["slug"],
                        "storage_keys": sorted(set(all_keys)),
                        "by_category": storage_inventory,
                    },
                    indent=2,
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

        return {
            "workspace": dict(ws_row),
            "slug_confirmed": slug_ok,
            "table_counts": table_counts,
            "conditional_counts": conditional,
            "preserve_counts": preserve,
            "sales_document_counters": dict(counter_row) if counter_row else None,
            "storage_inventory": storage_inventory,
            "storage_keys_total_unique": len(set(all_keys)),
            "storage_keys_out": str(storage_keys_out) if storage_keys_out else None,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-id", type=UUID, required=True)
    parser.add_argument("--expected-slug", default=None)
    parser.add_argument("--storage-keys-out", type=Path, default=None)
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON only")
    args = parser.parse_args()

    report = run_dry_run(
        args.workspace_id,
        expected_slug=args.expected_slug,
        storage_keys_out=args.storage_keys_out,
    )

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return

    # human summary
    ws = report["workspace"]
    print(f"Workspace: {ws['name']} ({ws['slug']}) — id {ws['id']}, version {ws['version']}")
    print(f"Slug check: {'OK' if report['slug_confirmed'] else 'FAILED'}")
    print("\n=== Wipe scope (counts) ===")
    for key, value in report["table_counts"].items():
        display = "—" if value is None else str(value)
        print(f"  {key}: {display}")
    print("\n=== Conditional ===")
    for key, value in report["conditional_counts"].items():
        display = "—" if value is None else str(value)
        print(f"  {key}: {display}")
    print("\n=== Preserve (must stay >0 for active tenant) ===")
    for key, value in report["preserve_counts"].items():
        display = "—" if value is None else str(value)
        print(f"  {key}: {display}")
    print("\n=== sales_document_counters ===")
    print(report["sales_document_counters"])
    print("\n=== Storage (counts; samples in JSON) ===")
    for key, meta in report["storage_inventory"].items():
        print(f"  {key}: {meta['count']} (samples: {len(meta['sample_keys'])})")
    total_keys = report["storage_keys_total_unique"]
    print(f"\nUnique storage keys (finance + proofs + customer attachments): {total_keys}")
    if report["storage_keys_out"]:
        print(f"Full key list written to: {report['storage_keys_out']}")


if __name__ == "__main__":
    main()
    sys.exit(0)
