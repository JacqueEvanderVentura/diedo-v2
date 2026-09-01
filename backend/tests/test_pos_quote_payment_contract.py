from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid7
from zoneinfo import ZoneInfo

import pytest
from app.api.routers.pos import _quote_detail_response, _receivable_list_response
from app.db.models import Branch, CashRegister, CustomerReceivable, PaymentMethod
from app.db.session import get_session_factory, session_scope
from app.repositories.pos import ReceivableRecord
from app.schemas.pos import (
    CheckoutLineRequest,
    CheckoutRequest,
    CreateQuoteRequest,
    QuoteLineRequest,
    UpdateQuoteRequest,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import ConflictError, ResourceNotFoundError
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.pos import PosService
from app.services.pos_money import PricedDocument
from pydantic import ValidationError
from sqlalchemy import CheckConstraint


def test_quote_payment_patch_schema_preserves_omitted_and_retains_explicit_null() -> None:
    method_id = uuid7()
    create = CreateQuoteRequest(
        kind="held",
        branch_id=uuid7(),
        payment_method_id=method_id,
        reference="  AUT   4421  ",
        lines=[QuoteLineRequest(item_id=uuid7(), quantity=Decimal("1.000"))],
    )
    assert create.payment_method_id == method_id
    assert create.reference == "AUT 4421"

    omitted = UpdateQuoteRequest(version=1, notes="Conservar pago").model_dump(
        exclude_unset=True,
        exclude={"version"},
        by_alias=False,
    )
    assert "payment_method_id" not in omitted
    assert "reference" not in omitted

    cleared = UpdateQuoteRequest(
        version=1,
        payment_method_id=None,
        reference=None,
    ).model_dump(exclude_unset=True, exclude={"version"}, by_alias=False)
    assert cleared == {"payment_method_id": None, "reference": None}


def test_checkout_requires_quote_id_and_version_together() -> None:
    values = {
        "branch_id": uuid7(),
        "register_id": uuid7(),
        "payment_method_id": uuid7(),
        "lines": [CheckoutLineRequest(item_id=uuid7(), quantity=Decimal("1.000"))],
    }
    with pytest.raises(ValidationError, match="deben enviarse juntos"):
        CheckoutRequest(**values, quote_id=uuid7())
    with pytest.raises(ValidationError, match="deben enviarse juntos"):
        CheckoutRequest(**values, quote_version=1)

    valid = CheckoutRequest(**values, quote_id=uuid7(), quote_version=2)
    assert valid.quote_version == 2


def test_receivable_response_uses_durable_payment_semantics() -> None:
    now = datetime.now(UTC)
    branch_timezone = "America/Santo_Domingo"
    local_today = datetime.now(ZoneInfo(branch_timezone)).date()
    method_id = uuid7()
    record = ReceivableRecord(
        receivable=SimpleNamespace(
            id=uuid7(),
            receivable_number="CXC-TEST",
            source="sale",
            sale_id=uuid7(),
            appointment_id=None,
            payment_method_id=method_id,
            payment_method_code="transfer-original",
            payment_method_name="Transferencia original",
            payment_channel="bank_transfer",
            settlement_policy="pending_confirmation",
            affects_cash_drawer=False,
            requires_evidence=True,
            customer_id=uuid7(),
            customer_name="Cliente",
            status="pending",
            currency_code="DOP",
            amount=Decimal("125.00"),
            paid_amount=Decimal("0.00"),
            reference="TRF-10",
            due_date=local_today - timedelta(days=1),
            created_at=now,
            updated_at=now,
            version=1,
        ),
        branch=SimpleNamespace(id=uuid7(), name="Sucursal", timezone=branch_timezone),
        customer=SimpleNamespace(id=uuid7(), display_name="Cliente"),
        payment_method=SimpleNamespace(
            id=method_id,
            code="transfer-renamed",
            name="Transferencia renombrada",
            icon="Landmark",
            channel="other",
            settlement_policy="immediate",
            affects_cash_drawer=False,
            requires_evidence=False,
        ),
        lines=(),
        payments=(),
        proofs=(),
    )

    response = _receivable_list_response(record)

    assert response.payment_method is not None
    assert response.payment_method.code == "transfer-original"
    assert response.payment_method.name == "Transferencia original"
    assert response.payment_method.channel == "bank_transfer"
    assert response.payment_method.settlement_policy == "pending_confirmation"
    assert response.payment_method.requires_evidence is True
    assert response.payment_method.icon == "Landmark"
    assert response.overdue is True

    record.receivable.due_date = local_today + timedelta(days=1)
    assert _receivable_list_response(record).overdue is False

    record.receivable.due_date = local_today - timedelta(days=1)
    record.receivable.status = "paid"
    assert _receivable_list_response(record).overdue is False


def test_sale_receivables_require_a_payment_snapshot() -> None:
    constraints = {
        constraint.name: str(constraint.sqltext)
        for constraint in CustomerReceivable.__table__.constraints
        if isinstance(constraint, CheckConstraint)
    }

    assert constraints["ck_customer_receivables_sale_payment_snapshot_required"] == (
        "source <> 'sale' OR payment_method_id IS NOT NULL"
    )


@pytest.mark.integration
def test_quote_payment_snapshot_create_preserve_validate_and_clear(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        suffix = uuid7().hex[-12:]
        branch = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=f"QPM-{suffix}",
            name=f"Quote payment {suffix}",
            status="active",
            timezone="America/Santo_Domingo",
        )
        method = PaymentMethod(
            workspace_id=summary.workspace_id,
            code=f"quote-card-{suffix}",
            name="Tarjeta cotización",
            icon="CreditCard",
            status="active",
            is_system=False,
            channel="card",
            settlement_policy="immediate",
            affects_cash_drawer=False,
            requires_evidence=False,
        )
        session.add_all([branch, method])
        session.flush()
        register = CashRegister(
            workspace_id=summary.workspace_id,
            branch_id=branch.id,
            status="open",
            currency_code="DOP",
            opening_cash=Decimal("0.00"),
            opened_by_membership_id=summary.membership_id,
            opened_by_platform_user_id=summary.platform_user_id,
            opened_by_name="Local Owner",
            open_idempotency_key=f"quote-payment-register-{suffix}",
            open_request_fingerprint="b" * 64,
        )
        session.add(register)
        session.flush()
        branch_id = branch.id
        method_id = method.id
        register_id = register.id

    principal = AuthPrincipal(
        platform_user_id=summary.platform_user_id,
        membership_id=summary.membership_id,
        workspace_id=summary.workspace_id,
        session_id=uuid7(),
        email="owner@erp.dev",
        display_name="Local Owner",
    )
    manage_grant = PermissionGrant(
        permission_code="sales.quote.manage",
        workspace_id=summary.workspace_id,
        membership_id=summary.membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    read_grant = PermissionGrant(
        permission_code="sales.read",
        workspace_id=summary.workspace_id,
        membership_id=summary.membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    priced = PricedDocument(
        lines=(),
        subtotal=Decimal("10.00"),
        discount_amount=Decimal("0.00"),
        taxable_amount=Decimal("10.00"),
        tax_amount=Decimal("0.00"),
        total=Decimal("10.00"),
    )

    with get_session_factory()() as session:
        service = PosService(session)
        monkeypatch.setattr(service, "_price_lines", lambda **_values: (priced, ()))
        payload = CreateQuoteRequest(
            kind="held",
            branch_id=branch_id,
            payment_method_id=method_id,
            reference="  AUT   4421  ",
            lines=[QuoteLineRequest(item_id=uuid7(), quantity=Decimal("1.000"))],
        )
        created = service.create_quote(
            principal=principal,
            grant=manage_grant,
            values=payload.model_dump(by_alias=False),
            idempotency_key=f"quote-payment-{suffix}",
        )
        created_response = _quote_detail_response(created)
        assert created_response.payment_method is not None
        assert created_response.payment_method.id == method_id
        assert created_response.payment_method.code == f"quote-card-{suffix}"
        assert created_response.payment_method.channel == "card"
        assert created_response.reference == "AUT 4421"
        created_version = created.quote.version

        preserved = service.update_quote(
            principal=principal,
            grant=manage_grant,
            quote_id=created.quote.id,
            expected_version=created.quote.version,
            changes={"notes": "No cambia el pago"},
        )
        assert preserved.quote.payment_method_id == method_id
        assert preserved.quote.payment_reference == "AUT 4421"
        with pytest.raises(ConflictError, match="cambió") as stale_checkout_error:
            service.checkout(
                principal=principal,
                grant=PermissionGrant(
                    permission_code="pos.sell",
                    workspace_id=summary.workspace_id,
                    membership_id=summary.membership_id,
                    allowed_legal_entity_ids=None,
                    allowed_branch_ids=None,
                ),
                values={
                    "branch_id": branch_id,
                    "register_id": register_id,
                    "payment_method_id": method_id,
                    "quote_id": created.quote.id,
                    "quote_version": created_version,
                    "customer_id": None,
                    "discount_type": None,
                    "discount_value": None,
                    "lines": [
                        {
                            "item_id": uuid7(),
                            "quantity": Decimal("1.000"),
                            "unit_price": None,
                        }
                    ],
                    "reference": None,
                    "notes": None,
                },
                idempotency_key=f"stale-quote-checkout-{suffix}",
            )
        assert stale_checkout_error.value.parameter == "quoteVersion"
        session.rollback()

        historical_method = session.get(PaymentMethod, method_id)
        assert historical_method is not None
        historical_method.status = "inactive"
        session.commit()
        historical_response = _quote_detail_response(
            service.get_quote(read_grant, created.quote.id)
        )
        assert historical_response.payment_method is not None
        assert historical_response.payment_method.channel == "card"

        with pytest.raises(ResourceNotFoundError, match="inactivo") as inactive_error:
            service.update_quote(
                principal=principal,
                grant=manage_grant,
                quote_id=created.quote.id,
                expected_version=preserved.quote.version,
                changes={"payment_method_id": method_id},
            )
        assert inactive_error.value.parameter == "paymentMethodId"
        session.rollback()

        cleared = service.update_quote(
            principal=principal,
            grant=manage_grant,
            quote_id=created.quote.id,
            expected_version=preserved.quote.version,
            changes={"payment_method_id": None},
        )
        assert cleared.quote.payment_method_id is None
        assert cleared.quote.payment_method_code is None
        assert cleared.quote.payment_method_name is None
        assert cleared.quote.payment_channel is None
        assert cleared.quote.settlement_policy is None
        assert cleared.quote.affects_cash_drawer is None
        assert cleared.quote.requires_evidence is None
        assert cleared.quote.payment_reference == "AUT 4421"
        cleared_response = _quote_detail_response(cleared)
        assert cleared_response.payment_method is None
        assert cleared_response.reference == "AUT 4421"

        reference_cleared = service.update_quote(
            principal=principal,
            grant=manage_grant,
            quote_id=created.quote.id,
            expected_version=cleared.quote.version,
            changes={"reference": None},
        )
        assert reference_cleared.quote.payment_reference is None
