from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
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


_MEANINGFUL_UPDATE_FIELDS = frozenset(
    {
        "display_name",
        "first_name",
        "last_name",
        "business_name",
        "email",
        "phone",
        "document_type",
        "document_id",
    }
)


def meaningful_customer_import_changes(changes: dict[str, object]) -> dict[str, object]:
    return {key: value for key, value in changes.items() if key in _MEANINGFUL_UPDATE_FIELDS}


def parse_import_customer_id(raw: dict[str, Any]) -> UUID | None:
    for key in ("customer_id", "external_id"):
        value = _text(raw.get(key))
        if not value:
            continue
        try:
            return UUID(value)
        except ValueError:
            continue
    return None


def _customers_in_destination(
    repository: MasterDataRepository,
    *,
    workspace_id: UUID,
    destination_branch_ids: set[UUID],
    customers: list[Customer],
) -> list[Customer]:
    found = [customer for customer in customers if customer is not None]
    if not found or not destination_branch_ids:
        return []
    branch_map = repository.customer_active_branch_ids(
        workspace_id, [customer.id for customer in found]
    )
    return [
        customer
        for customer in found
        if branch_map.get(customer.id, set()) & destination_branch_ids
    ]


def _prefer_import_match_candidates(
    customers: Sequence[Customer],
    raw: dict[str, Any],
    *,
    destination_branch_ids: set[UUID],
    branch_ids_by_customer: dict[UUID, frozenset[UUID]] | None = None,
) -> list[Customer]:
    """Pick best workspace customer match; destination branch is a tie-breaker only."""
    listed = [customer for customer in customers if customer is not None]
    if not listed:
        return []
    preferred = _prefer_placeholder(listed, raw)
    if len(preferred) == 1:
        return preferred
    if branch_ids_by_customer and destination_branch_ids:
        in_destination = [
            customer
            for customer in preferred
            if branch_ids_by_customer.get(customer.id, frozenset()) & destination_branch_ids
        ]
        if len(in_destination) == 1:
            return in_destination
    return [preferred[0]]


def _prefer_placeholder(customers: list[Customer], raw: dict[str, Any]) -> list[Customer]:
    placeholders = [
        customer for customer in customers if customer_has_placeholder_name(customer, raw)
    ]
    return placeholders or customers


def find_import_customer_matches(
    repository: MasterDataRepository,
    *,
    workspace_id: UUID,
    allowed_branch_ids: frozenset[UUID] | None,
    destination_branch_ids: set[UUID],
    raw: dict[str, Any],
) -> list[Customer]:
    del destination_branch_ids  # matching is workspace-wide; branch assignment happens on import
    customer_id = parse_import_customer_id(raw)
    if customer_id is not None:
        existing = repository.get_customer(workspace_id, customer_id, allowed_branch_ids)
        if existing is not None:
            return [existing]

    doc_type = _text(raw.get("document_type"))
    doc_id = _text(raw.get("document_id"))
    if doc_type and doc_id:
        normalized_doc = normalize_document_id(doc_type, doc_id)
        if normalized_doc:
            by_document = repository.customers_matching_import_keys(
                workspace_id=workspace_id,
                allowed_branch_ids=allowed_branch_ids,
                normalized_phone=None,
                normalized_email=None,
                normalized_document_id=normalized_doc,
            )
            if by_document:
                return _prefer_placeholder(by_document, raw)

    phone = normalize_phone(_text(raw.get("phone")))
    if phone:
        by_phone = repository.customers_matching_import_keys(
            workspace_id=workspace_id,
            allowed_branch_ids=allowed_branch_ids,
            normalized_phone=phone,
            normalized_email=None,
            normalized_document_id=None,
        )
        if by_phone:
            return _prefer_placeholder(by_phone, raw)

    email = normalize_email(_text(raw.get("email")))
    if email:
        by_email = repository.customers_matching_import_keys(
            workspace_id=workspace_id,
            allowed_branch_ids=allowed_branch_ids,
            normalized_phone=None,
            normalized_email=email,
            normalized_document_id=None,
        )
        if by_email:
            return _prefer_placeholder(by_email, raw)

    return []


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


@dataclass
class ImportCustomerMatchLookup:
    destination_branch_ids: frozenset[UUID]
    customers_by_phone: dict[str, tuple[Customer, ...]]
    customers_by_email: dict[str, tuple[Customer, ...]]
    customers_by_document: dict[str, tuple[Customer, ...]]
    branch_ids_by_customer: dict[UUID, frozenset[UUID]]


