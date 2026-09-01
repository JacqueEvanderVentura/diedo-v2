from datetime import UTC, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid7

import pytest
from app.api.routers.pos import _quote_line_response, _sale_line_response
from app.db.models import Branch, CashRegister, PaymentMethod, SalesQuote
from app.db.session import get_session_factory, session_scope
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import ConflictError, InvalidOperationError
from app.services.local_bootstrap import BootstrapSummary, bootstrap_local_foundation
from app.services.pos import PosService
from sqlalchemy import select
from sqlalchemy.orm import Session


def _quote_line() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid7(),
        item_id=uuid7(),
        item_name="Artículo fraccionado",
        item_sku="FRAC-1",
        quantity=Decimal("0.500"),
        unit_price=Decimal("0.01"),
        discount_amount=Decimal("0.00"),
        tax_rate=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        line_total=Decimal("0.01"),
    )


def test_quote_and_sale_line_subtotals_use_currency_rounding() -> None:
    line = _quote_line()

    assert _quote_line_response(line).subtotal == Decimal("0.01")
    assert _sale_line_response(line).subtotal == Decimal("0.01")


def _add_quote(
    session: Session,
    *,
    summary: BootstrapSummary,
    branch_id: UUID,
    expires_at: datetime,
) -> SalesQuote:
    suffix = uuid7().hex[:20]
    quote = SalesQuote(
        workspace_id=summary.workspace_id,
        branch_id=branch_id,
        document_number=f"EXP-{suffix}",
        kind="quote",
        origin="pos",
        status="open",
        currency_code="DOP",
        subtotal=Decimal("0.00"),
        discount_mode="pct",
        discount_value=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        total=Decimal("0.00"),
        expires_at=expires_at,
        creation_idempotency_key=f"quote-expiration-{suffix}",
        request_fingerprint="f" * 64,
        created_by_platform_user_id=summary.platform_user_id,
        updated_by_platform_user_id=summary.platform_user_id,
    )
    session.add(quote)
    session.flush()
    return quote


@pytest.mark.integration
def test_expired_quotes_are_materialized_and_rejected_transactionally() -> None:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session)
        suffix = uuid7().hex[-12:]
        branch = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=f"EXP-{suffix}",
            name=f"Quote expiration {suffix}",
            status="active",
            timezone="America/Santo_Domingo",
        )
        session.add(branch)
        session.flush()
        list_quote = _add_quote(
            session,
            summary=summary,
            branch_id=branch.id,
            expires_at=datetime.now(UTC) - timedelta(minutes=1),
        )
        cash_method = session.scalar(
            select(PaymentMethod).where(
                PaymentMethod.workspace_id == summary.workspace_id,
                PaymentMethod.code == "cash",
            )
        )
        assert cash_method is not None
        register = CashRegister(
            workspace_id=summary.workspace_id,
            branch_id=branch.id,
            status="open",
            currency_code="DOP",
            opening_cash=Decimal("0.00"),
            opened_by_membership_id=summary.membership_id,
            opened_by_platform_user_id=summary.platform_user_id,
            opened_by_name="Local Owner",
            open_idempotency_key=f"register-expiration-{suffix}",
            open_request_fingerprint="a" * 64,
        )
        session.add(register)
        session.flush()
        branch_id = branch.id
        list_quote_id = list_quote.id
        cash_method_id = cash_method.id
        register_id = register.id

    principal = AuthPrincipal(
        platform_user_id=summary.platform_user_id,
        membership_id=summary.membership_id,
        workspace_id=summary.workspace_id,
        session_id=uuid7(),
        email="owner@erp.dev",
        display_name="Local Owner",
    )
    sales_grant = PermissionGrant(
        permission_code="sales.read",
        workspace_id=summary.workspace_id,
        membership_id=summary.membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    manage_grant = PermissionGrant(
        permission_code="sales.quote.manage",
        workspace_id=summary.workspace_id,
        membership_id=summary.membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    sell_grant = PermissionGrant(
        permission_code="pos.sell",
        workspace_id=summary.workspace_id,
        membership_id=summary.membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )

    with get_session_factory()() as session:
        service = PosService(session)
        open_page = service.list_quotes(
            sales_grant,
            branch_id=branch_id,
            customer_id=None,
            status="open",
            kind=None,
            page=1,
            page_size=50,
        )
        assert list_quote_id not in {record.quote.id for record in open_page.items}

        expired_record = service.get_quote(sales_grant, list_quote_id)
        assert expired_record.quote.status == "expired"
        assert expired_record.quote.closed_at is not None
        assert expired_record.quote.version == 2

        edit_quote = _add_quote(
            session,
            summary=summary,
            branch_id=branch_id,
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )
        edit_quote_id = edit_quote.id
        session.commit()

        with pytest.raises(ConflictError, match="expiró") as edit_error:
            service.update_quote(
                principal=principal,
                grant=manage_grant,
                quote_id=edit_quote_id,
                expected_version=1,
                changes={"notes": "No debe persistirse"},
            )
        assert edit_error.value.parameter == "status"
        persisted_edit_quote = session.get(SalesQuote, edit_quote_id)
        assert persisted_edit_quote is not None
        session.refresh(persisted_edit_quote)
        assert persisted_edit_quote.status == "expired"
        assert persisted_edit_quote.closed_at is not None
        assert persisted_edit_quote.version == 2

        future_quote = _add_quote(
            session,
            summary=summary,
            branch_id=branch_id,
            expires_at=datetime.now(UTC) + timedelta(hours=1),
        )
        future_quote_id = future_quote.id
        session.commit()

        with pytest.raises(InvalidOperationError, match="futuro") as update_error:
            service.update_quote(
                principal=principal,
                grant=manage_grant,
                quote_id=future_quote_id,
                expected_version=1,
                changes={"due_at": datetime.now(UTC) - timedelta(seconds=1)},
            )
        assert update_error.value.parameter == "dueAt"
        session.rollback()
        persisted_future_quote = session.get(SalesQuote, future_quote_id)
        assert persisted_future_quote is not None
        assert persisted_future_quote.status == "open"
        assert persisted_future_quote.version == 1

        checkout_quote = _add_quote(
            session,
            summary=summary,
            branch_id=branch_id,
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )
        checkout_quote_id = checkout_quote.id
        session.commit()

        with pytest.raises(ConflictError, match="expiró") as checkout_error:
            service.checkout(
                principal=principal,
                grant=sell_grant,
                values={
                    "branch_id": branch_id,
                    "register_id": register_id,
                    "payment_method_id": cash_method_id,
                    "quote_id": checkout_quote_id,
                    "quote_version": 1,
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
                idempotency_key=f"checkout-expiration-{uuid7().hex[:16]}",
            )
        assert checkout_error.value.parameter == "quoteId"
        persisted_checkout_quote = session.get(SalesQuote, checkout_quote_id)
        assert persisted_checkout_quote is not None
        session.refresh(persisted_checkout_quote)
        assert persisted_checkout_quote.status == "expired"
        assert persisted_checkout_quote.closed_at is not None
        assert persisted_checkout_quote.version == 2

        with pytest.raises(InvalidOperationError, match="futuro") as create_error:
            service.create_quote(
                principal=principal,
                grant=manage_grant,
                values={
                    "branch_id": branch_id,
                    "kind": "quote",
                    "lines": [],
                    "due_at": datetime.now(UTC) - timedelta(seconds=1),
                },
                idempotency_key=f"past-due-quote-{uuid7().hex[:16]}",
            )
        assert create_error.value.parameter == "dueAt"
