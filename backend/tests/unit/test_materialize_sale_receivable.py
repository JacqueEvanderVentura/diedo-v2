from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid7

from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.pos import PosService


def _principal_and_grant() -> tuple[AuthPrincipal, PermissionGrant]:
    workspace_id = uuid7()
    membership_id = uuid7()
    principal = AuthPrincipal(
        platform_user_id=uuid7(),
        membership_id=membership_id,
        workspace_id=workspace_id,
        session_id=uuid7(),
        email="materialize@example.com",
        display_name="Materialize",
    )
    grant = PermissionGrant(
        permission_code="pos.receivables.read",
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


def test_materialize_receivable_for_deferred_sale_without_row() -> None:
    principal, grant = _principal_and_grant()
    sale_id = uuid7()
    customer_id = uuid7()
    branch_id = uuid7()
    customer = SimpleNamespace(id=customer_id, display_name="Cliente", phone=None)
    sale = SimpleNamespace(
        id=sale_id,
        status="completed",
        settlement_policy="receivable",
        total=Decimal("150"),
        customer_id=customer_id,
        branch_id=branch_id,
        currency_code="DOP",
        payment_method_id=uuid7(),
        payment_method_code="credit",
        payment_method_name="Crédito",
        payment_channel="credit",
        affects_cash_drawer=False,
        requires_evidence=False,
        payment_reference=None,
        notes=None,
        sold_by_platform_user_id=principal.platform_user_id,
    )
    sale_line = SimpleNamespace(
        id=uuid7(),
        position=1,
        item_id=uuid7(),
        item_name="Servicio",
        item_sku=None,
        unit_symbol="und",
        quantity=Decimal("1"),
        unit_price=Decimal("150"),
        line_total=Decimal("150"),
    )
    sale_record = SimpleNamespace(sale=sale, customer=customer, lines=(sale_line,))
    added: list[object] = []

    class Repo:
        def receivable_by_key(self, *_args):
            return None

        def next_document_number(self, *_args):
            return "CXC-900"

        def add_receivable(self, receivable, lines):
            added.append((receivable, lines))

    service = _service(Repo())
    service._derived_key = lambda *_args: "derived-sale"  # type: ignore[method-assign]
    service._fingerprint = lambda *_args: "fp"  # type: ignore[method-assign]
    created = service._materialize_receivable_for_sale(
        grant,
        sale_record,
        principal=principal,
    )
    assert created is not None
    assert created.sale_id == sale_id
    assert created.amount == Decimal("150")
    assert len(added) == 1
