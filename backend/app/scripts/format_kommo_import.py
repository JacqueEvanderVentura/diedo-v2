"""Transform Kommo exports into Diedo CRM import CSVs (offline, no API)."""

from __future__ import annotations

import argparse
import csv
import re
from datetime import UTC, datetime
from pathlib import Path

STAGE_MAP = {
    "incoming leads": "nuevo",
    "contacto inicial": "contactado",
    "precalificar": "contactado",
    "visita en tienda": "propuesta",
    "levantamiento": "negociacion",
    "cotización/seguimiento": "negociacion",
    "cotizacion/seguimiento": "negociacion",
    "cotización aprobada": "negociacion",
    "cotizacion aprobada": "negociacion",
    "reajustes": "negociacion",
    "venta lograda": "cerrado",
    "venta perdido": "perdido",
}

ACQUISITION_MAP = {
    "whatsapp": "whatsapp",
    "instagram": "instagram",
    "referral": "referral",
    "referido": "referral",
}


def normalize_phone(value: str | None) -> str:
    if not value:
        return ""
    cleaned = value.strip().strip("'")
    if "," in cleaned:
        cleaned = cleaned.split(",", 1)[0].strip()
    return cleaned


def normalize_stage(raw: str) -> tuple[str, str, bool]:
    key = (raw or "").strip().lower()
    stage = STAGE_MAP.get(key, "contactado")
    lost = "Otro motivo" if stage == "perdido" else ""
    convert = stage == "cerrado"
    return stage, lost, convert


def map_acquisition(raw: str | None) -> str:
    if not raw:
        return "otros"
    key = raw.strip().lower()
    return ACQUISITION_MAP.get(key, "otros")


def join_notes(row: dict, prefix_keys: tuple[str, ...]) -> str:
    parts: list[str] = []
    for key in prefix_keys:
        value = (row.get(key) or "").strip()
        if value:
            parts.append(value)
    text = "\n".join(parts)
    return text[:2000]


def pick_phone(row: dict) -> str:
    for key in (
        "Teléfono celular",
        "Teléfono oficina",
        "Otro teléfono",
        "Teléfono de casa",
        "Teléfono oficina directo",
    ):
        phone = normalize_phone(row.get(key))
        if phone:
            return phone[:40]
    return ""


def pick_email(row: dict) -> str:
    for key in ("Correo", "E-mail priv.", "Otro e-mail"):
        value = (row.get(key) or "").strip()
        if value and "@" in value:
            return value
    return ""


def pick_misplaced_email_text(row: dict) -> str:
    """Kommo sometimes stores free text in email columns (e.g. visit notes)."""
    for key in ("Correo", "E-mail priv.", "Otro e-mail"):
        value = (row.get(key) or "").strip()
        if value and "@" not in value:
            return value
    return ""


def parse_ics_tasks(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        return []
    text = path.read_text(encoding="utf-8")
    blocks = text.split("BEGIN:VEVENT")
    rows: list[dict[str, str]] = []
    for block in blocks[1:]:
        uid = re.search(r"^UID:(.+)$", block, re.M)
        contact = re.search(r"^CONTACT:(.+)$", block, re.M)
        summary = re.search(r"^SUMMARY:(.+)$", block, re.M)
        description = re.search(r"^DESCRIPTION:(.+)$", block, re.M)
        dtstart = re.search(r"^DTSTART:(.+)$", block, re.M)
        if not uid:
            continue
        contact_name = (contact.group(1) if contact else "").replace(". Contacto:", "").strip()
        due = ""
        if dtstart:
            raw = dtstart.group(1).strip()
            if raw.endswith("Z"):
                due = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC).isoformat()
        rows.append(
            {
                "externalId": uid.group(1).strip().split("@")[0],
                "contactName": contact_name,
                "title": (summary.group(1) if summary else "Seguimiento").replace("\\,", ","),
                "description": (
                    (description.group(1) if description else "").replace("\\n", "\n")[:2000]
                ),
                "dueAt": due,
            }
        )
    return rows


