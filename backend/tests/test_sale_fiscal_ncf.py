from decimal import Decimal
from uuid import UUID, uuid7

import pytest
from app.db.models import Sale
from app.db.session import session_scope
from app.schemas.carwash_checkout import CompleteWashRequest
from app.schemas.crm import InvoiceCrmQuoteRequest
from app.schemas.pos import CheckoutLineRequest, CheckoutRequest
from app.services.fiscal_receipts import next_credit_fiscal_sequence
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from tests.customer_payloads import customer_create_payload
from tests.test_pos import (
    _bootstrap_isolated_branch,
    _create_product,
    _idempotent,
    _login,
)


def _branch_row(client: TestClient, headers: dict[str, str], branch_id: UUID) -> dict[str, object]:
    response = client.get("/api/v1/branches", headers=headers)
    assert response.status_code == 200, response.text
    return next(row for row in response.json() if row["id"] == str(branch_id))


def _unique_ncf_sequence() -> str:
    digits = f"{uuid7().int % 10**12:012d}"
    return "000000000001" if set(digits) == {"0"} else digits


def _configure_ncf(
    client: TestClient,
    headers: dict[str, str],
    branch_id: UUID,
    sequence: str | None = None,
) -> dict[str, object]:
    if sequence is None:
        sequence = _unique_ncf_sequence()
    current = _branch_row(client, headers, branch_id)
    updated = client.patch(
        f"/api/v1/branches/{branch_id}",
        headers=headers,
        json={
            "fiscalCreditNcfPrefix": "B01",
            "fiscalCreditNcfNextSequence": sequence,
            "version": current["version"],
        },
    )
    assert updated.status_code == 200, updated.text
    return updated.json()


