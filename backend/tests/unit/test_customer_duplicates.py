from datetime import UTC, datetime
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from app.db.models.master_data import Customer
from app.repositories.master_data import MasterDataRepository
from app.schemas.master_data import MergeCustomersRequest
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.customer_duplicates import (
    group_duplicate_customers,
    pick_survivor,
    profile_field_updates,
)
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError
from app.services.master_data import MasterDataService
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError


def _customer(**overrides: object) -> Customer:
    now = datetime(2024, 1, 1, tzinfo=UTC)
    values: dict[str, object] = {
        "id": uuid4(),
        "workspace_id": uuid4(),
        "customer_type": "person",
        "display_name": "Ana",
        "normalized_name": "ana",
        "status": "active",
        "created_at": now,
        "version": 1,
        "created_by_platform_user_id": uuid4(),
        "updated_by_platform_user_id": uuid4(),
    }
    values.update(overrides)
    return Customer(**values)


def test_group_duplicate_customers_orders_document_phone_email() -> None:
    doc = "00112345678"
    phone = "8095551111"
    email = "ana@example.com"
    first = _customer(
        normalized_document_id=doc,
        document_id="001-1234567-8",
        normalized_phone=phone,
        phone=phone,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
    )
    second = _customer(
        normalized_document_id=doc,
        document_id="001-1234567-8",
        created_at=datetime(2024, 2, 1, tzinfo=UTC),
    )
    third = _customer(normalized_phone=phone, phone=phone)
    fourth = _customer(normalized_email=email, email=email)
    fifth = _customer(normalized_email=email, email=email)
    sixth = _customer(display_name="Solo")
    groups = group_duplicate_customers([first, second, third, fourth, fifth, sixth])
    assert [group.match_type for group in groups] == ["document", "phone", "email"]
    assert {row.id for row in groups[0].customers} == {first.id, second.id}
    assert {row.id for row in groups[1].customers} == {first.id, third.id}
    assert {row.id for row in groups[2].customers} == {fourth.id, fifth.id}


def test_pick_survivor_prefers_document_then_phone_then_email() -> None:
    by_email = _customer(normalized_email="a@example.com", email="a@example.com")
    by_phone = _customer(normalized_phone="8095550000", phone="8095550000")
    by_doc = _customer(
        normalized_document_id="00112345678",
        document_id="001-1234567-8",
        created_at=datetime(2025, 1, 1, tzinfo=UTC),
    )
    assert pick_survivor([by_email, by_phone, by_doc]).id == by_doc.id
    assert pick_survivor([by_email, by_phone]).id == by_phone.id
    kept = pick_survivor([by_email, by_phone, by_doc], keep_customer_id=by_email.id)
    assert kept.id == by_email.id


def test_profile_field_updates_fills_missing_identity_from_sources() -> None:
    keeper = _customer(display_name="Cliente sin nombre", normalized_name="cliente sin nombre")
    source = _customer(
        display_name="María López",
        first_name="María",
        last_name="López",
        normalized_document_id="00112345678",
        document_type="cedula",
        document_id="001-1234567-8",
        phone="8095552222",
        normalized_phone="8095552222",
        email="maria@example.com",
        normalized_email="maria@example.com",
    )
    changes = profile_field_updates(keeper, [source])
    assert changes["document_id"] == "001-1234567-8"
    assert changes["phone"] == "8095552222"
    assert changes["email"] == "maria@example.com"
    assert changes["display_name"] == "María López"


def test_merge_customers_request_requires_keep_in_group() -> None:
    first, second, outsider = uuid4(), uuid4(), uuid4()
    with pytest.raises(ValidationError, match="conservar"):
        MergeCustomersRequest(customerIds=[first, second], keepCustomerId=outsider)
    with pytest.raises(ValidationError, match="No repitas"):
        MergeCustomersRequest(customerIds=[first, first], keepCustomerId=first)


def _grant(workspace_id) -> PermissionGrant:
    return PermissionGrant(
        permission_code="customer.manage",
        workspace_id=workspace_id,
        membership_id=uuid4(),
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )


def _principal(workspace_id) -> AuthPrincipal:
    return AuthPrincipal(
        platform_user_id=uuid4(),
        membership_id=uuid4(),
        workspace_id=workspace_id,
        session_id=uuid4(),
        email="owner@erp.dev",
        display_name="Owner",
    )


