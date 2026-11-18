"""Cheko → Franchesko Columna: wipe, clientes desde agenda, citas y finanzas."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import defaultdict
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.catalog import ItemCategory
from app.db.session import session_scope
from app.scripts.cheko.agenda_convert import (
    build_appointment_import_items,
    build_customer_import_items,
    customer_import_payload,
)
from app.scripts.cheko.branches import resolve_charm_branch_map
from app.scripts.cheko.cabinas import ensure_charm_appointment_resources
from app.scripts.cheko.categories_sync import ensure_expense_categories
from app.scripts.cheko.context import (
    CHEKO_ROOT,
    FOLDER_TO_CHEKO_BRANCH,
    load_cheko_context,
    load_json,
)
from app.scripts.cheko.parsers import (
    FinanceTransactionRow,
    find_finance_report,
    parse_finance_report_markdown,
)
from app.scripts.cheko.principal import load_import_principal
from app.scripts.cheko.selective_wipe import selective_wipe
from app.services.agenda import AgendaService
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import ConflictError
from app.services.finance import FinanceService
from app.services.master_data import MasterDataService

WORKSPACE_ID = UUID("01a117e6-944e-75f4-a6dc-68907a10fa8c")
CONFIRMATION_SLUG = "franchesko-columna"
MEMBERSHIP_ID = UUID("01a117e6-94a6-7111-8295-5aa943260a8c")

INCOME_CATEGORY_MAP = {
    "tarjeta": "tarjeta",
    "transferencias bancarias": "transferencia",
    "link de pago": "link",
    "efectivo": "efectivo",
    "general": "servicios",
}

CHUNK_CUSTOMERS = 50
CHUNK_APPOINTMENTS = 100
CHUNK_FINANCE = 1


def _idempotency(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:40]
    return f"{prefix}-{digest}"


def _finance_folders() -> list[tuple[str, Path]]:
    fin = CHEKO_ROOT / "finanzas"
    return [
        (name, fin / name)
        for name in ("charm-dn", "charm-sde", "charm-stgo")
        if (fin / name).is_dir()
    ]


def _category_name_map(session: Session, workspace_id: UUID) -> dict[str, UUID]:
    rows = session.scalars(
        select(ItemCategory).where(
            ItemCategory.workspace_id == workspace_id,
            ItemCategory.category_kind == "expense",
            ItemCategory.status == "active",
        )
    ).all()
    return {row.normalized_name: row.id for row in rows}


def _resolve_expense_category(
    name: str,
    by_name: dict[str, UUID],
) -> tuple[str, UUID | None]:
    norm = name.casefold().strip()
    cid = by_name.get(norm)
    if cid is not None:
        return "otros", cid
    return "otros", None


def _income_category(category: str) -> str:
    norm = category.casefold().strip()
    return INCOME_CATEGORY_MAP.get(norm, "servicios")


def run_wipe(session: Session) -> dict[str, int]:
    return selective_wipe(session, WORKSPACE_ID, confirmation_slug=CONFIRMATION_SLUG)


def run_customers(charm_branches: dict[str, UUID]) -> dict[str, int]:
    items = build_customer_import_items()
    by_branch_set: dict[frozenset[UUID], list[dict[str, object]]] = defaultdict(list)
    for raw in items:
        cheko_ids = raw.get("cheko_branch_ids") or set()
        if not isinstance(cheko_ids, set):
            continue
        diedo_ids = frozenset(
            charm_branches[cheko_id] for cheko_id in cheko_ids if cheko_id in charm_branches
        )
        if not diedo_ids:
            continue
        by_branch_set[diedo_ids].append(customer_import_payload(raw))
    flat_items = [item for group in by_branch_set.values() for item in group]
    stats = {"total": len(flat_items), "created": 0, "updated": 0, "failed": 0}
    for branch_ids, group_items in by_branch_set.items():
        for offset in range(0, len(group_items), CHUNK_CUSTOMERS):
            chunk = group_items[offset : offset + CHUNK_CUSTOMERS]
            with session_scope() as session:
                principal = load_import_principal(
                    session, workspace_id=WORKSPACE_ID, membership_id=MEMBERSHIP_ID
                )
                auth = AuthorizationService(session)
                grant = auth.require_permission(principal, "customer.manage")
                rows = MasterDataService(session).import_customers(
                    principal=principal,
                    grant=grant,
                    branch_ids=set(branch_ids),
                    items=chunk,
                )
                for row in rows:
                    status = row.get("status")
                    if status == "created":
                        stats["created"] += 1
                    elif status == "updated":
                        stats["updated"] += 1
                    elif status == "failed":
                        stats["failed"] += 1
    return stats


def run_agenda(charm_branches: dict[str, UUID]) -> dict[str, Any]:
    summary: dict[str, Any] = {}
    for folder, cheko_branch in FOLDER_TO_CHEKO_BRANCH.items():
        branch_id = charm_branches[cheko_branch]
        items = build_appointment_import_items(folder)
        stats = {"total": len(items), "created": 0, "skipped": 0, "failed": 0}
        with session_scope() as session:
            ensure_charm_appointment_resources(
                session,
                workspace_id=WORKSPACE_ID,
                diedo_branch_id=branch_id,
                cheko_branch_id=cheko_branch,
            )
            session.commit()
        for offset in range(0, len(items), CHUNK_APPOINTMENTS):
            chunk = items[offset : offset + CHUNK_APPOINTMENTS]
            with session_scope() as session:
                principal = load_import_principal(
                    session, workspace_id=WORKSPACE_ID, membership_id=MEMBERSHIP_ID
                )
                auth = AuthorizationService(session)
                grant = auth.require_permission(principal, "appointment.manage")
                rows = AgendaService(session).import_appointments(
                    principal=principal,
                    grant=grant,
                    branch_id=branch_id,
                    items=chunk,
                    sync_customers=False,
                )
                for row in rows:
                    status = row.get("status")
                    if status == "created":
                        stats["created"] += 1
                    elif status == "skipped":
                        stats["skipped"] += 1
                    else:
                        stats["failed"] += 1
        summary[folder] = stats
    return summary


def _import_expense_rows(
    session: Session,
    principal: AuthPrincipal,
    grant: PermissionGrant,
    fin: FinanceService,
    rows: list[FinanceTransactionRow],
    branch_id: UUID,
    cat_by_name: dict[str, UUID],
    prefix: str,
    *,
    start_index: int = 0,
) -> int:
    count = 0
    for index, row in enumerate(rows):
        global_index = start_index + index
        cat_slug, cat_id = _resolve_expense_category(row.category, cat_by_name)
        values = {
            "concept": row.description[:240],
            "amount": row.amount,
            "category": cat_slug,
            "category_id": cat_id,
            "date": row.row_date,
            "branch_id": branch_id,
            "status": "pagado",
        }
        fin.create_expense(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key=_idempotency(
                prefix,
                str(row.row_date),
                row.description,
                str(row.amount),
                str(global_index),
            ),
        )
        count += 1
    return count


def _import_income_rows(
    session: Session,
    principal: AuthPrincipal,
    grant: PermissionGrant,
    fin: FinanceService,
    rows: list[FinanceTransactionRow],
    branch_id: UUID,
    prefix: str,
    *,
    start_index: int = 0,
) -> int:
    count = 0
    for index, row in enumerate(rows):
        global_index = start_index + index
        values = {
            "category": _income_category(row.category),
            "branch_id": branch_id,
            "amount": row.amount,
            "date": row.row_date,
            "customer": "",
            "source": "Importación Cheko",
            "status": "pagado",
            "concept": row.description[:200],
        }
        fin.create_manual_income(
            principal=principal,
            grant=grant,
            values=values,
            idempotency_key=_idempotency(
                prefix,
                "inc",
                str(row.row_date),
                row.description,
                str(row.amount),
                str(global_index),
            ),
        )
        count += 1
    return count


def _import_finance_chunk(
    importer: Callable[..., int],
    rows: list[Any],
    *,
    start_index: int,
    branch_id: UUID,
    prefix: str,
) -> int:
    if not rows:
        return 0
    with session_scope() as session:
        principal = load_import_principal(
            session, workspace_id=WORKSPACE_ID, membership_id=MEMBERSHIP_ID
        )
        auth = AuthorizationService(session)
        grant = auth.require_permission(principal, "finance.manage")
        fin = FinanceService(session)
        cat_by_name = _category_name_map(session, WORKSPACE_ID)
        if importer is _import_expense_rows:
            return importer(
                session,
                principal,
                grant,
                fin,
                rows,
                branch_id,
                cat_by_name,
                prefix,
                start_index=start_index,
            )
        return importer(
            session,
            principal,
            grant,
            fin,
            rows,
            branch_id,
            prefix,
            start_index=start_index,
        )


def run_finance(
    charm_branches: dict[str, UUID],
    cheko_category_map: dict[str, UUID],
) -> dict[str, Any]:
    summary: dict[str, Any] = {}

    for folder, folder_path in _finance_folders():
        cheko_branch = FOLDER_TO_CHEKO_BRANCH[folder]
        branch_id = charm_branches[cheko_branch]

        gastos_md = find_finance_report(folder_path, "Gastos") or find_finance_report(
            folder_path, "gastos"
        )
        ingresos_md: Path | None = find_finance_report(folder_path, "Ingresos")
        if ingresos_md is None and folder == "charm-dn":
            dn_fallback = folder_path / "ingresos-charm-dn.md"
            ingresos_md = dn_fallback if dn_fallback.is_file() else None
        elif ingresos_md is not None and not ingresos_md.is_file():
            ingresos_md = find_finance_report(folder_path, "Ingresos")

        exp_rows = parse_finance_report_markdown(gastos_md) if gastos_md is not None else []
        inc_rows = (
            parse_finance_report_markdown(ingresos_md)
            if ingresos_md is not None and ingresos_md.is_file()
            else []
        )

        exp_count = 0
        for offset in range(0, len(exp_rows), CHUNK_FINANCE):
            chunk = exp_rows[offset : offset + CHUNK_FINANCE]
            exp_count += _import_finance_chunk(
                _import_expense_rows,
                chunk,
                start_index=offset,
                branch_id=branch_id,
                prefix=f"cheko-{folder}-exp",
            )
            if (offset + 1) % 25 == 0 or offset + len(chunk) >= len(exp_rows):
                exp_done = min(offset + len(chunk), len(exp_rows))
                _log(f"  {folder} egresos {exp_done}/{len(exp_rows)}")

        inc_count = 0
        for offset in range(0, len(inc_rows), CHUNK_FINANCE):
            chunk = inc_rows[offset : offset + CHUNK_FINANCE]
            inc_count += _import_finance_chunk(
                _import_income_rows,
                chunk,
                start_index=offset,
                branch_id=branch_id,
                prefix=f"cheko-{folder}-inc",
            )
            if (offset + 1) % 25 == 0 or offset + len(chunk) >= len(inc_rows):
                inc_done = min(offset + len(chunk), len(inc_rows))
                _log(f"  {folder} ingresos {inc_done}/{len(inc_rows)}")

        fixed_path = folder_path / "gasto-fijo.json"
        fixed_count = 0
        if fixed_path.is_file():
            for row in load_json(fixed_path):
                cat_id = cheko_category_map.get(str(row.get("categoria_id")))
                values: dict[str, Any] = {
                    "concept": (row.get("nombre") or row.get("categoria_nombre") or "Gasto fijo")[
                        :240
                    ],
                    "amount": Decimal(str(row.get("monto"))),
                    "branch_id": branch_id,
                    "day_of_month": int(row.get("dia_pago") or 1),
                    "category": "otros",
                }
                if cat_id is not None:
                    values["category_id"] = cat_id
                with session_scope() as session:
                    principal = load_import_principal(
                        session, workspace_id=WORKSPACE_ID, membership_id=MEMBERSHIP_ID
                    )
                    auth = AuthorizationService(session)
                    grant = auth.require_permission(principal, "finance.manage")
                    fin = FinanceService(session)
                    fin.create_fixed_expense(
                        principal=principal,
                        grant=grant,
                        values=values,
                        idempotency_key=_idempotency(
                            "cheko-fixed",
                            folder,
                            str(row.get("id")),
                        ),
                    )
                fixed_count += 1

        liab_path = folder_path / "liabilities.json"
        liab_count = 0
        if liab_path.is_file():
            for row in load_json(liab_path):
                pending = Decimal(str(row.get("monto_pendiente")))
                base_name = (row.get("nombre") or "Pasivo").strip()
                cheko_id = str(row.get("id") or "")[:8]
                name = f"{base_name} [Cheko {cheko_id}]" if cheko_id else base_name
                values = {
                    "name": name[:200],
                    "type": "prestamo",
                    "initial_amount": pending,
                    "pending_amount": pending,
                    "branch_id": branch_id,
                    "pay_day": 1,
                    "category_ids": ["otros"],
                }
                with session_scope() as session:
                    principal = load_import_principal(
                        session, workspace_id=WORKSPACE_ID, membership_id=MEMBERSHIP_ID
                    )
                    auth = AuthorizationService(session)
                    grant = auth.require_permission(principal, "finance.manage")
                    fin = FinanceService(session)
                    try:
                        fin.create_liability(
                            principal=principal,
                            grant=grant,
                            values=values,
                            idempotency_key=_idempotency("cheko-liab", folder, str(row.get("id"))),
                        )
                        liab_count += 1
                    except ConflictError as exc:
                        _log(f"  {folder} pasivo omitido ({name[:40]}): {exc}")

        summary[folder] = {
            "expenses": exp_count,
            "incomes": inc_count,
            "fixed": fixed_count,
            "liabilities": liab_count,
        }
        _log(
            f"  {folder}: egresos={exp_count}, ingresos={inc_count}, "
            f"fijos={fixed_count}, pasivos={liab_count}"
        )
    return summary


def _log(message: str) -> None:
    print(message, flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--steps",
        nargs="+",
        default=["wipe", "categories", "customers", "agenda", "finance"],
        choices=["wipe", "categories", "customers", "agenda", "finance", "preview"],
    )
    parser.add_argument("--dry-run", action="store_true", help="Solo preview, sin escribir en BD.")
    args = parser.parse_args()

    if "preview" in args.steps:
        customers = build_customer_import_items()
        agenda_totals = {
            folder: len(build_appointment_import_items(folder)) for folder in FOLDER_TO_CHEKO_BRANCH
        }
        print(
            json.dumps(
                {"customers_unique": len(customers), "agenda_by_branch": agenda_totals},
                indent=2,
            )
        )
        if args.steps == ["preview"]:
            return

    ctx = load_cheko_context()
    report: dict[str, Any] = {}

    with session_scope() as session:
        charm_branches = resolve_charm_branch_map(session, WORKSPACE_ID, ctx)
        report["diedo_branches"] = {k: str(v) for k, v in charm_branches.items()}

    if args.dry_run:
        print(json.dumps(report, indent=2, default=str))
        return

    if "wipe" in args.steps:
        _log("Paso wipe...")
        with session_scope() as session:
            report["wipe"] = run_wipe(session)
        _log(f"Wipe listo: {report['wipe']}")

    cheko_category_map: dict[str, UUID] = {}
    if "categories" in args.steps or "finance" in args.steps:
        _log("Sincronizando categorías de egreso Cheko...")
        with session_scope() as session:
            cheko_category_map = ensure_expense_categories(session, WORKSPACE_ID, ctx)
            report["expense_categories"] = len(cheko_category_map)
        _log(f"Categorías mapeadas: {len(cheko_category_map)}")

    if "customers" in args.steps:
        _log("Importando clientes...")
        report["customers"] = run_customers(charm_branches)
        _log(f"Clientes: {report['customers']}")

    if "agenda" in args.steps:
        _log("Importando citas...")
        report["agenda"] = run_agenda(charm_branches)
        _log(f"Citas: {report['agenda']}")

    if "finance" in args.steps:
        _log("Importando finanzas...")
        report["finance"] = run_finance(charm_branches, cheko_category_map)
        _log(f"Finanzas: {report['finance']}")

    out = Path(__file__).resolve().parents[1] / ".local" / "cheko-import-report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps(report, indent=2, default=str))
    print(f"Reporte: {out}")


if __name__ == "__main__":
    main()
    sys.exit(0)
