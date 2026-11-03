from uuid import uuid4

from app.db.models.master_data import Customer
from app.services.customer_import_merge import (
    ImportCustomerMatchLookup,
    build_import_customer_match_lookup,
    resolve_import_customer_matches_from_lookup,
)


class _FakeMasterRepo:
    def __init__(
        self,
        customers: list[Customer],
        branch_map: dict,
    ) -> None:
        self._customers = customers
        self._branch_map = branch_map
        self.phones: set[str] = set()
        self.emails: set[str] = set()

    def customers_for_import_phones_and_emails(
        self,
        *,
        workspace_id,
        allowed_branch_ids,
        normalized_phones,
        normalized_emails,
    ):
        del workspace_id, allowed_branch_ids
        self.phones = set(normalized_phones)
        self.emails = set(normalized_emails)
        return self._customers

    def customer_active_branch_ids(self, workspace_id, customer_ids):
        del workspace_id
        return {cid: self._branch_map[cid] for cid in customer_ids if cid in self._branch_map}


def test_build_import_customer_match_lookup_batches_phones_and_emails() -> None:
    branch_id = uuid4()
    customer = Customer(
        customer_type="person",
        display_name="Ana López",
        normalized_name="ana lópez",
        phone="8095550001",
        normalized_phone="8095550001",
        email="ana@example.com",
        normalized_email="ana@example.com",
        status="active",
    )
    customer.id = uuid4()
    repo = _FakeMasterRepo([customer], {customer.id: {branch_id}})
    lookup = build_import_customer_match_lookup(
        repo,
        workspace_id=uuid4(),
        allowed_branch_ids=None,
        destination_branch_ids={branch_id},
        raw_items=[
            {"customerPhone": "8095550001", "customerEmail": "ana@example.com"},
            {"customerPhone": "8095559999"},
        ],
    )
    assert repo.phones == {"8095550001", "8095559999"}
    assert repo.emails == {"ana@example.com"}
    matches = resolve_import_customer_matches_from_lookup(lookup, {"phone": "8095550001"})
    assert matches == [customer]


def test_resolve_import_customer_match_prefers_placeholder() -> None:
    branch_id = uuid4()
    placeholder = Customer(
        customer_type="person",
        display_name="Cliente sin nombre",
        normalized_name="cliente sin nombre",
        phone="8095550001",
        normalized_phone="8095550001",
        status="active",
    )
    placeholder.id = uuid4()
    named = Customer(
        customer_type="person",
        display_name="Ana López",
        normalized_name="ana lópez",
        phone="8095550001",
        normalized_phone="8095550001",
        status="active",
    )
    named.id = uuid4()
    lookup = ImportCustomerMatchLookup(
        destination_branch_ids=frozenset({branch_id}),
        customers_by_phone={"8095550001": (placeholder, named)},
        customers_by_email={},
        branch_ids_by_customer={
            placeholder.id: frozenset({branch_id}),
            named.id: frozenset({branch_id}),
        },
    )
    matches = resolve_import_customer_matches_from_lookup(lookup, {"phone": "8095550001"})
    assert matches == [placeholder]
