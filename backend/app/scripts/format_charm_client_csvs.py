"""Format Charm client exports to helios customer import template."""

from __future__ import annotations

import csv
import re
from pathlib import Path

FIELDNAMES = [
    "externalId",
    "customerType",
    "displayName",
    "firstName",
    "lastName",
    "businessName",
    "email",
    "phone",
    "acquisitionSource",
]


def _clean_phone(value: str) -> str:
    if not value:
        return ""
    text = value.strip()
    if text.startswith("'"):
        text = text[1:]
    text = text.replace('="', "").replace('"', "").replace("=", "")
    digits = re.sub(r"[^\d+]", "", text)
    if digits.startswith("+"):
        return digits
    if digits:
        return f"+{digits}" if not digits.startswith("+") else digits
    return ""


def _split_name(full_name: str) -> tuple[str, str, str]:
    display = " ".join(full_name.split())
    if not display:
        return "", "", ""
    parts = display.split(" ", 1)
    first = parts[0]
    last = parts[1] if len(parts) > 1 else ""
    return display, first, last


def _row_from_dn(row: dict[str, str]) -> dict[str, str]:
    external_id = (row.get("ID") or row.get("Id") or "").strip()
    display, first, last = _split_name(row.get("Name") or row.get("name") or "")
    return {
        "externalId": external_id,
        "customerType": "person",
        "displayName": display,
        "firstName": first,
        "lastName": last,
        "businessName": "",
        "email": (row.get("Email") or row.get("email") or "").strip(),
        "phone": _clean_phone(row.get("Phone") or row.get("phone") or ""),
        "acquisitionSource": "otros",
    }


def _row_from_stgo(row: dict[str, str]) -> dict[str, str]:
    external_id = (row.get("Id") or row.get("ID") or "").strip()
    display, first, last = _split_name(row.get("Name") or row.get("name") or "")
    phone = _clean_phone(row.get("Phone Number") or row.get("Phone") or "")
    if not phone:
        phone = _clean_phone(row.get("Secondary Phone") or "")
    return {
        "externalId": external_id,
        "customerType": "person",
        "displayName": display,
        "firstName": first,
        "lastName": last,
        "businessName": "",
        "email": (row.get("Email") or row.get("email") or "").strip(),
        "phone": phone,
        "acquisitionSource": "otros",
    }


def _write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDNAMES, quoting=csv.QUOTE_MINIMAL)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def format_charm_exports(repo_root: Path) -> tuple[Path, Path]:
    dn_source = repo_root / "Clients-charm-dn.csv"
    stgo_source = repo_root / "Clients-charm-stgo.csv"
    output_dir = repo_root / "formatted-imports"

    with dn_source.open(encoding="utf-8-sig", newline="") as handle:
        dn_rows = [_row_from_dn(row) for row in csv.DictReader(handle)]
    with stgo_source.open(encoding="utf-8-sig", newline="") as handle:
        stgo_rows = [_row_from_stgo(row) for row in csv.DictReader(handle)]

    dn_out = output_dir / "helios-crm-import-customers-charm-dn.csv"
    stgo_out = output_dir / "helios-crm-import-customers-charm-stgo.csv"
    _write_csv(dn_out, dn_rows)
    _write_csv(stgo_out, stgo_rows)
    return dn_out, stgo_out


def main() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    dn_out, stgo_out = format_charm_exports(repo_root)
    print(f"Wrote {dn_out}")
    print(f"Wrote {stgo_out}")


if __name__ == "__main__":
    main()