def test_merge_customers_rejects_short_group_and_missing_ids() -> None:
    workspace_id = uuid4()
    service = MasterDataService(MagicMock())
    repo = MagicMock()
    service._repository = repo
    customer_id = uuid4()
    with pytest.raises(InvalidOperationError, match="al menos dos"):
        service.merge_customers(
            principal=_principal(workspace_id),
            grant=_grant(workspace_id),
            customer_ids=[customer_id, customer_id],
            keep_customer_id=customer_id,
        )
    first, second = _customer(), _customer()
    repo.get_customers_by_ids.return_value = [first]
    with pytest.raises(ResourceNotFoundError, match="no existe"):
        service.merge_customers(
            principal=_principal(workspace_id),
            grant=_grant(workspace_id),
            customer_ids=[first.id, second.id],
            keep_customer_id=first.id,
        )
    archived = _customer(status="archived")
    other_archived = _customer(status="archived")
    repo.get_customers_by_ids.return_value = [archived, other_archived]
    with pytest.raises(InvalidOperationError, match="archivados"):
        service.merge_customers(
            principal=_principal(workspace_id),
            grant=_grant(workspace_id),
            customer_ids=[archived.id, other_archived.id],
            keep_customer_id=archived.id,
        )
    live = _customer()
    live_two = _customer()
    repo.get_customers_by_ids.return_value = [live, live_two, archived]
    with pytest.raises(InvalidOperationError, match="conservar"):
        service.merge_customers(
            principal=_principal(workspace_id),
            grant=_grant(workspace_id),
            customer_ids=[live.id, live_two.id, archived.id],
            keep_customer_id=archived.id,
        )


def test_merge_customers_success_assigns_branches_and_commits() -> None:
    workspace_id = uuid4()
    service = MasterDataService(MagicMock())
    repo = MagicMock()
    service._repository = repo
    first = _customer(workspace_id=workspace_id)
    second = _customer(workspace_id=workspace_id, phone="8095550000", normalized_phone="8095550000")
    repo.get_customers_by_ids.return_value = [first, second]
    branch_id = uuid4()
    repo.customer_active_branch_ids.return_value = {second.id: {branch_id}}
    kept = MagicMock()
    repo.update_customer.return_value = kept
    result = service.merge_customers(
        principal=_principal(workspace_id),
        grant=_grant(workspace_id),
        customer_ids=[first.id, second.id],
        keep_customer_id=first.id,
    )
    repo.ensure_customer_branches.assert_called_once()
    service._session.commit.assert_called_once()
    assert result["kept_customer_id"] == first.id
    assert result["archived_customer_ids"] == [second.id]
    assert result["customer"] is kept


def test_merge_customers_maps_integrity_error() -> None:
    workspace_id = uuid4()
    service = MasterDataService(MagicMock())
    repo = MagicMock()
    service._repository = repo
    first = _customer(workspace_id=workspace_id)
    second = _customer(workspace_id=workspace_id)
    repo.get_customers_by_ids.return_value = [first, second]
    repo.customer_active_branch_ids.return_value = {}

    def _update(*, customer, changes, **kwargs):
        del customer, kwargs
        if changes.get("status") == "archived":
            return MagicMock()
        raise IntegrityError("merge", {}, Exception("dup"))

    repo.update_customer.side_effect = _update
    with pytest.raises(ConflictError, match="conflicto"):
        service.merge_customers(
            principal=_principal(workspace_id),
            grant=_grant(workspace_id),
            customer_ids=[first.id, second.id],
            keep_customer_id=first.id,
        )
    service._session.rollback.assert_called_once()


def test_auto_merge_skips_groups_already_reduced() -> None:
    workspace_id = uuid4()
    service = MasterDataService(MagicMock())
    first = _customer()
    second = _customer()
    phone_group = MagicMock(match_type="phone", customers=[first, second])
    leftover = MagicMock(match_type="email", customers=[first])
    service.list_duplicate_customers = MagicMock(  # type: ignore[method-assign]
        side_effect=[[phone_group], [phone_group], [leftover]]
    )
    service.merge_customers = MagicMock(  # type: ignore[method-assign]
        return_value={
            "kept_customer_id": first.id,
            "archived_customer_ids": [second.id],
            "customer": first,
        }
    )
    items = service.auto_merge_duplicate_customers(
        principal=_principal(workspace_id),
        grant=_grant(workspace_id),
    )
    assert len(items) == 1
    service.merge_customers.assert_called_once()


def test_merge_customer_crm_profiles_promotes_and_combines() -> None:
    repo = MasterDataRepository(MagicMock())
    keeper_id = uuid4()
    source_id = uuid4()
    source = MagicMock(
        customer_id=source_id,
        loyalty_points=4,
        notes="nota",
        lifecycle_status="activo",
    )
    repo._session.scalars.return_value = [source]
    repo.merge_customer_crm_profiles(
        workspace_id=uuid4(),
        keeper_id=keeper_id,
        source_ids=[source_id],
        actor_platform_user_id=uuid4(),
    )
    assert source.customer_id == keeper_id
    repo._session.scalars.return_value = []
    repo.merge_customer_crm_profiles(
        workspace_id=uuid4(),
        keeper_id=keeper_id,
        source_ids=[source_id],
        actor_platform_user_id=uuid4(),
    )
    repo.reassign_customer_references(
        workspace_id=uuid4(),
        from_customer_ids=[keeper_id],
        to_customer_id=keeper_id,
    )
    repo._session.execute.assert_not_called()
