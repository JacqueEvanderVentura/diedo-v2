from __future__ import annotations

from typing import Any
from uuid import UUID

from app.db.models.master_data import Customer
from app.repositories.master_data import MasterDataRepository


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
) -> bool:
    if not display_name:
        return True
    trimmed = display_name.strip()
    if trimmed.lower() == "cliente sin nombre":
        return True
    if trimmed.startswith("Cliente "):
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


def build_customer_import_update_changes(
    customer: Customer,
    raw: dict[str, Any],
) -> dict[str, object]:
    changes: dict[str, object] = {}
    incoming_display = _text(raw.get("display_name"))
    if incoming_display and (
        display_name_is_placeholder(
            customer.display_name,
            phone=customer.phone,
            normalized_phone=customer.normalized_phone,
        )
        or normalize_name(customer.display_name) != normalize_name(incoming_display)
    ):
        changes["display_name"] = incoming_display

    for field in ("first_name", "last_name", "business_name", "email", "phone"):
        incoming = _text(raw.get(field))
        if not incoming:
            continue
        existing = _text(getattr(customer, field))
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


def find_import_customer_match(
    repository: MasterDataRepository,
    *,
    workspace_id: UUID,
    allowed_branch_ids: frozenset[UUID] | None,
    raw: dict[str, Any],
) -> Customer | None:
    phone = _text(raw.get("phone"))
    if phone:
        normalized_phone = normalize_phone(phone)
        if normalized_phone:
            return repository.customer_by_normalized_phone(
                workspace_id,
                normalized_phone,
                allowed_branch_ids,
            )
        return None
    email = _text(raw.get("email"))
    if email:
        normalized_email = normalize_email(email)
        if normalized_email:
            return repository.customer_by_normalized_email(
                workspace_id,
                normalized_email,
                allowed_branch_ids,
            )
    return None