def _open_cash_checkout(
    client: TestClient,
    headers: dict[str, str],
    branch_id: UUID,
    suffix: str,
) -> tuple[str, str, str]:
    state = client.get(
        "/api/v1/pos/state",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    assert state.status_code == 200, state.text
    methods = {method["code"]: method for method in state.json()["paymentMethods"]}
    product = _create_product(client, headers, branch_id, suffix, stock="10")
    opened = client.post(
        "/api/v1/pos/registers",
        headers=_idempotent(headers, f"ncf-open-{suffix}"),
        json={"branchId": str(branch_id), "openingCash": "0.00", "currency": "DOP"},
    )
    assert opened.status_code == 201, opened.text
    return str(product["id"]), methods["cash"]["id"], opened.json()["id"]


def _sale_count(workspace_id: UUID) -> int:
    with session_scope() as session:
        return int(
            session.scalar(
                select(func.count()).select_from(Sale).where(Sale.workspace_id == workspace_id)
            )
            or 0
        )


def test_checkout_and_invoice_payloads_default_emit_ncf_off() -> None:
    checkout = CheckoutRequest(
        branch_id=uuid7(),
        register_id=uuid7(),
        payment_method_id=uuid7(),
        lines=[CheckoutLineRequest(item_id=uuid7(), quantity=Decimal("1"))],
    )
    assert checkout.emit_ncf is False
    invoice = InvoiceCrmQuoteRequest(version=1, payment_method_id=uuid7())
    assert invoice.emit_ncf is False
    wash = CompleteWashRequest(
        version=1,
        register_id=uuid7(),
        payment_method_id=uuid7(),
    )
    assert wash.emit_ncf is False


@pytest.mark.integration
def test_checkout_emits_ncf_only_when_requested(client: TestClient) -> None:
    _summary, branch_id = _bootstrap_isolated_branch()
    headers = _login(client)
    suffix = uuid7().hex[-12:]
    product_id, cash_id, register_id = _open_cash_checkout(client, headers, branch_id, suffix)
    sequence = _unique_ncf_sequence()
    configured = _configure_ncf(client, headers, branch_id, sequence)
    assert configured["fiscalCreditNcfNextSequence"] == sequence
    expected_ncf = f"B01{sequence}"
    expected_next = next_credit_fiscal_sequence(sequence)
    payload = {
        "branchId": str(branch_id),
        "registerId": register_id,
        "paymentMethodId": cash_id,
        "lines": [{"itemId": product_id, "quantity": "1"}],
    }

    silent = client.post(
        "/api/v1/pos/checkout",
        headers=_idempotent(headers, f"ncf-off-{suffix}"),
        json=payload,
    )
    assert silent.status_code == 201, silent.text
    assert silent.json()["fiscalNcf"] is None
    after_silent = _branch_row(client, headers, branch_id)
    assert after_silent["fiscalCreditNcfNextSequence"] == sequence
    assert after_silent["version"] == configured["version"]

    emitted = client.post(
        "/api/v1/pos/checkout",
        headers=_idempotent(headers, f"ncf-on-{suffix}"),
        json={**payload, "emitNcf": True},
    )
    assert emitted.status_code == 201, emitted.text
    assert emitted.json()["fiscalNcf"] == expected_ncf
    after_emit = _branch_row(client, headers, branch_id)
    assert after_emit["fiscalCreditNcfPrefix"] == "B01"
    assert after_emit["fiscalCreditNcfNextSequence"] == expected_next
    assert after_emit["version"] == configured["version"] + 1

    replay = client.post(
        "/api/v1/pos/checkout",
        headers=_idempotent(headers, f"ncf-on-{suffix}"),
        json={**payload, "emitNcf": True},
    )
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == emitted.json()["id"]
    assert replay.json()["fiscalNcf"] == expected_ncf
    after_replay = _branch_row(client, headers, branch_id)
    assert after_replay["fiscalCreditNcfNextSequence"] == expected_next
    assert after_replay["version"] == after_emit["version"]

    voided = client.post(
        f"/api/v1/pos/sales/{emitted.json()['id']}/void",
        headers=_idempotent(headers, f"ncf-void-{suffix}"),
        json={"reason": "Anulación de prueba NCF", "version": emitted.json()["version"]},
    )
    assert voided.status_code == 200, voided.text
    after_void = _branch_row(client, headers, branch_id)
    assert after_void["fiscalCreditNcfNextSequence"] == expected_next
    with session_scope() as session:
        stored = session.get(Sale, UUID(emitted.json()["id"]))
        assert stored is not None
        assert stored.fiscal_ncf == expected_ncf
        assert stored.status == "voided"


@pytest.mark.integration
def test_checkout_rejects_ncf_without_sequence_and_does_not_create_sale(
    client: TestClient,
) -> None:
    summary, branch_id = _bootstrap_isolated_branch()
    headers = _login(client)
    suffix = uuid7().hex[-12:]
    product_id, cash_id, register_id = _open_cash_checkout(client, headers, branch_id, suffix)
    before = _sale_count(summary.workspace_id)
    failed = client.post(
        "/api/v1/pos/checkout",
        headers=_idempotent(headers, f"ncf-missing-{suffix}"),
        json={
            "branchId": str(branch_id),
            "registerId": register_id,
            "paymentMethodId": cash_id,
            "lines": [{"itemId": product_id, "quantity": "1"}],
            "emitNcf": True,
        },
    )
    assert failed.status_code == 400, failed.text
    assert failed.json()["parameter"] == "emitNcf"
    assert _sale_count(summary.workspace_id) == before
    branch = _branch_row(client, headers, branch_id)
    assert branch["fiscalCreditNcfPrefix"] is None
    assert branch["fiscalCreditNcfNextSequence"] is None


@pytest.mark.integration
def test_crm_invoice_emits_ncf_from_the_same_checkout(client: TestClient) -> None:
    _summary, branch_id = _bootstrap_isolated_branch()
    headers = _login(client)
    suffix = uuid7().hex[-12:]
    product_id, cash_id, _register_id = _open_cash_checkout(client, headers, branch_id, suffix)
    sequence = _unique_ncf_sequence()
    _configure_ncf(client, headers, branch_id, sequence)
    customer = client.post(
        "/api/v1/customers",
        headers=headers,
        json=customer_create_payload(
            display_name=f"Cliente NCF {suffix}",
            branch_id=branch_id,
        ),
    )
    assert customer.status_code == 201, customer.text
    quote = client.post(
        "/api/v1/crm/quotes",
        headers=_idempotent(headers, f"ncf-crm-quote-{suffix}"),
        json={
            "customerId": customer.json()["id"],
            "branchId": str(branch_id),
            "lines": [{"itemId": product_id, "quantity": "1"}],
            "status": "aceptada",
        },
    )
    assert quote.status_code == 201, quote.text
    invoice = client.post(
        f"/api/v1/crm/quotes/{quote.json()['quote']['id']}/invoice",
        headers=_idempotent(headers, f"ncf-crm-invoice-{suffix}"),
        json={
            "version": quote.json()["quote"]["version"],
            "paymentMethodId": cash_id,
            "collectionMode": "now",
            "emitNcf": True,
        },
    )
    assert invoice.status_code == 201, invoice.text
    assert invoice.json()["fiscalNcf"] == f"B01{sequence}"
    after = _branch_row(client, headers, branch_id)
    assert after["fiscalCreditNcfNextSequence"] == next_credit_fiscal_sequence(sequence)
