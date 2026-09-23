"""Focused unit tests for high-miss service branches."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid7

import pytest
from app.repositories.crm import EntityPage
from app.repositories.users import RoleAssignmentSpec, RoleRecord
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.crm import CrmService, PageResult
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.finance import FinanceService
from app.services.inventory import InventoryService
from app.services.purchasing import PurchasingService
from app.services.users import UsersService, user_initials
from sqlalchemy.exc import IntegrityError


def _principal_grant() -> tuple[AuthPrincipal, PermissionGrant]:
    workspace_id = uuid7()
    membership_id = uuid7()
    principal = AuthPrincipal(
        platform_user_id=uuid7(),
        membership_id=membership_id,
        workspace_id=workspace_id,
        session_id=uuid7(),
        email="coverage@example.com",
        display_name="Coverage Tester",
    )
    grant = PermissionGrant(
        permission_code="workspace.manage",
        workspace_id=workspace_id,
        membership_id=membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    return principal, grant


def test_crm_static_helpers_and_paging() -> None:
    with pytest.raises(ConflictError) as version:
        CrmService._require_version(2, 1)
    assert version.value.parameter == "version"
    with pytest.raises(ConflictError) as fingerprint:
        CrmService._require_fingerprint("a", "b")
    assert fingerprint.value.parameter == "Idempotency-Key"
    assert CrmService._optional_text("  hola   mundo ") == "hola mundo"
    assert CrmService._optional_text("   ") is None
    naive = datetime(2026, 1, 1, 12, 0, 0)
    assert CrmService._utc_now(naive).tzinfo == UTC
    aware = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)
    assert CrmService._utc_now(aware) == aware
    page = CrmService._page(EntityPage(items=(1, 2), total_items=5), page=1, page_size=2)
    assert isinstance(page, PageResult)
    assert page.total_pages == 3


def test_crm_delete_leads_handles_unexpected_errors() -> None:
    principal, grant = _principal_grant()
    session = Mock()
    service = CrmService(session)
    repository = Mock()
    service._repository = repository
    lead_id = uuid7()
    repository.lead.side_effect = RuntimeError("boom")
    results = service.delete_leads(principal=principal, grant=grant, lead_ids=[lead_id])
    assert results[0]["status"] == "error"
    assert "No se pudo eliminar" in results[0]["message"]
    session.rollback.assert_called()


def test_crm_import_activities_reports_row_errors() -> None:
    principal, grant = _principal_grant()
    session = Mock()
    service = CrmService(session)
    service._require_branch = Mock()
    rows = service.import_activities(
        principal=principal,
        grant=grant,
        branch_id=uuid7(),
        items=[{"title": "Sin lead"}],
    )
    assert rows[0]["status"] == "error"
    assert rows[0]["activity_id"] is None


def test_finance_service_idempotency_and_update_guards() -> None:
    principal, grant = _principal_grant()
    session = Mock()
    service = FinanceService(session)
    repository = Mock()
    service._repository = repository
    branch_id = uuid7()

    existing = SimpleNamespace(
        request_fingerprint="fp-a",
        branch_id=branch_id,
    )
    repository.find_by_idempotency.return_value = existing
    with pytest.raises(ConflictError) as mismatch:
        service._create_idempotent(
            model=object,
            workspace_id=grant.workspace_id,
            idempotency_key="key",
            fingerprint="fp-b",
            branch_id=branch_id,
            factory=lambda _id: object(),
            principal=principal,
            action="finance.test",
            target_type="test",
        )
    assert mismatch.value.parameter == "Idempotency-Key"

    existing.branch_id = uuid7()
    with pytest.raises(AuthorizationError):
        service._create_idempotent(
            model=object,
            workspace_id=grant.workspace_id,
            idempotency_key="key",
            fingerprint="fp-a",
            branch_id=branch_id,
            factory=lambda _id: object(),
            principal=principal,
            action="finance.test",
            target_type="test",
        )

    repository.find_by_idempotency.return_value = None
    repository.commit.side_effect = IntegrityError("insert", {}, Exception("dup"))
    repository.find_by_idempotency.side_effect = [None, existing]
    existing.branch_id = branch_id
    existing.request_fingerprint = "fp-a"
    replay = service._create_idempotent(
        model=object,
        workspace_id=grant.workspace_id,
        idempotency_key="key",
        fingerprint="fp-a",
        branch_id=branch_id,
        factory=lambda entity_id: SimpleNamespace(id=entity_id),
        principal=principal,
        action="finance.test",
        target_type="test",
    )
    assert replay is existing

    repository.find_by_idempotency.side_effect = [None, None]
    with pytest.raises(ConflictError, match="conflicto"):
        service._create_idempotent(
            model=object,
            workspace_id=grant.workspace_id,
            idempotency_key="key-2",
            fingerprint="fp-a",
            branch_id=branch_id,
            factory=lambda entity_id: SimpleNamespace(id=entity_id),
            principal=principal,
            action="finance.test",
            target_type="test",
        )

    with pytest.raises(ResourceNotFoundError):
        service._required_for_update(
            loader=lambda: None,
            message="missing",
            parameter="id",
            expected_version=1,
        )
    with pytest.raises(ConflictError) as stale:
        service._required_for_update(
            loader=lambda: SimpleNamespace(version=2),
            message="missing",
            parameter="id",
            expected_version=1,
        )
    assert stale.value.parameter == "version"

    repository.commit.side_effect = IntegrityError("update", {}, Exception("dup"))
    with pytest.raises(ConflictError, match="financiero"):
        service._commit_or_conflict("No se pudo actualizar el recurso financiero.")

    with pytest.raises(InvalidOperationError) as installments:
        FinanceService._validate_liability(
            {
                "initial_amount": "100",
                "pending_amount": "50",
                "type": "prestamo",
                "paid_installments": 5,
                "total_installments": 4,
            }
        )
    assert installments.value.parameter == "paidInstallments"


def test_purchasing_service_update_and_archive_guards() -> None:
    principal, grant = _principal_grant()
    session = Mock()
    service = PurchasingService(session)
    repository = Mock()
    service._repository = repository
    supplier_id = uuid7()
    service.get_supplier = Mock(return_value=SimpleNamespace())
    repository.get_supplier_for_update.return_value = SimpleNamespace(
        supplier=SimpleNamespace(
            id=supplier_id,
            status="archived",
            version=1,
            normalized_name="proveedor",
            tax_identifier=None,
        ),
        branch_ids=(uuid7(),),
    )
    with pytest.raises(ResourceNotFoundError) as archived:
        service.update_supplier(
            principal=principal,
            grant=grant,
            supplier_id=supplier_id,
            expected_version=1,
            changes={"name": "Nuevo"},
        )
    assert archived.value.parameter == "supplierId"

    repository.get_supplier_for_update.return_value.supplier.status = "active"
    repository.get_supplier_for_update.return_value.supplier.version = 2
    with pytest.raises(ConflictError) as version:
        service.update_supplier(
            principal=principal,
            grant=grant,
            supplier_id=supplier_id,
            expected_version=1,
            changes={"name": "Nuevo"},
        )
    assert version.value.parameter == "version"

    repository.get_supplier_for_update.return_value.supplier.version = 1
    repository.supplier_identity_exists.return_value = True
    with pytest.raises(ConflictError) as duplicate:
        service.update_supplier(
            principal=principal,
            grant=grant,
            supplier_id=supplier_id,
            expected_version=1,
            changes={"name": "Duplicado"},
        )
    assert duplicate.value.parameter == "name"

    repository.archive_supplier.side_effect = IntegrityError("archive", {}, Exception("dup"))
    with pytest.raises(ConflictError, match="archivar"):
        service.archive_supplier(
            principal=principal,
            grant=grant,
            supplier_id=supplier_id,
        )


def test_users_assignment_validation_and_initials() -> None:
    assert user_initials("") == "?"
    assert user_initials("Ada") == "AD"
    assert user_initials("Ada Lovelace") == "AL"

    session = Mock()
    service = UsersService(session)
    repository = Mock()
    service._repository = repository

    with pytest.raises(ConflictError, match="al menos una"):
        service._validate_assignment_targets(uuid7(), [])

    role_id = uuid7()
    duplicate = [
        RoleAssignmentSpec(role_id=role_id, scope_type="workspace"),
        RoleAssignmentSpec(role_id=role_id, scope_type="workspace"),
    ]
    with pytest.raises(ConflictError, match="No repitas"):
        service._validate_assignment_targets(uuid7(), duplicate)

    repository.get_role.return_value = RoleRecord(
        id=role_id,
        code="staff",
        name="Staff",
    )
    repository.get_legal_entities.return_value = []
    repository.get_branches.return_value = []
    with pytest.raises(ConflictError, match="no acepta IDs"):
        service._validate_assignment_targets(
            uuid7(),
            [
                RoleAssignmentSpec(
                    role_id=role_id,
                    scope_type="workspace",
                    legal_entity_id=uuid7(),
                )
            ],
        )

    admin_role = RoleRecord(
        id=role_id,
        code="workspace_admin",
        name="Admin",
    )
    with pytest.raises(ConflictError, match="Administrador"):
        UsersService._validate_role_scopes(
            [RoleAssignmentSpec(role_id=role_id, scope_type="branch", branch_id=uuid7())],
            {role_id: admin_role},
        )

    grant = PermissionGrant(
        permission_code="membership.manage",
        workspace_id=uuid7(),
        membership_id=uuid7(),
        allowed_legal_entity_ids=frozenset({uuid7()}),
        allowed_branch_ids=frozenset({uuid7()}),
    )
    user = SimpleNamespace(
        role_assignments=(
            SimpleNamespace(scope_type="workspace", legal_entity_id=None, branch_id=None),
        )
    )
    with pytest.raises(AuthorizationError, match="alcance superior"):
        service._require_target_within_grant(grant, user)


def test_inventory_product_kind_requires_sale_price() -> None:
    with pytest.raises(InvalidOperationError) as product:
        InventoryService._validate_item_kind_fields(
            item_type="product",
            sale_price=None,
            unit_cost=Decimal("1"),
            tax_rate=Decimal("0"),
            stock=Decimal("1"),
            minimum_stock=Decimal("0"),
        )
    assert product.value.parameter == "salePrice"
