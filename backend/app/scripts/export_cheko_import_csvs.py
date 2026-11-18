"""Export Diedo-ready CSVs from Cheko agenda JSON (UI import in Configuración)."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from app.scripts.cheko.agenda_convert import (
    build_appointment_import_items,
    build_appointment_import_items_from_path,
    build_customer_import_items,
    build_customer_import_items_from_path,
    customer_import_payload,
    customers_for_cheko_folder,
)
from app.scripts.cheko.context import AGENDA_FILES, CHEKO_ROOT, EXTRA_AGENDA_EXPORTS

CUSTOMER_HEADERS = [
    "externalId",
    "customerType",
    "displayName",
    "firstName",
    "lastName",
    "businessName",
    "email",
    "phone",
    "documentType",
    "documentId",
    "acquisitionSource",
]

AGENDA_HEADERS = [
    "externalId",
    "date",
    "time",
    "duration",
    "customerName",
    "customerPhone",
    "customerEmail",
    "documentType",
    "documentId",
    "serviceName",
    "resourceName",
    "specialistName",
    "price",
    "notes",
]

CUSTOMER_KEY_MAP = {
    "external_id": "externalId",
    "customer_type": "customerType",
    "display_name": "displayName",
    "first_name": "firstName",
    "last_name": "lastName",
    "business_name": "businessName",
    "acquisition_source": "acquisitionSource",
}

AGENDA_KEY_MAP = {
    "external_id": "externalId",
    "customer_name": "customerName",
    "customer_phone": "customerPhone",
    "customer_email": "customerEmail",
    "document_type": "documentType",
    "document_id": "documentId",
    "service_name": "serviceName",
    "resource_name": "resourceName",
    "specialist_name": "specialistName",
}


def _row_to_csv(item: dict[str, object], key_map: dict[str, str]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in item.items():
        csv_key = key_map.get(key, key)
        if csv_key not in CUSTOMER_HEADERS and csv_key not in AGENDA_HEADERS:
            continue
        if value is None:
            out[csv_key] = ""
        else:
            out[csv_key] = str(value)
    return out


def _sort_agenda_items(items: list[dict[str, object]]) -> list[dict[str, object]]:
    return sorted(
        items,
        key=lambda item: (str(item.get("date") or ""), str(item.get("time") or "")),
    )


def _write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({h: row.get(h, "") for h in headers})
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=CHEKO_ROOT / "out",
        help="Directorio de salida (default: cheko-massive-import/out)",
    )
    args = parser.parse_args()
    out_dir = args.out_dir

    customer_items = build_customer_import_items()
    customers = [
        _row_to_csv(customer_import_payload(item), CUSTOMER_KEY_MAP) for item in customer_items
    ]
    cust_path = out_dir / "customers-from-agenda.csv"
    cust_count = _write_csv(cust_path, CUSTOMER_HEADERS, customers)

    per_branch_counts: dict[str, int] = {}
    customers_csv: dict[str, str] = {}
    for folder in AGENDA_FILES:
        branch_items = customers_for_cheko_folder(customer_items, folder)
        branch_rows = [_row_to_csv(item, CUSTOMER_KEY_MAP) for item in branch_items]
        branch_path = out_dir / f"customers-{folder}.csv"
        per_branch_counts[folder] = _write_csv(branch_path, CUSTOMER_HEADERS, branch_rows)
        customers_csv[folder] = str(branch_path)

    sde_update_path = EXTRA_AGENDA_EXPORTS.get("sde-update")

    agenda_totals: dict[str, int] = {}
    for folder in AGENDA_FILES:
        items = build_appointment_import_items(folder)
        if folder == "charm-sde" and sde_update_path is not None and sde_update_path.is_file():
            items = [*items, *build_appointment_import_items_from_path(sde_update_path)]
        items = _sort_agenda_items(items)
        rows = [_row_to_csv(item, AGENDA_KEY_MAP) for item in items]
        path = out_dir / f"agenda-{folder}.csv"
        agenda_totals[folder] = _write_csv(path, AGENDA_HEADERS, rows)

    extra_agenda_csv: dict[str, str] = {}
    extra_agenda_rows: dict[str, int] = {}
    extra_customers_csv: dict[str, str] = {}
    extra_customers_rows: dict[str, int] = {}
    for label, json_path in EXTRA_AGENDA_EXPORTS.items():
        if not json_path.is_file():
            continue
        appt_items = _sort_agenda_items(build_appointment_import_items_from_path(json_path))
        appt_rows = [_row_to_csv(item, AGENDA_KEY_MAP) for item in appt_items]
        appt_path = out_dir / f"agenda-{label}.csv"
        extra_agenda_rows[label] = _write_csv(appt_path, AGENDA_HEADERS, appt_rows)
        extra_agenda_csv[label] = str(appt_path)

        cust_items = build_customer_import_items_from_path(json_path)
        cust_rows = [
            _row_to_csv(customer_import_payload(item), CUSTOMER_KEY_MAP) for item in cust_items
        ]
        extra_cust_path = out_dir / f"customers-{label}.csv"
        extra_customers_rows[label] = _write_csv(extra_cust_path, CUSTOMER_HEADERS, cust_rows)
        extra_customers_csv[label] = str(extra_cust_path)

    manifest = {
        "customers_csv": str(out_dir / "customers-from-agenda.csv"),
        "customers_rows": cust_count,
        "customers_by_branch_csv": customers_csv,
        "customers_by_branch_rows": per_branch_counts,
        "agenda_csv": {k: str(out_dir / f"agenda-{k}.csv") for k in AGENDA_FILES},
        "agenda_rows": agenda_totals,
        "extra_agenda_csv": extra_agenda_csv,
        "extra_agenda_rows": extra_agenda_rows,
        "extra_customers_csv": extra_customers_csv,
        "extra_customers_rows": extra_customers_rows,
        "import_notes": [
            "Clientes (UI): customers-charm-dn/sde/stgo.csv — una sucursal por archivo.",
            "customers-from-agenda.csv es referencia combinada; no importar una sola vez a DN.",
            "Citas: agenda-charm-*.csv — misma sucursal que el CSV de clientes; "
            "agenda-charm-sde.csv incluye también el batch sde-update.",
            "syncCustomers: desactivado — importar clientes antes de citas.",
            "Batches extra (p. ej. sde-update): customers-{label}.csv luego "
            "agenda-{label}.csv en Charm SDE.",
        ],
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    print(f"\nArchivos en: {out_dir.resolve()}")


if __name__ == "__main__":
    main()
    sys.exit(0)
