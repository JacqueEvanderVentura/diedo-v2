from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid7

import pytest
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import InvalidOperationError
from app.services.pos import PosService


def _principal_and_grant() -> tuple[AuthPrincipal, PermissionGrant]:
    workspace_id = uuid7()
    membership_id = uuid7()
    principal = AuthPrincipal(
        platform_user_id=uuid7(),
        membership_id=membership_id,
        workspace_id=workspace_id,
        session_id=uuid7(),
        email="parked-shift@example.com",
        display_name="Parked Shift",
    )
    grant = PermissionGrant(
        permission_code="pos.sell",
        workspace_id=workspace_id,
        membership_id=membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    return principal, grant


def _service(repository: object) -> PosService:
    service = object.__new__(PosService)
    service._repository = repository  # type: ignore[assignment]
    service._session = SimpleNamespace(commit=lambda: None, rollback=lambda: None)  # type: ignore[assignment]
    return service


def test_resolve_crm_checkout_register_only_uses_open_register() -> None:
    principal, grant = _principal_and_grant()
    branch_id = uuid7()
    open_register = SimpleNamespace(id=uuid7(), status="open", branch_id=branch_id)
    method = SimpleNamespace(affects_cash_drawer=True)

    class OpenRepo:
        def current_register(self, workspace_id, branch, lock=False):
            assert workspace_id == grant.workspace_id
            assert branch == branch_id
            return open_register

    service = _service(OpenRepo())
    resolved = service._resolve_crm_checkout_register(
        principal=principal,
        grant=grant,
        branch_id=branch_id,
        method=method,
        idempotency_key="crm-key",
    )
    assert resolved is open_register

    class ClosedRepo:
        def current_register(self, *_args, **_kwargs):
            return None

    service = _service(ClosedRepo())
    assert (
        service._resolve_crm_checkout_register(
            principal=principal,
            grant=grant,
            branch_id=branch_id,
            method=method,
            idempotency_key="crm-key",
        )
        is None
    )


def test_absorb_parked_shift_activity_assigns_sales_and_cash() -> None:
    principal, grant = _principal_and_grant()
    branch_id = uuid7()
    register = SimpleNamespace(
        id=uuid7(),
        branch_id=branch_id,
        cash_sales_amount=Decimal("0"),
        receivable_payments_amount=Decimal("0"),
        cash_income_amount=Decimal("0"),
        cash_expense_amount=Decimal("0"),
        opening_cash=Decimal("0"),
        version=1,
    )
    sale = SimpleNamespace(
        id=uuid7(),
        cash_register_id=None,
        settlement_policy="immediate",
        affects_cash_drawer=True,
        total=Decimal("25.00"),
        currency_code="DOP",
        payment_method_id=uuid7(),
        payment_method_code="cash",
        payment_method_name="Efectivo",
        payment_channel="cash",
        requires_evidence=False,
        sale_number="V-100",
        payment_reference=None,
        inventory_movement_id=None,
        sold_by_membership_id=principal.membership_id,
        sold_by_platform_user_id=principal.platform_user_id,
        sold_by_name=principal.display_name,
    )
    payment = SimpleNamespace(
        id=uuid7(),
        receivable_id=uuid7(),
        cash_register_id=None,
        pending_shift_cash_assignment=True,
        amount=Decimal("10.00"),
        currency_code="DOP",
        payment_method_id=uuid7(),
        payment_method_code="cash",
        payment_method_name="Efectivo",
        payment_channel="cash",
        settlement_policy="immediate",
        affects_cash_drawer=True,
        requires_evidence=False,
        reference=None,
        received_by_membership_id=principal.membership_id,
        received_by_platform_user_id=principal.platform_user_id,
        received_by_name=principal.display_name,
    )
    receivable = SimpleNamespace(receivable_number="CXC-1")
    movements: list[object] = []

    class Repo:
        def parked_sales_for_branch(self, workspace_id, branch, lock=False):
            return (sale,)

        def parked_cash_payments_for_branch(self, workspace_id, branch, lock=False):
            return (payment,)

        def movement_for_sale(self, workspace_id, sale_id):
            return None

        def movement_for_payment(self, workspace_id, payment_id):
            return None

        def get_receivable(self, workspace_id, receivable_id, allowed_branch_ids):
            return receivable

        def add_movement(self, movement):
            movements.append(movement)

    service = _service(Repo())
    service._absorb_parked_shift_activity(
        principal=principal,
        grant=grant,
        register=register,
        branch_id=branch_id,
    )
    assert sale.cash_register_id == register.id
    assert payment.cash_register_id == register.id
    assert payment.pending_shift_cash_assignment is False
    assert register.cash_sales_amount == Decimal("25.00")
    assert register.receivable_payments_amount == Decimal("10.00")
    assert len(movements) == 2
    assert {movement.movement_type for movement in movements} == {
        "sale",
        "receivable_payment",
    }


def test_pos_receivable_cash_still_requires_open_register() -> None:
    principal, grant = _principal_and_grant()
    receivable_id = uuid7()
    method_id = uuid7()
    cash = SimpleNamespace(
        id=method_id,
        settlement_policy="immediate",
        requires_evidence=False,
        affects_cash_drawer=True,
        code="cash",
        name="Efectivo",
        channel="cash",
    )

    class Repo:
        def payment_by_key(self, *_args):
            return None

        def get_receivable(self, *_args, **_kwargs):
            return SimpleNamespace(
                id=receivable_id,
                branch_id=uuid7(),
                currency_code="DOP",
                amount=Decimal("100"),
                paid_amount=Decimal("0"),
                status="pending",
                version=1,
            )

    service = _service(Repo())
    service._require_payment_method = lambda *_args: cash  # type: ignore[method-assign]
    service._locked_receivable = lambda *_args: Repo().get_receivable()  # type: ignore[method-assign]
    with pytest.raises(InvalidOperationError, match="caja abierta"):
        service.create_receivable_payment(
            principal=principal,
            grant=grant,
            receivable_id=receivable_id,
            amount=Decimal("10"),
            payment_method_id=method_id,
            reference=None,
            note=None,
            register_id=None,
            expected_version=1,
            idempotency_key="pay-key-12345678",
            evidence_source=None,
            filename=None,
            content_type=None,
            storage=SimpleNamespace(),
            max_bytes=1_000_000,
        )


def test_checkout_without_register_requires_register_id() -> None:
    principal, grant = _principal_and_grant()
    branch_id = uuid7()
    method_id = uuid7()

    class Repo:
        def sale_by_key(self, *_args):
            return None

    service = _service(Repo())
    service._require_payment_method = lambda *_args: SimpleNamespace(  # type: ignore[method-assign]
        id=method_id,
        settlement_policy="immediate",
        requires_evidence=False,
        affects_cash_drawer=False,
    )
    with pytest.raises(InvalidOperationError, match="caja de cobro"):
        service.checkout(
            principal=principal,
            grant=grant,
            values={
                "branch_id": branch_id,
                "payment_method_id": method_id,
                "lines": [{"item_id": uuid7(), "quantity": Decimal("1")}],
            },
            idempotency_key="checkout-key-123456",
        )