def format_kommo(source_dir: Path, output_dir: Path) -> None:
    leads_path = source_dir / "kommo_export_leads_2026-09-18.csv"
    contacts_path = source_dir / "kommo_export_contacts_and_companies_2026-09-18.csv"
    tasks_path = source_dir / "KommoTasks.ics"
    output_dir.mkdir(parents=True, exist_ok=True)

    pipeline_rows: list[dict[str, str]] = []
    pipeline_phones: set[str] = set()
    pipeline_names: set[str] = set()
    lead_id_to_name: dict[str, str] = {}

    with leads_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            external_id = (row.get("ID") or "").strip()
            name = (row.get("Nombre completo") or "").strip()
            company = (
                row.get("Compañía del contracto") or row.get("Compañía del lead") or ""
            ).strip()
            if not name and not company:
                name = (row.get("Nombre del lead") or "").strip()
            phone = pick_phone(row)
            email = pick_email(row)
            kommo_status = (row.get("Estatus del lead") or "").strip()
            stage, lost_reason, convert = normalize_stage(kommo_status)
            budget = (row.get("Presupuesto RD$") or "0").strip() or "0"
            notes = join_notes(row, ("Nota", "Nota 2", "Nota 3", "Nota 4", "Nota 5"))
            if kommo_status:
                kommo_line = f"Kommo: {kommo_status}"
                notes = "\n".join(part for part in (kommo_line, notes) if part)[:2000]
            misplaced_email = pick_misplaced_email_text(row)
            if misplaced_email:
                notes = "\n".join(part for part in (notes, misplaced_email) if part)[:2000]
            website = ""
            wa_user = (row.get("Nombre de usuario WA") or "").strip()
            if wa_user.startswith("http"):
                website = wa_user
            elif "instagram" in (row.get("Página web") or "").lower():
                website = (row.get("Página web") or "").strip()

            pipeline_rows.append(
                {
                    "externalId": external_id,
                    "name": name,
                    "company": company,
                    "email": email,
                    "phone": phone,
                    "website": website,
                    "location": (row.get("Dirección") or "").strip()[:240],
                    "acquisitionSource": map_acquisition(row.get("Fuente")),
                    "stage": stage,
                    "value": budget,
                    "notes": notes,
                    "lostReason": lost_reason,
                    "convert": "true" if convert else "false",
                }
            )
            if phone:
                pipeline_phones.add(phone)
            if name:
                pipeline_names.add(name.lower())
                lead_id_to_name[external_id] = name.lower()

    customer_rows: list[dict[str, str]] = []
    with contacts_path.open(encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            tipo = (row.get("Tipo") or "").strip().lower()
            external_id = (row.get("ID") or "").strip()
            if tipo.startswith("comp"):
                customer_rows.append(
                    {
                        "externalId": f"company-{external_id}",
                        "customerType": "business",
                        "displayName": (
                            row.get("Nombre de la compañía") or row.get("Nombre completo") or ""
                        ).strip(),
                        "firstName": "",
                        "lastName": "",
                        "businessName": (row.get("Nombre de la compañía") or "").strip(),
                        "email": pick_email(row),
                        "phone": pick_phone(row),
                        "acquisitionSource": "otros",
                    }
                )
                continue

            name = (row.get("Nombre completo") or "").strip()
            phone = pick_phone(row)
            if phone and phone in pipeline_phones:
                continue
            if name and name.lower() in pipeline_names:
                continue

            first = (row.get("Nombre") or "").strip()
            last = (row.get("Apellido") or "").strip()
            customer_rows.append(
                {
                    "externalId": f"contact-{external_id}",
                    "customerType": "person",
                    "displayName": name or f"{first} {last}".strip(),
                    "firstName": first,
                    "lastName": last,
                    "businessName": "",
                    "email": pick_email(row),
                    "phone": phone,
                    "acquisitionSource": "otros",
                }
            )

    activity_rows = parse_ics_tasks(tasks_path)
    name_to_lead_external: dict[str, str] = {v: k for k, v in lead_id_to_name.items()}
    for activity in activity_rows:
        contact = activity.get("contactName", "").lower()
        for lead_name, lead_ext in name_to_lead_external.items():
            if lead_name == contact or contact in lead_name or lead_name in contact:
                activity["leadExternalId"] = lead_ext
                break
        else:
            activity["leadExternalId"] = ""

    pipeline_fields = list(pipeline_rows[0].keys()) if pipeline_rows else []
    _write_csv(output_dir / "pipeline.csv", pipeline_fields, pipeline_rows)
    customer_fieldnames = [
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
    _write_csv(output_dir / "customers.csv", customer_fieldnames, customer_rows)
    activity_fieldnames = [
        "externalId",
        "leadExternalId",
        "contactName",
        "title",
        "description",
        "dueAt",
    ]
    _write_csv(output_dir / "activities.csv", activity_fieldnames, activity_rows)

    print(f"pipeline: {len(pipeline_rows)} rows -> {output_dir / 'pipeline.csv'}")
    print(f"customers: {len(customer_rows)} rows -> {output_dir / 'customers.csv'}")
    print(f"activities: {len(activity_rows)} rows -> {output_dir / 'activities.csv'}")


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=fieldnames,
            extrasaction="ignore",
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description="Format Kommo exports into Diedo CRM CSVs.")
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("importDataCortinaje"),
        help="Folder with Kommo CSV/ICS files",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("importDataCortinaje/diedo"),
        help="Output folder for Diedo CSVs",
    )
    args = parser.parse_args()
    format_kommo(args.source.resolve(), args.output.resolve())


if __name__ == "__main__":
    main()
