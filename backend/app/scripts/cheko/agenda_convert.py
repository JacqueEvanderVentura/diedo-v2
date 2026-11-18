"""Build customer and appointment import payloads from Cheko agenda JSON."""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any

from app.scripts.cheko.cabinas import cheko_resource_name
from app.scripts.cheko.context import AGENDA_FILES, CHARM_CHEKO_BRANCH_IDS
from app.scripts.cheko.json_io import load_json_arrays

DEFAULT_APPOINTMENT_ID_PREFIX = "import-"
DEFAULT_CUSTOMER_ID_PREFIX = "import-"


def _duration_minutes(value: str | None) -> int:
    if not value:
        return 30
    parts = value.strip().split(":")
    if len(parts) >= 2:
        try:
            return int(parts[0]) * 60 + int(parts[1])
        except ValueError:
            pass
    return 30


def _time_hm(value: str | None) -> str:
    if not value:
        return "09:00"
    parts = value.strip().split(":")
    if len(parts) >= 2:
        return f"{parts[0].zfill(2)}:{parts[1].zfill(2)}"
    return "09:00"


def _phone(value: str | None) -> str:
    if not value:
        return ""
    return value.strip()


def _customer_key(row: dict[str, Any]) -> str:
    return str(row.get("client_id") or row.get("client_name") or "")


def iter_agenda_rows() -> Iterator[tuple[str, dict[str, Any]]]:
    for label, path in AGENDA_FILES.items():
        if not path.is_file():
            continue
        for row in load_json_arrays(path):
            cheko_branch = str(row.get("sucursal_id") or "")
            if cheko_branch not in CHARM_CHEKO_BRANCH_IDS:
                continue
            yield label, row


def _record_cheko_branch(
    item: dict[str, object],
    row: dict[str, Any],
) -> None:
    cheko_branch = str(row.get("sucursal_id") or "").strip()
    if not cheko_branch:
        return
    branches = item.setdefault("cheko_branch_ids", set())
    if isinstance(branches, set):
        branches.add(cheko_branch)


def build_customer_import_items() -> list[dict[str, object]]:
    by_client: dict[str, dict[str, object]] = {}
    for _label, row in iter_agenda_rows():
        key = _customer_key(row)
        if not key:
            continue
        client_id = str(row.get("client_id") or key)
        display = (row.get("client_name") or "").strip() or f"Cliente {client_id[:8]}"
        phone = _phone(row.get("client_phone"))
        existing = by_client.get(client_id)
        if existing is None:
            existing = {
                "external_id": f"cheko-{client_id}",
                "customer_type": "person",
                "display_name": display,
                "phone": phone,
                "acquisition_source": "otros",
                "cheko_branch_ids": set(),
            }
            by_client[client_id] = existing
        else:
            if phone and not existing.get("phone"):
                existing["phone"] = phone
            if display and str(existing.get("display_name", "")).startswith("Cliente "):
                existing["display_name"] = display
        _record_cheko_branch(existing, row)
    return list(by_client.values())


def customer_import_payload(item: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in item.items() if key != "cheko_branch_ids"}


def customers_for_cheko_folder(
    items: Sequence[dict[str, object]],
    folder_label: str,
) -> list[dict[str, object]]:
    from app.scripts.cheko.context import FOLDER_TO_CHEKO_BRANCH

    cheko_id = FOLDER_TO_CHEKO_BRANCH[folder_label]
    selected: list[dict[str, object]] = []
    for item in items:
        branch_ids = item.get("cheko_branch_ids") or set()
        if isinstance(branch_ids, set) and cheko_id in branch_ids:
            selected.append(customer_import_payload(item))
    return selected


def _appointment_row_to_item(
    row: dict[str, Any],
    *,
    id_prefix: str = DEFAULT_APPOINTMENT_ID_PREFIX,
    require_charm_branch: bool = True,
) -> dict[str, object] | None:
    cheko_branch = str(row.get("sucursal_id") or "")
    if require_charm_branch and cheko_branch not in CHARM_CHEKO_BRANCH_IDS:
        return None
    cheko_id = str(row.get("id") or "")
    if not cheko_id:
        return None
    status = (row.get("status") or "").strip().lower()
    notes_parts: list[str] = []
    if row.get("notes"):
        notes_parts.append(str(row["notes"]))
    if status == "cancelada":
        notes_parts.append("Importación Cheko: cancelada en origen")
    item: dict[str, object] = {
        "external_id": f"{id_prefix}{cheko_id}",
        "date": row.get("fecha"),
        "time": _time_hm(row.get("hora")),
        "duration": _duration_minutes(row.get("duration")),
        "customer_name": (row.get("client_name") or "").strip(),
        "customer_phone": _phone(row.get("client_phone")),
        "service_name": (row.get("service_name") or "").strip(),
        "specialist_name": (row.get("employee_name") or "").strip(),
        "price": 0,
    }
    resource_name = cheko_resource_name(str(row.get("cabina_id") or "").strip() or None)
    if resource_name:
        item["resource_name"] = resource_name
    if notes_parts:
        item["notes"] = " | ".join(notes_parts)
    return item


def build_appointment_import_items_from_path(
    path: Path,
    *,
    id_prefix: str = DEFAULT_APPOINTMENT_ID_PREFIX,
    require_charm_branch: bool = True,
) -> list[dict[str, object]]:
    if not path.is_file():
        return []
    items: list[dict[str, object]] = []
    for row in load_json_arrays(path):
        item = _appointment_row_to_item(
            row,
            id_prefix=id_prefix,
            require_charm_branch=require_charm_branch,
        )
        if item is not None:
            items.append(item)
    return items


def build_customer_import_items_from_path(
    path: Path,
    *,
    id_prefix: str = DEFAULT_CUSTOMER_ID_PREFIX,
    require_charm_branch: bool = True,
) -> list[dict[str, object]]:
    if not path.is_file():
        return []
    by_client: dict[str, dict[str, object]] = {}
    for row in load_json_arrays(path):
        if require_charm_branch:
            cheko_branch = str(row.get("sucursal_id") or "")
            if cheko_branch not in CHARM_CHEKO_BRANCH_IDS:
                continue
        key = _customer_key(row)
        if not key:
            continue
        client_id = str(row.get("client_id") or key)
        display = (row.get("client_name") or "").strip() or f"Cliente {client_id[:8]}"
        phone = _phone(row.get("client_phone"))
        existing = by_client.get(client_id)
        if existing is None:
            existing = {
                "external_id": f"{id_prefix}{client_id}",
                "customer_type": "person",
                "display_name": display,
                "phone": phone,
                "acquisition_source": "otros",
                "cheko_branch_ids": set(),
            }
            by_client[client_id] = existing
        else:
            if phone and not existing.get("phone"):
                existing["phone"] = phone
            if display and str(existing.get("display_name", "")).startswith("Cliente "):
                existing["display_name"] = display
        _record_cheko_branch(existing, row)
    return list(by_client.values())


def build_appointment_import_items(
    folder_label: str,
) -> list[dict[str, object]]:
    return build_appointment_import_items_from_path(
        AGENDA_FILES[folder_label],
        require_charm_branch=False,
    )
