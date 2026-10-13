from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db.models.master_data import Customer
from app.repositories.master_data import MasterDataRepository
from app.services.customer_documents import normalize_document_id


def normalize_name(value: str) -> str:
    return " ".join(value.split()).casefold()


def normalize_email(value: str | None) -> str | None:
    normalized = value.strip().casefold() if value else None
    return normalized or None


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    normalized = "".join(
        character for character in value if character.isdigit() or character == "+"
    )
    return normalized or None


def display_name_is_placeholder(
    display_name: str | None,
    *,
    phone: str | None,
    normalized_phone: str | None,
    external_id: str | None = None,
) -> bool:
    if not display_name:
        return True
    trimmed = display_name.strip()
    if trimmed.lower() == "cliente sin nombre":
        return True
    if external_id and trimmed == f"Cliente {external_id.strip()}":
        return True
    if phone and normalize_name(trimmed) == normalize_name(phone):
        return True
    if normalized_phone and trimmed == normalized_phone:
        return True
    return False


def _text(value: object | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def customer_has_placeholder_name(customer: Customer, raw: dict[str, Any] | None = None) -> bool:
    external_id = _text((raw or {}).get("external_id"))
    return display_name_is_placeholder(
        customer.display_name,
        phone=customer.phone,
        normalized_phone=customer.normalized_phone,
        external_id=external_id,
    )


def build_customer_import_update_changes(
    customer: Customer,
    raw: dict[str, Any],
) -> dict[str, object]:
    changes: dict[str, object] = {}
    external_id = _text(raw.get("external_id"))
    incoming_display = _text(raw.get("display_name"))
    if incoming_display and display_name_is_placeholder(
        incoming_display,
        phone=None,
        normalized_phone=None,
        external_id=external_id,
    ):
        incoming_display = None
    existing_is_placeholder = customer_has_placeholder_name(customer, raw)
    if incoming_display and (
        existing_is_placeholder
        or normalize_name(customer.display_name) != normalize_name(incoming_display)
    ):
        changes["display_name"] = incoming_display

    for field in ("first_name", "last_name", "business_name", "email", "phone"):
        incoming = _text(raw.get(field))
        if not incoming:
            continue
        existing = _text(getattr(customer, field))
        if field == "phone":
            if normalize_phone(incoming) != normalize_phone(existing):
                changes[field] = incoming
            continue
        if field == "email":
            if normalize_email(incoming) != normalize_email(existing):
                changes[field] = incoming
            continue
        if existing != incoming:
            changes[field] = incoming

    incoming_type = _text(raw.get("customer_type"))
    if incoming_type and customer.customer_type != incoming_type:
        changes["customer_type"] = incoming_type

    incoming_source = _text(raw.get("acquisition_source"))
    if incoming_source and customer.acquisition_source != incoming_source:
        changes["acquisition_source"] = incoming_source

    doc_type = _text(raw.get("document_type"))
    doc_id = _text(raw.get("document_id"))
    if doc_type and doc_id:
        if customer.document_type != doc_type or customer.document_id != doc_id:
            changes["document_type"] = doc_type
            changes["document_id"] = doc_id

    return changes


def _normalized_import_document_id(raw: dict[str, Any]) -> str | None:
    document_id = _text(raw.get("document_id"))
    if not document_id:
        return None
    document_type = _text(raw.get("document_type")) or "cedula"
    return normalize_document_id(document_type, document_id)


def find_import_customer_matches(
    repository: MasterDataRepository,
    *,
    workspace_id: UUID,
    allowed_branch_ids: frozenset[UUID] | None,
    destination_branch_ids: set[UUID],
    raw: dict[str, Any],
) -> list[Customer]:
    matches = repository.customers_matching_import_keys(
        workspace_id=workspace_id,
        allowed_branch_ids=allowed_branch_ids,
        normalized_phone=normalize_phone(_text(raw.get("phone"))),
        normalized_email=normalize_email(_text(raw.get("email"))),
        normalized_document_id=_normalized_import_document_id(raw),
    )
    if not matches:
        return []
    branch_map = repository.customer_active_branch_ids(
        workspace_id, [customer.id for customer in matches]
    )
    destination_matches = [
        customer
        for customer in matches
        if branch_map.get(customer.id, set()) & destination_branch_ids
    ]
    pool = destination_matches or matches
    placeholders = [customer for customer in pool if customer_has_placeholder_name(customer, raw)]
    return placeholders or pool


def find_import_customer_match(
    repository: MasterDataRepository,
    *,
    workspace_id: UUID,
    allowed_branch_ids: frozenset[UUID] | None,
    raw: dict[str, Any],
    destination_branch_ids: set[UUID] | None = None,
) -> Customer | None:
    matches = find_import_customer_matches(
        repository,
        workspace_id=workspace_id,
        allowed_branch_ids=allowed_branch_ids,
        destination_branch_ids=destination_branch_ids or set(),
        raw=raw,
    )
    return matches[0] if matches else None


_IMPORT_FIELD_LABELS: dict[str, str] = {
    "display_name": "Nombre",
    "first_name": "Nombre",
    "last_name": "Apellido",
    "business_name": "Empresa",
    "email": "Correo",
    "phone": "Teléfono",
    "customer_type": "Tipo de cliente",
    "acquisition_source": "Fuente",
    "document_type": "Tipo de documento",
    "document_id": "Documento",
}


def customer_import_row_context(raw: dict[str, Any]) -> dict[str, str | None]:
    return {
        "display_name": _text(raw.get("display_name")),
        "phone": _text(raw.get("phone")),
        "email": _text(raw.get("email")),
    }


def _display_value(value: object | None) -> str:
    text = _text(str(value) if value is not None else None)
    return text if text else "—"


def format_customer_import_update_summary(
    customer: Customer,
    changes: dict[str, object],
) -> str:
    parts: list[str] = []
    skip_keys = {
        "normalized_name",
        "normalized_email",
        "normalized_phone",
        "normalized_document_id",
    }
    if changes.get("document_type") and changes.get("document_id"):
        old_doc = "—"
        if customer.document_type and customer.document_id:
            old_doc = f"{customer.document_type} {customer.document_id}"
        new_doc = f"{changes['document_type']} {changes['document_id']}"
        parts.append(f"Documento: {old_doc} → {new_doc}")

    for field, new_value in changes.items():
        if field in skip_keys or field in {"document_type", "document_id"}:
            continue
        label = _IMPORT_FIELD_LABELS.get(field, field)
        old_value = getattr(customer, field, None)
        old_text = _text(str(old_value) if old_value is not None else None)
        new_text = _text(str(new_value) if new_value is not None else None)
        if not new_text:
            continue
        if not old_text:
            parts.append(f"{label}: {new_text} (nuevo)")
        elif old_text != new_text:
            parts.append(f"{label}: {old_text} → {new_text}")
        else:
            parts.append(f"{label}: {new_text}")

    return "; ".join(parts) if parts else "Datos actualizados."