def _customers_in_destination_from_lookup(
    lookup: ImportCustomerMatchLookup,
    customers: Sequence[Customer],
) -> list[Customer]:
    if not customers:
        return []
    return [
        customer
        for customer in customers
        if lookup.branch_ids_by_customer.get(customer.id, frozenset())
        & lookup.destination_branch_ids
    ]


def _import_match_raw_from_agenda_item(raw: dict[str, Any]) -> dict[str, Any]:
    match_raw: dict[str, Any] = {}
    phone = _text(raw.get("phone") or raw.get("customer_phone") or raw.get("customerPhone"))
    if phone:
        match_raw["phone"] = phone
    email = _text(raw.get("email") or raw.get("customer_email") or raw.get("customerEmail"))
    if email:
        match_raw["email"] = email
    doc_type = _text(
        raw.get("document_type")
        or raw.get("documentType")
        or raw.get("customer_document_type")
        or raw.get("customerDocumentType")
    )
    doc_id = _text(
        raw.get("document_id")
        or raw.get("documentId")
        or raw.get("customer_document_id")
        or raw.get("customerDocumentId")
    )
    if doc_type and doc_id:
        match_raw["document_type"] = doc_type
        match_raw["document_id"] = doc_id
    return match_raw


def agenda_import_item_to_customer_raw(item: dict[str, Any]) -> dict[str, Any]:
    raw: dict[str, Any] = {}
    name = _text(item.get("customer_name") or item.get("customerName"))
    if name:
        raw["display_name"] = name
    phone = _text(item.get("customer_phone") or item.get("customerPhone"))
    if phone:
        raw["phone"] = phone
    email = _text(item.get("customer_email") or item.get("customerEmail"))
    if email:
        raw["email"] = email
    doc_type = _text(item.get("document_type") or item.get("documentType"))
    doc_id = _text(item.get("document_id") or item.get("documentId"))
    if doc_type and doc_id:
        raw["document_type"] = doc_type
        raw["document_id"] = doc_id
    return raw


def build_import_customer_match_lookup(
    repository: MasterDataRepository,
    *,
    workspace_id: UUID,
    allowed_branch_ids: frozenset[UUID] | None,
    destination_branch_ids: set[UUID],
    raw_items: Sequence[dict[str, Any]],
) -> ImportCustomerMatchLookup:
    normalized_phones: set[str] = set()
    normalized_emails: set[str] = set()
    normalized_document_ids: set[str] = set()
    for raw in raw_items:
        match_raw = _import_match_raw_from_agenda_item(raw)
        phone = normalize_phone(_text(match_raw.get("phone")))
        if phone:
            normalized_phones.add(phone)
        email = normalize_email(_text(match_raw.get("email")))
        if email:
            normalized_emails.add(email)
        doc_type = _text(match_raw.get("document_type"))
        doc_id = _text(match_raw.get("document_id"))
        if doc_type and doc_id:
            normalized_doc = normalize_document_id(doc_type, doc_id)
            if normalized_doc:
                normalized_document_ids.add(normalized_doc)

    customers = repository.customers_for_import_phones_and_emails(
        workspace_id=workspace_id,
        allowed_branch_ids=allowed_branch_ids,
        normalized_phones=normalized_phones,
        normalized_emails=normalized_emails,
        normalized_document_ids=normalized_document_ids,
    )
    branch_map = repository.customer_active_branch_ids(
        workspace_id, [customer.id for customer in customers]
    )
    branch_ids_by_customer = {
        customer_id: frozenset(branch_ids) for customer_id, branch_ids in branch_map.items()
    }

    by_phone: dict[str, list[Customer]] = defaultdict(list)
    by_email: dict[str, list[Customer]] = defaultdict(list)
    by_document: dict[str, list[Customer]] = defaultdict(list)
    for customer in customers:
        if customer.normalized_phone:
            by_phone[customer.normalized_phone].append(customer)
        if customer.normalized_email:
            by_email[customer.normalized_email].append(customer)
        if customer.normalized_document_id:
            by_document[customer.normalized_document_id].append(customer)

    return ImportCustomerMatchLookup(
        destination_branch_ids=frozenset(destination_branch_ids),
        customers_by_phone={key: tuple(value) for key, value in by_phone.items()},
        customers_by_email={key: tuple(value) for key, value in by_email.items()},
        customers_by_document={key: tuple(value) for key, value in by_document.items()},
        branch_ids_by_customer=branch_ids_by_customer,
    )


