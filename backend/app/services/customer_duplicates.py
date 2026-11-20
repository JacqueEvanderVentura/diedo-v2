from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from app.db.models.master_data import Customer
from app.services.customer_import_merge import customer_has_placeholder_name

DuplicateMatchType = Literal["document", "phone", "email", "name"]
MATCH_PRIORITY: tuple[DuplicateMatchType, ...] = ("document", "phone", "email", "name")
AUTO_MERGE_MATCH_PRIORITY: tuple[DuplicateMatchType, ...] = (
    "document",
    "phone",
    "email",
    "name",
)


@dataclass(frozen=True)
class DuplicateCustomerGroup:
    match_type: DuplicateMatchType
    match_value: str
    customers: tuple[Customer, ...]


_PHONE_SLOT_FIELDS: tuple[tuple[str, str], ...] = (
    ("phone", "normalized_phone"),
    ("phone_2", "normalized_phone_2"),
    ("phone_3", "normalized_phone_3"),
)


def customer_phone_pairs(customer: Customer) -> tuple[tuple[str | None, str], ...]:
    pairs: list[tuple[str | None, str]] = []
    for phone_field, normalized_field in _PHONE_SLOT_FIELDS:
        normalized = getattr(customer, normalized_field)
        if not normalized:
            continue
        raw_display = getattr(customer, phone_field)
        display = str(raw_display).strip() if raw_display else None
        display = display or normalized
        pairs.append((display, normalized))
    return tuple(pairs)


def customer_phone_keys(customer: Customer) -> tuple[str, ...]:
    return tuple(normalized for _, normalized in customer_phone_pairs(customer))


def _identity_value(customer: Customer, match_type: DuplicateMatchType) -> str | None:
    if match_type == "document":
        return customer.normalized_document_id
    if match_type == "phone":
        keys = customer_phone_keys(customer)
        return keys[0] if keys else None
    if match_type == "email":
        return customer.normalized_email
    return customer.normalized_name


def _phone_display_for_key(customer: Customer, key: str) -> str:
    for display, normalized in customer_phone_pairs(customer):
        if normalized == key:
            return display or key
    return key


def _display_match_value(customer: Customer, match_type: DuplicateMatchType) -> str:
    if match_type == "document":
        return (customer.document_id or customer.normalized_document_id or "").strip()
    if match_type == "phone":
        for display, _ in customer_phone_pairs(customer):
            if display:
                return display
        return ""
    if match_type == "email":
        return (customer.email or customer.normalized_email or "").strip()
    return (customer.display_name or customer.normalized_name or "").strip()


def _eligible_for_name_bucket(customer: Customer) -> bool:
    if not (customer.normalized_name or "").strip():
        return False
    return not customer_has_placeholder_name(customer)


def group_duplicate_customers(customers: Sequence[Customer]) -> list[DuplicateCustomerGroup]:
    """Group non-archived customers that share document, phone, email, or exact name."""
    groups: list[DuplicateCustomerGroup] = []
    for match_type in MATCH_PRIORITY:
        buckets: dict[str, list[Customer]] = defaultdict(list)
        for customer in customers:
            if customer.status == "archived":
                continue
            if match_type == "name" and not _eligible_for_name_bucket(customer):
                continue
            if match_type == "phone":
                keys = customer_phone_keys(customer)
            else:
                key = _identity_value(customer, match_type)
                keys = (key,) if key else ()
            for key in keys:
                buckets[key].append(customer)
        for key, members in buckets.items():
            unique = {item.id: item for item in members}
            if len(unique) < 2:
                continue
            ordered = tuple(sorted(unique.values(), key=lambda item: (item.created_at, item.id)))
            if match_type == "phone":
                match_value = _phone_display_for_key(ordered[0], key) or key
            else:
                match_value = _display_match_value(ordered[0], match_type) or key
            groups.append(
                DuplicateCustomerGroup(
                    match_type=match_type,
                    match_value=match_value,
                    customers=ordered,
                )
            )
    return groups


def survivor_sort_key(customer: Customer) -> tuple[object, ...]:
    """Prefer cédula, then phone, then email, then a real name, then oldest record."""
    return (
        0 if customer.normalized_document_id else 1,
        0 if customer_phone_keys(customer) else 1,
        0 if customer.normalized_email else 1,
        1 if customer_has_placeholder_name(customer) else 0,
        customer.created_at or datetime.min.replace(tzinfo=UTC),
        customer.id,
    )


def name_group_auto_merge_eligible(customers: Sequence[Customer]) -> bool:
    """Allow auto-merge by name unless two or more distinct emails are present."""
    emails = {customer.normalized_email for customer in customers if customer.normalized_email}
    return len(emails) <= 1


def combined_phone_slot_updates(keeper: Customer, sources: Sequence[Customer]) -> dict[str, object]:
    """Store up to three distinct phones on the surviving customer."""
    pairs: list[tuple[str | None, str]] = []
    seen: set[str] = set()
    for customer in (keeper, *sources):
        for display, normalized in customer_phone_pairs(customer):
            if normalized in seen:
                continue
            seen.add(normalized)
            pairs.append((display, normalized))
    pairs = pairs[:3]
    changes: dict[str, object] = {}
    for index, (phone_field, normalized_field) in enumerate(_PHONE_SLOT_FIELDS):
        slot_display: str | None = None
        slot_normalized: str | None = None
        if index < len(pairs):
            slot_display, slot_normalized = pairs[index]
        current_norm = getattr(keeper, normalized_field)
        current_display = getattr(keeper, phone_field)
        if current_norm == slot_normalized and current_display == slot_display:
            continue
        changes[phone_field] = slot_display
        changes[normalized_field] = slot_normalized
    return changes


def pick_survivor(customers: Sequence[Customer], keep_customer_id: UUID | None = None) -> Customer:
    listed = [customer for customer in customers if customer.status != "archived"]
    if not listed:
        listed = list(customers)
    if keep_customer_id is not None:
        for customer in listed:
            if customer.id == keep_customer_id:
                return customer
    return min(listed, key=survivor_sort_key)


def profile_field_updates(keeper: Customer, sources: Sequence[Customer]) -> dict[str, object]:
    """Copy missing identity and name fields onto the surviving customer."""
    changes: dict[str, object] = {}
    ordered = sorted(sources, key=survivor_sort_key)
    if not keeper.normalized_document_id:
        for source in ordered:
            if source.normalized_document_id:
                changes["document_type"] = source.document_type
                changes["document_id"] = source.document_id
                break
    if not keeper.normalized_email:
        for source in ordered:
            if source.normalized_email:
                changes["email"] = source.email
                break
    if customer_has_placeholder_name(keeper):
        for source in ordered:
            if not customer_has_placeholder_name(source):
                changes["display_name"] = source.display_name
                if source.first_name and not keeper.first_name:
                    changes["first_name"] = source.first_name
                if source.last_name and not keeper.last_name:
                    changes["last_name"] = source.last_name
                if source.business_name and not keeper.business_name:
                    changes["business_name"] = source.business_name
                break
    for field in (
        "first_name",
        "last_name",
        "business_name",
        "instagram_url",
        "acquisition_source",
    ):
        if field in changes:
            continue
        if getattr(keeper, field):
            continue
        for source in ordered:
            value = getattr(source, field)
            if value:
                changes[field] = value
                break
    if keeper.status != "active":
        for source in ordered:
            if source.status == "active":
                changes["status"] = "active"
                break
    changes.update(combined_phone_slot_updates(keeper, ordered))
    return changes
