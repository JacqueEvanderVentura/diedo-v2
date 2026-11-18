from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from app.db.models.master_data import Customer
from app.services.customer_import_merge import customer_has_placeholder_name

DuplicateMatchType = Literal["document", "phone", "email"]
MATCH_PRIORITY: tuple[DuplicateMatchType, ...] = ("document", "phone", "email")


@dataclass(frozen=True)
class DuplicateCustomerGroup:
    match_type: DuplicateMatchType
    match_value: str
    customers: tuple[Customer, ...]


def _identity_value(customer: Customer, match_type: DuplicateMatchType) -> str | None:
    if match_type == "document":
        return customer.normalized_document_id
    if match_type == "phone":
        return customer.normalized_phone
    return customer.normalized_email


def _display_match_value(customer: Customer, match_type: DuplicateMatchType) -> str:
    if match_type == "document":
        return (customer.document_id or customer.normalized_document_id or "").strip()
    if match_type == "phone":
        return (customer.phone or customer.normalized_phone or "").strip()
    return (customer.email or customer.normalized_email or "").strip()


def group_duplicate_customers(customers: Sequence[Customer]) -> list[DuplicateCustomerGroup]:
    """Group non-archived customers that share document, then phone, then email."""
    groups: list[DuplicateCustomerGroup] = []
    for match_type in MATCH_PRIORITY:
        buckets: dict[str, list[Customer]] = defaultdict(list)
        for customer in customers:
            if customer.status == "archived":
                continue
            key = _identity_value(customer, match_type)
            if not key:
                continue
            buckets[key].append(customer)
        for key, members in buckets.items():
            if len(members) < 2:
                continue
            ordered = tuple(sorted(members, key=lambda item: (item.created_at, item.id)))
            groups.append(
                DuplicateCustomerGroup(
                    match_type=match_type,
                    match_value=_display_match_value(ordered[0], match_type) or key,
                    customers=ordered,
                )
            )
    return groups


def survivor_sort_key(customer: Customer) -> tuple[object, ...]:
    """Prefer cédula, then phone, then email, then a real name, then oldest record."""
    return (
        0 if customer.normalized_document_id else 1,
        0 if customer.normalized_phone else 1,
        0 if customer.normalized_email else 1,
        1 if customer_has_placeholder_name(customer) else 0,
        customer.created_at or datetime.min.replace(tzinfo=UTC),
        customer.id,
    )


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
    if not keeper.normalized_phone:
        for source in ordered:
            if source.normalized_phone:
                changes["phone"] = source.phone
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
    return changes