def resolve_import_customer_matches_from_lookup(
    lookup: ImportCustomerMatchLookup,
    raw: dict[str, Any],
    *,
    match_document_first: bool = False,
) -> list[Customer]:
    destination_branch_ids = set(lookup.destination_branch_ids)
    if match_document_first:
        doc_type = _text(raw.get("document_type"))
        doc_id = _text(raw.get("document_id"))
        if doc_type and doc_id:
            normalized_doc = normalize_document_id(doc_type, doc_id)
            if normalized_doc:
                by_document = _prefer_import_match_candidates(
                    lookup.customers_by_document.get(normalized_doc, ()),
                    raw,
                    destination_branch_ids=destination_branch_ids,
                    branch_ids_by_customer=lookup.branch_ids_by_customer,
                )
                if by_document:
                    return by_document

    phone = normalize_phone(_text(raw.get("phone")))
    if phone:
        by_phone = _prefer_import_match_candidates(
            lookup.customers_by_phone.get(phone, ()),
            raw,
            destination_branch_ids=destination_branch_ids,
            branch_ids_by_customer=lookup.branch_ids_by_customer,
        )
        if by_phone:
            return by_phone

    email = normalize_email(_text(raw.get("email")))
    if email:
        by_email = _prefer_import_match_candidates(
            lookup.customers_by_email.get(email, ()),
            raw,
            destination_branch_ids=destination_branch_ids,
            branch_ids_by_customer=lookup.branch_ids_by_customer,
        )
        if by_email:
            return by_email

    return []


def register_customer_in_import_lookup(
    lookup: ImportCustomerMatchLookup,
    customer: Customer,
    *,
    branch_ids: frozenset[UUID] | None = None,
) -> None:
    existing_branches = lookup.branch_ids_by_customer.get(customer.id, frozenset())
    if branch_ids:
        lookup.branch_ids_by_customer[customer.id] = existing_branches | branch_ids
    elif customer.id not in lookup.branch_ids_by_customer:
        lookup.branch_ids_by_customer[customer.id] = existing_branches

    def _append(key: str, bucket: dict[str, tuple[Customer, ...]]) -> None:
        current = list(bucket.get(key, ()))
        if customer.id in {row.id for row in current}:
            return
        current.append(customer)
        bucket[key] = tuple(current)

    if customer.normalized_phone:
        _append(customer.normalized_phone, lookup.customers_by_phone)
    if customer.normalized_email:
        _append(customer.normalized_email, lookup.customers_by_email)
    if customer.normalized_document_id:
        _append(customer.normalized_document_id, lookup.customers_by_document)


def find_agenda_sync_customer_match(
    repository: MasterDataRepository,
    *,
    workspace_id: UUID,
    allowed_branch_ids: frozenset[UUID] | None,
    raw: dict[str, Any],
) -> Customer | None:
    doc_type = _text(raw.get("document_type"))
    doc_id = _text(raw.get("document_id"))
    if doc_type and doc_id:
        normalized_doc = normalize_document_id(doc_type, doc_id)
        if normalized_doc:
            by_document = repository.customer_by_document(workspace_id, normalized_doc)
            if by_document is not None and by_document.status == "active":
                return by_document

    phone = normalize_phone(_text(raw.get("phone")))
    if phone:
        by_phone = _prefer_placeholder(
            repository.customers_matching_import_keys(
                workspace_id=workspace_id,
                allowed_branch_ids=allowed_branch_ids,
                normalized_phone=phone,
                normalized_email=None,
                normalized_document_id=None,
            ),
            raw,
        )
        if by_phone:
            return by_phone[0]

    email = normalize_email(_text(raw.get("email")))
    if email:
        by_email = _prefer_placeholder(
            repository.customers_matching_import_keys(
                workspace_id=workspace_id,
                allowed_branch_ids=allowed_branch_ids,
                normalized_phone=None,
                normalized_email=email,
                normalized_document_id=None,
            ),
            raw,
        )
        if by_email:
            return by_email[0]

    return None


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
