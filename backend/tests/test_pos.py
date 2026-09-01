from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from threading import Barrier
from typing import Any, cast
from uuid import UUID, uuid7

import pytest
from app.api.deps import get_attachment_storage
from app.core.security import hash_password
from app.db.models import (
    AccessScope,
    AppointmentResource,
    Branch,
    CashMovement,
    PaymentProof,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    Sale,
    WorkspaceMembership,
)
from app.db.session import get_session_factory, session_scope
from app.main import app
from app.schemas.administration import CreatePaymentMethodRequest, UpdatePaymentMethodRequest
from app.schemas.pos import (
    CheckoutLineRequest,
    CheckoutRequest,
    OpenRegisterRequest,
    UpdateQuoteRequest,
)
from app.services.attachment_storage import LocalAttachmentStorage
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import ConflictError
from app.services.local_bootstrap import BootstrapSummary, bootstrap_local_foundation
from app.services.pos import PosService
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "pos-owner-password-not-a-secret"
_POS_READER_PASSWORD = "pos-reader-password-not-a-secret"
_REGISTER_MANAGER_PASSWORD = "register-manager-password-not-a-secret"
_PNG_PROOF = b"\x89PNG\r\n\x1a\nterminal-pos-proof"


def _bootstrap_isolated_branch() -> tuple[BootstrapSummary, UUID]:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
        suffix = uuid7().hex[-12:]
        branch = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=f"POS-{suffix}",
            name=f"POS Test {suffix}",
            status="active",
            timezone="America/Santo_Domingo",
        )
        session.add(branch)
        session.flush()
        branch_id = branch.id

    # Bootstrap creates the default warehouse for every active branch and is
    # deliberately exercised twice to preserve its idempotency guarantee.
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
    return summary, branch_id


def _create_branch_scoped_pos_user(
    workspace_id: UUID,
    branch_id: UUID,
    *,
    permission_codes: set[str],
    password: str,
    user_prefix: str,
) -> str:
    with session_scope() as session:
        now = datetime.now(UTC)
        suffix = uuid7().hex[-12:]
        email = f"{user_prefix}-{suffix}@example.com"
        branch = session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
            )
        )
        permissions = session.scalars(
            select(Permission).where(Permission.code.in_(permission_codes))
        ).all()
        assert branch is not None
        assert {permission.code for permission in permissions} == permission_codes
        scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == workspace_id,
                AccessScope.scope_type == "branch",
                AccessScope.branch_id == branch_id,
            )
        )
        if scope is None:
            scope = AccessScope(
                workspace_id=workspace_id,
                scope_type="branch",
                legal_entity_id=branch.legal_entity_id,
                branch_id=branch.id,
            )
            session.add(scope)
            session.flush()
        user = PlatformUser(
            external_subject=f"password:{user_prefix}-{suffix}",
            email=email,
            normalized_email=email,
            display_name=user_prefix.replace("-", " ").title(),
            password_hash=hash_password(password),
            password_changed_at=now,
            status="active",
        )
        role = Role(
            workspace_id=workspace_id,
            code=f"{user_prefix.replace('-', '_')}_{suffix}",
            name=f"{user_prefix.replace('-', ' ').title()} {suffix}",
            status="active",
            is_system=False,
        )
        session.add_all([user, role])
        session.flush()
        membership = WorkspaceMembership(
            workspace_id=workspace_id,
            platform_user_id=user.id,
            status="active",
            invited_at=now,
            activated_at=now,
            is_default=True,
        )
        session.add(membership)
        session.flush()
        session.add_all(
            [
                *(
                    RolePermission(
                        workspace_id=workspace_id,
                        role_id=role.id,
                        permission_id=permission.id,
                    )
                    for permission in permissions
                ),
                RoleAssignment(
                    workspace_id=workspace_id,
                    membership_id=membership.id,
                    role_id=role.id,
                    access_scope_id=scope.id,
                    status="active",
                    valid_from=now,
                ),
            ]
        )
        return email


def _create_branch_pos_reader(workspace_id: UUID, branch_id: UUID) -> str:
    return _create_branch_scoped_pos_user(
        workspace_id,
        branch_id,
        permission_codes={"pos.read"},
        password=_POS_READER_PASSWORD,
        user_prefix="pos-reader",
    )


def _login_as(client: TestClient, email: str, password: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def _login(client: TestClient) -> dict[str, str]:
    return _login_as(client, _OWNER_EMAIL, _OWNER_PASSWORD)


def _idempotent(headers: dict[str, str], key: str) -> dict[str, str]:
    return {**headers, "Idempotency-Key": key}


def _create_product(
    client: TestClient,
    headers: dict[str, str],
    branch_id: UUID,
    suffix: str,
    *,
    stock: str = "12",
) -> dict[str, Any]:
    category_response = client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": f"POS Category {suffix}"},
    )
    assert category_response.status_code == 201, category_response.text
    units_response = client.get("/api/v1/catalog/units-of-measure", headers=headers)
    assert units_response.status_code == 200, units_response.text
    unit_id = units_response.json()[0]["id"]
    response = client.post(
        "/api/v1/inventory/products",
        headers=_idempotent(headers, f"pos-product-{suffix}"),
        json={
            "name": f"POS Product {suffix}",
            "sku": f"POS-{suffix}",
            "categoryId": category_response.json()["id"],
            "unitOfMeasureId": unit_id,
            "branchId": str(branch_id),
            "salePrice": "10.00",
            "unitCost": "4.00",
            "taxRate": "0.00",
            "stock": stock,
            "minimumStock": "0",
        },
    )
    assert response.status_code == 201, response.text
    return cast(dict[str, Any], response.json())


def _stock(
    client: TestClient,
    headers: dict[str, str],
    branch_id: UUID,
    item_id: str,
) -> Decimal:
    response = client.get(
        f"/api/v1/inventory/items/{item_id}",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    assert response.status_code == 200, response.text
    return Decimal(response.json()["stockQuantity"])


def test_pos_request_and_payment_method_schemas_reject_ambiguous_input() -> None:
    register = OpenRegisterRequest(
        branch_id=uuid7(),
        opening_cash=Decimal("10.00"),
        currency="dop",
        notes="  Inicio   de turno  ",
    )
    assert register.currency == "DOP"
    assert register.notes == "Inicio de turno"

    item_id = uuid7()
    with pytest.raises(ValidationError, match="No repitas ítems"):
        CheckoutRequest(
            branch_id=uuid7(),
            register_id=uuid7(),
            payment_method_id=uuid7(),
            lines=[
                CheckoutLineRequest(item_id=item_id, quantity=Decimal("1")),
                CheckoutLineRequest(item_id=item_id, quantity=Decimal("2")),
            ],
        )
    with pytest.raises(ValidationError, match="juntos"):
        CheckoutRequest(
            branch_id=uuid7(),
            register_id=uuid7(),
            payment_method_id=uuid7(),
            discount_type="percent",
            lines=[CheckoutLineRequest(item_id=uuid7(), quantity=Decimal("1"))],
        )
    with pytest.raises(ValidationError, match="al menos un cambio"):
        UpdateQuoteRequest(version=1)

    transfer = CreatePaymentMethodRequest(
        code="Transfer-Test",
        name="Transferencia",
        channel="bank_transfer",
        settlement_policy="pending_confirmation",
        requires_evidence=True,
    )
    assert transfer.code == "transfer-test"
    assert transfer.requires_evidence is True
    with pytest.raises(ValidationError, match="channel cash"):
        CreatePaymentMethodRequest(
            code="card-cash",
            name="Tarjeta incorrecta",
            channel="card",
            affects_cash_drawer=True,
        )
    with pytest.raises(ValidationError, match="comprobante"):
        CreatePaymentMethodRequest(
            code="instant-proof",
            name="Comprobante inmediato inválido",
            settlement_policy="immediate",
            requires_evidence=True,
        )
    with pytest.raises(ValidationError, match="comprobante"):
        UpdatePaymentMethodRequest(
            version=1,
            settlement_policy="immediate",
            requires_evidence=True,
        )


@pytest.mark.integration
def test_register_manager_mutations_do_not_disclose_cash_movements(client: TestClient) -> None:
    summary, branch_id = _bootstrap_isolated_branch()
    email = _create_branch_scoped_pos_user(
        summary.workspace_id,
        branch_id,
        permission_codes={"pos.register.manage"},
        password=_REGISTER_MANAGER_PASSWORD,
        user_prefix="register-manager",
    )
    headers = _login_as(client, email, _REGISTER_MANAGER_PASSWORD)
    opened_response = client.post(
        "/api/v1/pos/registers",
        headers=_idempotent(headers, f"register-manager-open-{uuid7()}"),
        json={
            "branchId": str(branch_id),
            "openingCash": "25.00",
            "currency": "DOP",
        },
    )
    assert opened_response.status_code == 201, opened_response.text
    opened = opened_response.json()
    assert opened["summary"]["expectedCash"] == "25.00"
    assert "movements" not in opened

    current_response = client.get(
        "/api/v1/pos/registers/current",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    assert current_response.status_code == 403, current_response.text
    close_response = client.post(
        f"/api/v1/pos/registers/{opened['id']}/close",
        headers=_idempotent(headers, f"register-manager-close-{uuid7()}"),
        json={"countedCash": "25.00", "version": opened["version"]},
    )
    assert close_response.status_code == 200, close_response.text
    assert close_response.json()["status"] == "closed"
    assert "movements" not in close_response.json()


@pytest.mark.integration
def test_terminal_pos_complete_http_flow(client: TestClient, tmp_path: Path) -> None:
    summary, branch_id = _bootstrap_isolated_branch()
    headers = _login(client)
    suffix = uuid7().hex[-12:]
    storage = LocalAttachmentStorage(tmp_path / "pos-proofs")
    app.dependency_overrides[get_attachment_storage] = lambda: storage
    try:
        unauthenticated = client.get("/api/v1/pos/state", params={"branchId": str(branch_id)})
        assert unauthenticated.status_code == 401

        initial_state = client.get(
            "/api/v1/pos/state",
            headers=headers,
            params={"branchId": str(branch_id)},
        )
        assert initial_state.status_code == 200, initial_state.text
        assert initial_state.headers["cache-control"] == "no-store"
        assert initial_state.json()["branchId"] == str(branch_id)
        assert initial_state.json()["register"] is None
        methods = {method["code"]: method for method in initial_state.json()["paymentMethods"]}
        assert {
            code: (
                method["channel"],
                method["settlementPolicy"],
                method["affectsCashDrawer"],
                method["requiresEvidence"],
            )
            for code, method in methods.items()
            if code in {"cash", "card", "transfer", "payment_link", "credit"}
        } == {
            "cash": ("cash", "immediate", True, False),
            "card": ("card", "immediate", False, False),
            "transfer": ("bank_transfer", "pending_confirmation", False, True),
            "payment_link": (
                "payment_link",
                "pending_confirmation",
                False,
                True,
            ),
            "credit": ("credit", "receivable", False, False),
        }

        inverted_summary = client.get(
            "/api/v1/pos/sales/summary",
            headers=headers,
            params={
                "branchId": str(branch_id),
                "dateFrom": "2026-09-02",
                "dateTo": "2026-09-01",
            },
        )
        assert inverted_summary.status_code == 400, inverted_summary.text
        assert inverted_summary.json()["parameter"] == "dateFrom"

        product = _create_product(client, headers, branch_id, suffix)
        product_id = str(product["id"])
        state_with_catalog = client.get(
            "/api/v1/pos/state",
            headers=headers,
            params={"branchId": str(branch_id)},
        )
        assert state_with_catalog.status_code == 200, state_with_catalog.text
        catalog_by_id = {item["id"]: item for item in state_with_catalog.json()["catalog"]}
        assert catalog_by_id[product_id]["salePrice"] == "10.00"
        assert catalog_by_id[product_id]["stockQuantity"] == "12.000"

        open_payload = {
            "branchId": str(branch_id),
            "openingCash": "100.00",
            "currency": "dop",
            "notes": "Turno principal",
        }
        wrong_currency = client.post(
            "/api/v1/pos/registers",
            headers=_idempotent(headers, f"pos-open-wrong-currency-{suffix}"),
            json={**open_payload, "currency": "usd"},
        )
        assert wrong_currency.status_code == 400, wrong_currency.text
        assert wrong_currency.json()["parameter"] == "currency"

        open_key = f"pos-open-{suffix}"
        opened = client.post(
            "/api/v1/pos/registers",
            headers=_idempotent(headers, open_key),
            json=open_payload,
        )
        assert opened.status_code == 201, opened.text
        register = opened.json()
        register_id = register["id"]
        assert register["currency"] == "DOP"
        assert register["expectedCash"] == "100.00"

        replayed_open = client.post(
            "/api/v1/pos/registers",
            headers=_idempotent(headers, open_key),
            json=open_payload,
        )
        assert replayed_open.status_code == 201, replayed_open.text
        assert replayed_open.json()["id"] == register_id
        reused_open_key = client.post(
            "/api/v1/pos/registers",
            headers=_idempotent(headers, open_key),
            json={**open_payload, "openingCash": "99.00"},
        )
        assert reused_open_key.status_code == 409
        assert reused_open_key.json()["parameter"] == "Idempotency-Key"
        second_open = client.post(
            "/api/v1/pos/registers",
            headers=_idempotent(headers, f"pos-open-second-{suffix}"),
            json=open_payload,
        )
        assert second_open.status_code == 409
        assert second_open.json()["parameter"] == "branchId"

        cash_checkout_payload = {
            "branchId": str(branch_id),
            "registerId": register_id,
            "paymentMethodId": methods["cash"]["id"],
            "reference": f"CASH-{suffix}",
            "lines": [{"itemId": product_id, "quantity": "2"}],
            "notes": "Venta de contado",
        }
        cash_checkout_key = f"pos-checkout-cash-{suffix}"
        cash_checkout = client.post(
            "/api/v1/pos/checkout",
            headers=_idempotent(headers, cash_checkout_key),
            json=cash_checkout_payload,
        )
        assert cash_checkout.status_code == 201, cash_checkout.text
        cash_sale = cash_checkout.json()
        assert cash_sale["total"] == "20.00"
        assert cash_sale["receivableId"] is None
        assert cash_sale["inventoryMovementId"] is not None
        assert cash_sale["payment"]["paymentMethod"]["code"] == "cash"

        replayed_checkout = client.post(
            "/api/v1/pos/checkout",
            headers=_idempotent(headers, cash_checkout_key),
            json=cash_checkout_payload,
        )
        assert replayed_checkout.status_code == 201, replayed_checkout.text
        assert replayed_checkout.json()["id"] == cash_sale["id"]
        reused_checkout_key = client.post(
            "/api/v1/pos/checkout",
            headers=_idempotent(headers, cash_checkout_key),
            json={
                **cash_checkout_payload,
                "lines": [{"itemId": product_id, "quantity": "1"}],
            },
        )
        assert reused_checkout_key.status_code == 409
        assert reused_checkout_key.json()["parameter"] == "Idempotency-Key"
        assert _stock(client, headers, branch_id, product_id) == Decimal("10.000")
        with session_scope() as session:
            assert (
                session.scalar(
                    select(func.count())
                    .select_from(Sale)
                    .where(
                        Sale.workspace_id == summary.workspace_id,
                        Sale.creation_idempotency_key == cash_checkout_key,
                    )
                )
                == 1
            )
            assert (
                session.scalar(
                    select(func.count())
                    .select_from(CashMovement)
                    .where(
                        CashMovement.workspace_id == summary.workspace_id,
                        CashMovement.sale_id == UUID(cash_sale["id"]),
                    )
                )
                == 1
            )

        customer_response = client.post(
            "/api/v1/customers",
            headers=headers,
            json={
                "customerType": "person",
                "displayName": f"POS Customer {suffix}",
                "firstName": "Cliente",
                "lastName": suffix,
                "email": f"pos.customer.{suffix}@example.com",
                "branchIds": [str(branch_id)],
            },
        )
        assert customer_response.status_code == 201, customer_response.text
        customer_id = customer_response.json()["id"]
        credit_payload = {
            "branchId": str(branch_id),
            "registerId": register_id,
            "paymentMethodId": methods["credit"]["id"],
            "lines": [{"itemId": product_id, "quantity": "3"}],
            "notes": "Venta a crédito",
        }
        credit_without_customer = client.post(
            "/api/v1/pos/checkout",
            headers=_idempotent(headers, f"pos-credit-no-customer-{suffix}"),
            json=credit_payload,
        )
        assert credit_without_customer.status_code == 400
        assert credit_without_customer.json()["parameter"] == "customerId"
        assert _stock(client, headers, branch_id, product_id) == Decimal("10.000")

        credit_checkout = client.post(
            "/api/v1/pos/checkout",
            headers=_idempotent(headers, f"pos-credit-{suffix}"),
            json={**credit_payload, "customerId": customer_id},
        )
        assert credit_checkout.status_code == 201, credit_checkout.text
        credit_sale = credit_checkout.json()
        assert credit_sale["total"] == "30.00"
        assert credit_sale["payment"] is None
        receivable_id = credit_sale["receivableId"]
        assert receivable_id is not None

        renamed_customer_response = client.patch(
            f"/api/v1/customers/{customer_id}",
            headers=headers,
            json={
                "displayName": f"POS Customer Renamed {suffix}",
                "version": customer_response.json()["version"],
            },
        )
        assert renamed_customer_response.status_code == 200, renamed_customer_response.text
        historical_sale_response = client.get(
            f"/api/v1/pos/sales/{credit_sale['id']}", headers=headers
        )
        assert historical_sale_response.status_code == 200, historical_sale_response.text
        assert historical_sale_response.json()["customer"]["name"] == f"POS Customer {suffix}"

        receivable_response = client.get(
            f"/api/v1/pos/receivables/{receivable_id}", headers=headers
        )
        assert receivable_response.status_code == 200, receivable_response.text
        receivable = receivable_response.json()
        assert receivable["status"] == "pending"
        assert receivable["originalAmount"] == "30.00"
        assert receivable["balance"] == "30.00"
        assert receivable["version"] == 1

        direct_cancel = client.post(
            f"/api/v1/pos/receivables/{receivable_id}/cancel",
            headers=headers,
            json={"version": receivable["version"], "reason": "No debe desacoplar la venta"},
        )
        assert direct_cancel.status_code == 409, direct_cancel.text
        assert direct_cancel.json()["parameter"] == "saleId"

        proof_response = client.post(
            f"/api/v1/pos/receivables/{receivable_id}/proofs",
            headers=_idempotent(headers, f"pos-proof-{suffix}"),
            files={"file": ("proof.png", _PNG_PROOF, "image/png")},
        )
        assert proof_response.status_code == 201, proof_response.text
        proof = proof_response.json()
        assert proof["ownerType"] == "receivable"
        assert proof["ownerId"] == receivable_id
        proof_content = client.get(proof["contentUrl"], headers=headers)
        assert proof_content.status_code == 200, proof_content.text
        assert proof_content.content == _PNG_PROOF
        assert proof_content.headers["content-type"].startswith("image/png")
        assert proof_content.headers["cache-control"] == "private, no-store"
        assert proof_content.headers["etag"] == f'"{proof["checksum"]}"'
        duplicate_proof_response = client.post(
            f"/api/v1/pos/receivables/{receivable_id}/proofs",
            headers=_idempotent(headers, f"pos-proof-duplicate-{suffix}"),
            files={"file": ("same-content.png", _PNG_PROOF, "image/png")},
        )
        assert duplicate_proof_response.status_code == 201, duplicate_proof_response.text
        duplicate_proof = duplicate_proof_response.json()
        assert duplicate_proof["id"] == proof["id"]
        assert duplicate_proof["checksum"] == proof["checksum"]
        with session_scope() as session:
            assert (
                session.scalar(
                    select(func.count(PaymentProof.id)).where(
                        PaymentProof.workspace_id == summary.workspace_id,
                        PaymentProof.receivable_id == UUID(receivable_id),
                        PaymentProof.checksum_sha256 == proof["checksum"],
                    )
                )
                == 1
            )

        partial_key = f"pos-payment-partial-{suffix}"
        partial_payment_data = {
            "amount": "10.00",
            "methodId": methods["cash"]["id"],
            "registerId": register_id,
            "version": "1",
            "reference": f"PARTIAL-{suffix}",
        }
        collector_email = _create_branch_scoped_pos_user(
            summary.workspace_id,
            branch_id,
            permission_codes={"pos.receivables.collect"},
            password=_REGISTER_MANAGER_PASSWORD,
            user_prefix="receivables-collector",
        )
        collector_headers = _login_as(client, collector_email, _REGISTER_MANAGER_PASSWORD)
        partial_response = client.post(
            f"/api/v1/pos/receivables/{receivable_id}/payments",
            headers=_idempotent(collector_headers, partial_key),
            data=partial_payment_data,
        )
        assert partial_response.status_code == 201, partial_response.text
        partial = partial_response.json()
        assert partial["status"] == "partial"
        assert partial["paidTotal"] == "10.00"
        assert partial["balance"] == "20.00"
        assert partial["version"] == 2
        assert set(partial) == {"id", "status", "paidTotal", "balance", "version"}
        collector_detail = client.get(
            f"/api/v1/pos/receivables/{receivable_id}", headers=collector_headers
        )
        assert collector_detail.status_code == 403, collector_detail.text

        overpayment = client.post(
            f"/api/v1/pos/receivables/{receivable_id}/payments",
            headers=_idempotent(headers, f"pos-payment-over-{suffix}"),
            data={
                "amount": "20.01",
                "methodId": methods["cash"]["id"],
                "registerId": register_id,
                "version": "2",
            },
        )
        assert overpayment.status_code == 400
        assert overpayment.json()["parameter"] == "amount"

        final_key = f"pos-payment-final-{suffix}"
        final_payment_data = {
            "amount": "20.00",
            "methodId": methods["cash"]["id"],
            "registerId": register_id,
            "version": "2",
            "reference": f"FINAL-{suffix}",
        }
        final_response = client.post(
            f"/api/v1/pos/receivables/{receivable_id}/payments",
            headers=_idempotent(headers, final_key),
            data=final_payment_data,
        )
        assert final_response.status_code == 201, final_response.text
        final_receivable = final_response.json()
        assert final_receivable["status"] == "paid"
        assert final_receivable["paidTotal"] == "30.00"
        assert final_receivable["balance"] == "0.00"
        assert final_receivable["version"] == 3
        final_detail_response = client.get(
            f"/api/v1/pos/receivables/{receivable_id}", headers=headers
        )
        assert final_detail_response.status_code == 200, final_detail_response.text
        final_detail = final_detail_response.json()
        assert len(final_detail["payments"]) == 2
        final_payment_id = next(
            payment["id"]
            for payment in final_detail["payments"]
            if payment["reference"] == f"FINAL-{suffix}"
        )
        replayed_final = client.post(
            f"/api/v1/pos/receivables/{receivable_id}/payments",
            headers=_idempotent(headers, final_key),
            data=final_payment_data,
        )
        assert replayed_final.status_code == 201, replayed_final.text
        assert replayed_final.json()["version"] == 3
        replayed_detail_response = client.get(
            f"/api/v1/pos/receivables/{receivable_id}", headers=headers
        )
        assert replayed_detail_response.status_code == 200, replayed_detail_response.text
        assert final_payment_id in {
            payment["id"] for payment in replayed_detail_response.json()["payments"]
        }

        held_response = client.post(
            "/api/v1/pos/quotes",
            headers=_idempotent(headers, f"pos-quote-held-{suffix}"),
            json={
                "kind": "held",
                "branchId": str(branch_id),
                "lines": [{"itemId": product_id, "quantity": "1"}],
                "notes": "Carrito guardado",
            },
        )
        assert held_response.status_code == 201, held_response.text
        held = held_response.json()
        assert held["kind"] == "held"
        assert held["status"] == "open"
        held_line_id = held["lines"][0]["id"]

        owner_state_response = client.get(
            "/api/v1/pos/state",
            headers=headers,
            params={"branchId": str(branch_id)},
        )
        assert owner_state_response.status_code == 200, owner_state_response.text
        owner_state = owner_state_response.json()
        assert owner_state["register"]["id"] == register_id
        assert cash_sale["id"] in {sale["id"] for sale in owner_state["sales"]}
        assert held["id"] in {quote["id"] for quote in owner_state["quotes"]}
        assert receivable_id in {receivable["id"] for receivable in owner_state["receivables"]}

        reader_email = _create_branch_pos_reader(summary.workspace_id, branch_id)
        reader_headers = _login_as(client, reader_email, _POS_READER_PASSWORD)
        reader_me = client.get("/api/v1/auth/me", headers=reader_headers)
        assert reader_me.status_code == 200, reader_me.text
        assert reader_me.json()["effectivePermissionCodes"] == ["pos.read"]
        reader_state_response = client.get(
            "/api/v1/pos/state",
            headers=reader_headers,
            params={"branchId": str(branch_id)},
        )
        assert reader_state_response.status_code == 200, reader_state_response.text
        reader_state = reader_state_response.json()
        assert reader_state["register"] is None
        assert reader_state["quotes"] == []
        assert reader_state["sales"] == []
        assert reader_state["receivables"] == []
        reader_receivable_summary = reader_state["receivableSummary"]
        assert {
            Decimal(reader_receivable_summary[field])
            for field in ("originalTotal", "paidTotal", "pendingTotal", "overdueTotal")
        } == {Decimal("0")}
        assert reader_receivable_summary["pendingCount"] == 0
        assert reader_receivable_summary["overdueCount"] == 0
        assert product_id in {item["id"] for item in reader_state["catalog"]}

        archived_product_response = client.patch(
            f"/api/v1/inventory/items/{product_id}",
            headers=headers,
            json={
                "version": product["version"],
                "salePrice": "25.00",
                "status": "archived",
            },
        )
        assert archived_product_response.status_code == 200, archived_product_response.text

        updated_quote_response = client.patch(
            f"/api/v1/pos/quotes/{held['id']}",
            headers=_idempotent(headers, f"pos-quote-update-{suffix}"),
            json={
                "kind": "quote",
                "notes": "Cotización confirmada",
                "version": held["version"],
            },
        )
        assert updated_quote_response.status_code == 200, updated_quote_response.text
        updated_quote = updated_quote_response.json()
        assert updated_quote["kind"] == "quote"
        assert updated_quote["notes"] == "Cotización confirmada"
        assert updated_quote["total"] == held["total"] == "10.00"
        assert updated_quote["lines"][0]["id"] == held_line_id
        assert updated_quote["lines"][0]["unitPrice"] == "10.00"

        restored_product_response = client.patch(
            f"/api/v1/inventory/items/{product_id}",
            headers=headers,
            json={
                "version": archived_product_response.json()["version"],
                "salePrice": "10.00",
                "status": "active",
            },
        )
        assert restored_product_response.status_code == 200, restored_product_response.text
        quote_checkout = client.post(
            "/api/v1/pos/checkout",
            headers=_idempotent(headers, f"pos-quote-convert-{suffix}"),
            json={
                "branchId": str(branch_id),
                "registerId": register_id,
                "quoteId": held["id"],
                "quoteVersion": updated_quote["version"],
                "paymentMethodId": methods["card"]["id"],
                "lines": [{"itemId": product_id, "quantity": "1"}],
            },
        )
        assert quote_checkout.status_code == 201, quote_checkout.text
        assert quote_checkout.json()["quoteId"] == held["id"]
        converted_quote = client.get(f"/api/v1/pos/quotes/{held['id']}", headers=headers)
        assert converted_quote.status_code == 200, converted_quote.text
        assert converted_quote.json()["status"] == "converted"
        assert converted_quote.json()["convertedSaleId"] == quote_checkout.json()["id"]

        cancellable_response = client.post(
            "/api/v1/pos/quotes",
            headers=_idempotent(headers, f"pos-quote-cancel-create-{suffix}"),
            json={
                "kind": "quote",
                "branchId": str(branch_id),
                "lines": [{"itemId": product_id, "quantity": "1"}],
            },
        )
        assert cancellable_response.status_code == 201, cancellable_response.text
        cancellable = cancellable_response.json()
        cancelled_response = client.post(
            f"/api/v1/pos/quotes/{cancellable['id']}/cancel",
            headers=_idempotent(headers, f"pos-quote-cancel-{suffix}"),
            json={"reason": "Cliente desistió", "version": cancellable["version"]},
        )
        assert cancelled_response.status_code == 200, cancelled_response.text
        assert cancelled_response.json()["status"] == "cancelled"

        voidable_response = client.post(
            "/api/v1/pos/checkout",
            headers=_idempotent(headers, f"pos-voidable-sale-{suffix}"),
            json={
                "branchId": str(branch_id),
                "registerId": register_id,
                "paymentMethodId": methods["cash"]["id"],
                "lines": [{"itemId": product_id, "quantity": "1"}],
            },
        )
        assert voidable_response.status_code == 201, voidable_response.text
        voidable = voidable_response.json()
        void_response = client.post(
            f"/api/v1/pos/sales/{voidable['id']}/void",
            headers=_idempotent(headers, f"pos-sale-void-{suffix}"),
            json={"reason": "Venta duplicada", "version": voidable["version"]},
        )
        assert void_response.status_code == 200, void_response.text
        assert void_response.json()["status"] == "voided"
        assert _stock(client, headers, branch_id, product_id) == Decimal("6.000")

        current_response = client.get(
            "/api/v1/pos/registers/current",
            headers=headers,
            params={"branchId": str(branch_id)},
        )
        assert current_response.status_code == 200, current_response.text
        current = current_response.json()
        assert {
            key: current["summary"][key]
            for key in (
                "openingCash",
                "cashSales",
                "cashReceivablePayments",
                "manualIncome",
                "cashExpenses",
                "expectedCash",
            )
        } == {
            "openingCash": "100.00",
            "cashSales": "20.00",
            "cashReceivablePayments": "30.00",
            "manualIncome": "0.00",
            "cashExpenses": "0.00",
            "expectedCash": "150.00",
        }
        assert current["summary"]["totalSales"] == "60.00"
        assert current["summary"]["salesCount"] == 3
        assert current["summary"]["voidedSalesCount"] == 1
        assert {
            row["paymentMethod"]["code"]: (row["salesTotal"], row["salesCount"])
            for row in current["summary"]["salesByPaymentMethod"]
        } == {
            "cash": ("20.00", 1),
            "card": ("10.00", 1),
            "credit": ("30.00", 1),
        }

        movement_page_response = client.get(
            f"/api/v1/pos/registers/{register_id}/movements",
            headers=headers,
            params={"page": 1, "pageSize": 2},
        )
        assert movement_page_response.status_code == 200, movement_page_response.text
        movement_page = movement_page_response.json()
        assert len(movement_page["items"]) == 2
        assert movement_page["totalItems"] == current["movementsTotal"]

        register_sales_response = client.get(
            "/api/v1/pos/sales",
            headers=headers,
            params={"branchId": str(branch_id), "registerId": register_id, "pageSize": 200},
        )
        assert register_sales_response.status_code == 200, register_sales_response.text
        register_sales = register_sales_response.json()
        assert register_sales["totalItems"] == 4
        assert all(item["registerId"] == register_id for item in register_sales["items"])
        assert all(item["paymentMethod"]["code"] for item in register_sales["items"])
        assert all(item["soldByName"] for item in register_sales["items"])
        assert all(item["version"] >= 1 for item in register_sales["items"])

        register_list_response = client.get(
            "/api/v1/pos/registers",
            headers=headers,
            params={"branchId": str(branch_id), "pageSize": 20},
        )
        assert register_list_response.status_code == 200, register_list_response.text
        register_list_item = next(
            item for item in register_list_response.json()["items"] if item["id"] == register_id
        )
        assert register_list_item["movementsCount"] == current["movementsTotal"]
        assert register_list_item["summary"]["totalSales"] == "60.00"

        quote_summary_response = client.get(
            "/api/v1/pos/quotes/summary",
            headers=headers,
            params={"branchId": str(branch_id)},
        )
        assert quote_summary_response.status_code == 200, quote_summary_response.text
        assert quote_summary_response.json() == {
            "openCount": 0,
            "heldCount": 0,
            "convertedCount": 1,
            "openTotal": "0.00",
            "heldTotal": "0.00",
        }
        original_void_movement = next(
            movement
            for movement in current["movements"]
            if movement["type"] == "sale" and movement["saleId"] == voidable["id"]
        )
        reversal = next(
            movement
            for movement in current["movements"]
            if movement["reversalOfId"] == original_void_movement["id"]
        )
        assert original_void_movement["cashDelta"] == "10.00"
        assert reversal["cashDelta"] == "-10.00"

        close_response = client.post(
            f"/api/v1/pos/registers/{register_id}/close",
            headers=_idempotent(headers, f"pos-close-{suffix}"),
            json={
                "countedCash": "155.00",
                "notes": "Cierre con sobrante",
                "version": current["version"],
            },
        )
        assert close_response.status_code == 200, close_response.text
        closed = close_response.json()
        assert closed["status"] == "closed"
        assert closed["expectedCash"] == "150.00"
        assert closed["countedCash"] == "155.00"
        assert closed["difference"] == "5.00"
        after_close = client.get(
            "/api/v1/pos/registers/current",
            headers=headers,
            params={"branchId": str(branch_id)},
        )
        assert after_close.status_code == 200
        assert after_close.json() is None
    finally:
        app.dependency_overrides.pop(get_attachment_storage, None)


@pytest.mark.integration
def test_agenda_receivable_keeps_original_amount_after_partial_payment_and_edit(
    client: TestClient,
) -> None:
    summary, move_branch_id = _bootstrap_isolated_branch()
    headers = _login(client)
    suffix = uuid7().hex[-12:]
    primary_branch_id = summary.branch_id
    with session_scope() as session:
        move_resource = AppointmentResource(
            workspace_id=summary.workspace_id,
            branch_id=move_branch_id,
            code=f"MOVE-{suffix}",
            name=f"Cabina traslado {suffix}",
            resource_type="room",
            status="active",
        )
        session.add(move_resource)
        session.flush()
        move_resource_id = move_resource.id

    resources_response = client.get(
        "/api/v1/appointment-resources",
        headers=headers,
        params={"branchId": str(primary_branch_id)},
    )
    assert resources_response.status_code == 200, resources_response.text
    primary_resource_id = resources_response.json()["items"][0]["id"]

    customer_response = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "customerType": "person",
            "displayName": f"Agenda CxC {suffix}",
            "firstName": "Agenda",
            "lastName": suffix,
            "email": f"agenda.receivable.{suffix}@example.com",
            "branchIds": [str(primary_branch_id), str(move_branch_id)],
        },
    )
    assert customer_response.status_code == 201, customer_response.text
    customer_id = customer_response.json()["id"]
    scheduled_date = date.today() + timedelta(days=20_000 + uuid7().int % 10_000)
    customer_name = f"Agenda CxC {suffix}"
    appointment_response = client.post(
        "/api/v1/appointments",
        headers=_idempotent(headers, f"agenda-receivable-{suffix}"),
        json={
            "branchId": str(primary_branch_id),
            "resourceId": primary_resource_id,
            "customerId": customer_id,
            "date": scheduled_date.isoformat(),
            "time": "09:00",
            "duration": 60,
            "customerName": customer_name,
            "serviceName": "Consulta con saldo",
            "price": "120.00",
            "status": "confirmed",
            "pendingPayment": True,
            "pendingAmount": "120.00",
            "notes": "Creada para regresión Agenda-CxC",
            "recurrence": "none",
            "repeatCount": 1,
        },
    )
    assert appointment_response.status_code == 201, appointment_response.text
    appointment = appointment_response.json()["items"][0]
    appointment_id = appointment["id"]
    assert appointment["pendingPayment"] is True
    assert appointment["pendingAmount"] == "120.00"

    receivables_response = client.get(
        "/api/v1/pos/receivables",
        headers=headers,
        params={
            "branchId": str(primary_branch_id),
            "customerId": customer_id,
        },
    )
    assert receivables_response.status_code == 200, receivables_response.text
    appointment_receivables = [
        item
        for item in receivables_response.json()["items"]
        if item["appointmentId"] == appointment_id
    ]
    assert len(appointment_receivables) == 1
    receivable = appointment_receivables[0]
    receivable_id = receivable["id"]
    assert receivable["source"] == "appointment"
    assert receivable["originalAmount"] == "120.00"
    assert receivable["paidTotal"] == "0.00"
    assert receivable["balance"] == "120.00"

    state_response = client.get(
        "/api/v1/pos/state",
        headers=headers,
        params={"branchId": str(primary_branch_id)},
    )
    assert state_response.status_code == 200, state_response.text
    card_method = next(
        method for method in state_response.json()["paymentMethods"] if method["code"] == "card"
    )
    partial_response = client.post(
        f"/api/v1/pos/receivables/{receivable_id}/payments",
        headers=_idempotent(headers, f"agenda-receivable-payment-{suffix}"),
        data={
            "amount": "45.00",
            "methodId": card_method["id"],
            "version": str(receivable["version"]),
            "reference": f"AGENDA-{suffix}",
        },
    )
    assert partial_response.status_code == 201, partial_response.text
    partially_paid = partial_response.json()
    assert partially_paid["status"] == "partial"
    assert partially_paid["paidTotal"] == "45.00"
    assert partially_paid["balance"] == "75.00"

    def load_appointment(branch_id: UUID) -> dict[str, Any]:
        response = client.get(
            "/api/v1/appointments",
            headers=headers,
            params={
                "branchId": str(branch_id),
                "dateFrom": scheduled_date.isoformat(),
                "dateTo": scheduled_date.isoformat(),
                "search": suffix,
                "pageSize": 200,
            },
        )
        assert response.status_code == 200, response.text
        return cast(
            dict[str, Any],
            next(item for item in response.json()["items"] if item["id"] == appointment_id),
        )

    agenda_after_payment = load_appointment(primary_branch_id)
    assert agenda_after_payment["pendingPayment"] is True
    assert agenda_after_payment["pendingAmount"] == "75.00"

    edited_response = client.patch(
        f"/api/v1/appointments/{appointment_id}",
        headers=headers,
        json={
            "version": agenda_after_payment["version"],
            "notes": "Edición no financiera posterior al abono",
        },
    )
    assert edited_response.status_code == 200, edited_response.text
    edited = edited_response.json()
    assert edited["notes"] == "Edición no financiera posterior al abono"
    assert edited["pendingPayment"] is True
    assert edited["pendingAmount"] == "75.00"

    receivable_after_edit_response = client.get(
        f"/api/v1/pos/receivables/{receivable_id}", headers=headers
    )
    assert receivable_after_edit_response.status_code == 200, receivable_after_edit_response.text
    receivable_after_edit = receivable_after_edit_response.json()
    assert receivable_after_edit["originalAmount"] == "120.00"
    assert receivable_after_edit["paidTotal"] == "45.00"
    assert receivable_after_edit["balance"] == "75.00"
    assert len(receivable_after_edit["payments"]) == 1
    assert receivable_after_edit["payments"][0]["amount"] == "45.00"
    agenda_after_edit = load_appointment(primary_branch_id)
    assert agenda_after_edit["pendingAmount"] == "75.00"

    cancel_with_partial_payment = client.patch(
        f"/api/v1/appointments/{appointment_id}",
        headers=headers,
        json={"version": edited["version"], "status": "cancelled"},
    )
    assert cancel_with_partial_payment.status_code == 409, cancel_with_partial_payment.text
    assert cancel_with_partial_payment.json()["parameter"] == "pendingPayment"

    move_response = client.patch(
        f"/api/v1/appointments/{appointment_id}",
        headers=headers,
        json={
            "version": edited["version"],
            "branchId": str(move_branch_id),
            "resourceId": str(move_resource_id),
        },
    )
    assert move_response.status_code == 409, move_response.text
    assert move_response.json()["parameter"] == "branchId"

    agenda_after_rejected_move = load_appointment(primary_branch_id)
    assert agenda_after_rejected_move["branchId"] == str(primary_branch_id)
    assert agenda_after_rejected_move["resource"]["id"] == primary_resource_id
    assert agenda_after_rejected_move["pendingAmount"] == "75.00"
    persisted_receivable = client.get(f"/api/v1/pos/receivables/{receivable_id}", headers=headers)
    assert persisted_receivable.status_code == 200, persisted_receivable.text
    assert persisted_receivable.json()["branch"]["id"] == str(primary_branch_id)
    assert persisted_receivable.json()["originalAmount"] == "120.00"
    assert persisted_receivable.json()["paidTotal"] == "45.00"
    assert persisted_receivable.json()["balance"] == "75.00"


@pytest.mark.integration
def test_closed_register_history_and_cross_register_reversals_are_accounted(
    client: TestClient,
) -> None:
    summary, branch_id = _bootstrap_isolated_branch()
    headers = _login(client)
    suffix = uuid7().hex[-12:]

    state_response = client.get(
        "/api/v1/pos/state",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    assert state_response.status_code == 200, state_response.text
    methods = {method["code"]: method for method in state_response.json()["paymentMethods"]}
    product = _create_product(client, headers, branch_id, suffix, stock="10")
    product_id = str(product["id"])
    customer_response = client.post(
        "/api/v1/customers",
        headers=headers,
        json={
            "customerType": "person",
            "displayName": f"Historical POS Customer {suffix}",
            "firstName": "Historical",
            "lastName": suffix,
            "email": f"historical.pos.{suffix}@example.com",
            "branchIds": [str(branch_id)],
        },
    )
    assert customer_response.status_code == 201, customer_response.text
    customer_id = customer_response.json()["id"]

    open_a_response = client.post(
        "/api/v1/pos/registers",
        headers=_idempotent(headers, f"pos-history-open-a-{suffix}"),
        json={
            "branchId": str(branch_id),
            "openingCash": "100.00",
            "currency": "DOP",
            "notes": "Caja histórica A",
        },
    )
    assert open_a_response.status_code == 201, open_a_response.text
    register_a = open_a_response.json()

    cash_checkout_response = client.post(
        "/api/v1/pos/checkout",
        headers=_idempotent(headers, f"pos-history-cash-sale-{suffix}"),
        json={
            "branchId": str(branch_id),
            "registerId": register_a["id"],
            "paymentMethodId": methods["cash"]["id"],
            "lines": [{"itemId": product_id, "quantity": "2"}],
            "notes": "Venta de contado en caja A",
        },
    )
    assert cash_checkout_response.status_code == 201, cash_checkout_response.text
    cash_sale = cash_checkout_response.json()
    assert cash_sale["total"] == "20.00"

    credit_checkout_response = client.post(
        "/api/v1/pos/checkout",
        headers=_idempotent(headers, f"pos-history-credit-sale-{suffix}"),
        json={
            "branchId": str(branch_id),
            "registerId": register_a["id"],
            "customerId": customer_id,
            "paymentMethodId": methods["credit"]["id"],
            "lines": [{"itemId": product_id, "quantity": "3"}],
            "notes": "Venta a crédito en caja A",
        },
    )
    assert credit_checkout_response.status_code == 201, credit_checkout_response.text
    credit_sale = credit_checkout_response.json()
    assert credit_sale["total"] == "30.00"
    receivable_id = credit_sale["receivableId"]
    assert receivable_id is not None
    assert _stock(client, headers, branch_id, product_id) == Decimal("5.000")

    receivable_response = client.get(f"/api/v1/pos/receivables/{receivable_id}", headers=headers)
    assert receivable_response.status_code == 200, receivable_response.text
    receivable = receivable_response.json()
    collection_response = client.post(
        f"/api/v1/pos/receivables/{receivable_id}/payments",
        headers=_idempotent(headers, f"pos-history-collection-{suffix}"),
        data={
            "amount": "30.00",
            "methodId": methods["cash"]["id"],
            "registerId": register_a["id"],
            "version": str(receivable["version"]),
            "reference": f"HISTORICAL-{suffix}",
        },
    )
    assert collection_response.status_code == 201, collection_response.text
    paid_receivable = collection_response.json()
    assert paid_receivable["status"] == "paid"
    paid_receivable_detail_response = client.get(
        f"/api/v1/pos/receivables/{receivable_id}", headers=headers
    )
    assert paid_receivable_detail_response.status_code == 200, paid_receivable_detail_response.text
    collection = next(
        payment
        for payment in paid_receivable_detail_response.json()["payments"]
        if payment["reference"] == f"HISTORICAL-{suffix}"
    )

    # 03:30 UTC is still 23:30 on the previous local day in UTC-4.
    with session_scope() as session:
        persisted_cash_sale = session.scalar(
            select(Sale).where(
                Sale.workspace_id == summary.workspace_id,
                Sale.id == UUID(cash_sale["id"]),
            )
        )
        assert persisted_cash_sale is not None
        persisted_cash_sale.completed_at = datetime(2026, 9, 1, 3, 30, tzinfo=UTC)

    local_day_response = client.get(
        "/api/v1/pos/sales",
        headers=headers,
        params={
            "branchId": str(branch_id),
            "dateFrom": "2026-08-31",
            "dateTo": "2026-08-31",
            "pageSize": 200,
        },
    )
    assert local_day_response.status_code == 200, local_day_response.text
    assert cash_sale["id"] in {item["id"] for item in local_day_response.json()["items"]}
    utc_day_response = client.get(
        "/api/v1/pos/sales",
        headers=headers,
        params={
            "branchId": str(branch_id),
            "dateFrom": "2026-09-01",
            "dateTo": "2026-09-01",
            "pageSize": 200,
        },
    )
    assert utc_day_response.status_code == 200, utc_day_response.text
    assert cash_sale["id"] not in {item["id"] for item in utc_day_response.json()["items"]}

    current_a_response = client.get(
        "/api/v1/pos/registers/current",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    assert current_a_response.status_code == 200, current_a_response.text
    current_a = current_a_response.json()
    assert {
        key: current_a["summary"][key]
        for key in (
            "openingCash",
            "cashSales",
            "cashReceivablePayments",
            "manualIncome",
            "cashExpenses",
            "expectedCash",
        )
    } == {
        "openingCash": "100.00",
        "cashSales": "20.00",
        "cashReceivablePayments": "30.00",
        "manualIncome": "0.00",
        "cashExpenses": "0.00",
        "expectedCash": "150.00",
    }
    assert current_a["summary"]["totalSales"] == "50.00"
    assert current_a["summary"]["salesCount"] == 2
    assert current_a["summary"]["voidedSalesCount"] == 0
    assert {
        row["paymentMethod"]["code"]: (row["salesTotal"], row["salesCount"])
        for row in current_a["summary"]["salesByPaymentMethod"]
    } == {"cash": ("20.00", 1), "credit": ("30.00", 1)}
    a_cash_sale_movement = next(
        movement
        for movement in current_a["movements"]
        if movement["type"] == "sale" and movement["saleId"] == cash_sale["id"]
    )
    a_collection_movement = next(
        movement
        for movement in current_a["movements"]
        if movement["type"] == "receivable_payment"
        and movement["customerPaymentId"] == collection["id"]
    )

    close_a_response = client.post(
        f"/api/v1/pos/registers/{register_a['id']}/close",
        headers=_idempotent(headers, f"pos-history-close-a-{suffix}"),
        json={
            "countedCash": "150.00",
            "notes": "Caja A cerrada exactamente",
            "version": current_a["version"],
        },
    )
    assert close_a_response.status_code == 200, close_a_response.text
    closed_a = close_a_response.json()
    assert closed_a["status"] == "closed"
    assert closed_a["difference"] == "0.00"
    assert "movements" not in closed_a
    closed_a_detail_response = client.get(
        f"/api/v1/pos/registers/{register_a['id']}", headers=headers
    )
    assert closed_a_detail_response.status_code == 200, closed_a_detail_response.text
    closed_a_movement_ids = {
        movement["id"] for movement in closed_a_detail_response.json()["movements"]
    }

    product_response = client.get(f"/api/v1/catalog/products/{product_id}", headers=headers)
    assert product_response.status_code == 200, product_response.text
    archived_response = client.patch(
        f"/api/v1/catalog/products/{product_id}",
        headers=headers,
        json={"version": product_response.json()["version"], "status": "archived"},
    )
    assert archived_response.status_code == 200, archived_response.text
    assert archived_response.json()["status"] == "archived"

    open_b_response = client.post(
        "/api/v1/pos/registers",
        headers=_idempotent(headers, f"pos-history-open-b-{suffix}"),
        json={
            "branchId": str(branch_id),
            "openingCash": "75.00",
            "currency": "DOP",
            "notes": "Caja de reversas B",
        },
    )
    assert open_b_response.status_code == 201, open_b_response.text
    register_b = open_b_response.json()

    reverse_collection_response = client.post(
        f"/api/v1/pos/payments/{collection['id']}/reverse",
        headers=_idempotent(headers, f"pos-history-reverse-collection-{suffix}"),
        json={
            "reason": "Cobro aplicado por error",
            "version": collection["version"],
        },
    )
    assert reverse_collection_response.status_code == 200, reverse_collection_response.text
    pending_receivable = reverse_collection_response.json()
    assert pending_receivable["status"] == "pending"
    assert pending_receivable["paidTotal"] == "0.00"
    assert pending_receivable["balance"] == "30.00"

    void_cash_response = client.post(
        f"/api/v1/pos/sales/{cash_sale['id']}/void",
        headers=_idempotent(headers, f"pos-history-void-cash-{suffix}"),
        json={
            "reason": "Anulación histórica de contado",
            "version": cash_sale["version"],
        },
    )
    assert void_cash_response.status_code == 200, void_cash_response.text
    assert void_cash_response.json()["status"] == "voided"
    void_credit_response = client.post(
        f"/api/v1/pos/sales/{credit_sale['id']}/void",
        headers=_idempotent(headers, f"pos-history-void-credit-{suffix}"),
        json={
            "reason": "Anulación histórica a crédito",
            "version": credit_sale["version"],
        },
    )
    assert void_credit_response.status_code == 200, void_credit_response.text
    assert void_credit_response.json()["status"] == "voided"
    assert _stock(client, headers, branch_id, product_id) == Decimal("10.000")

    cancelled_receivable_response = client.get(
        f"/api/v1/pos/receivables/{receivable_id}", headers=headers
    )
    assert cancelled_receivable_response.status_code == 200, cancelled_receivable_response.text
    cancelled_receivable = cancelled_receivable_response.json()
    assert cancelled_receivable["status"] == "cancelled"
    assert cancelled_receivable["paidTotal"] == "0.00"
    assert cancelled_receivable["balance"] == "30.00"
    active_summary_response = client.get(
        "/api/v1/pos/receivables/summary",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    assert active_summary_response.status_code == 200, active_summary_response.text
    active_summary = active_summary_response.json()
    assert {
        Decimal(active_summary[field])
        for field in ("originalTotal", "paidTotal", "pendingTotal", "overdueTotal")
    } == {Decimal("0")}
    assert active_summary["pendingCount"] == 0
    assert active_summary["partialCount"] == 0
    assert active_summary["overdueCount"] == 0

    historical_a_response = client.get(f"/api/v1/pos/registers/{register_a['id']}", headers=headers)
    assert historical_a_response.status_code == 200, historical_a_response.text
    historical_a = historical_a_response.json()
    assert historical_a["status"] == "closed"
    assert historical_a["version"] == closed_a["version"]
    assert historical_a["countedCash"] == "150.00"
    assert historical_a["difference"] == "0.00"
    assert historical_a["summary"] == closed_a["summary"]
    assert {movement["id"] for movement in historical_a["movements"]} == (closed_a_movement_ids)

    current_b_response = client.get(
        "/api/v1/pos/registers/current",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    assert current_b_response.status_code == 200, current_b_response.text
    current_b = current_b_response.json()
    assert current_b["id"] == register_b["id"]
    assert {
        key: current_b["summary"][key]
        for key in (
            "openingCash",
            "cashSales",
            "cashReceivablePayments",
            "manualIncome",
            "cashExpenses",
            "expectedCash",
        )
    } == {
        "openingCash": "75.00",
        "cashSales": "0.00",
        "cashReceivablePayments": "0.00",
        "manualIncome": "0.00",
        "cashExpenses": "50.00",
        "expectedCash": "25.00",
    }
    assert current_b["summary"]["totalSales"] == "0.00"
    assert current_b["summary"]["salesCount"] == 0
    assert current_b["summary"]["voidedSalesCount"] == 0
    assert current_b["summary"]["salesByPaymentMethod"] == []
    reversals_by_original = {
        movement["reversalOfId"]: movement
        for movement in current_b["movements"]
        if movement["type"] == "reversal"
    }
    assert set(reversals_by_original) == {
        a_cash_sale_movement["id"],
        a_collection_movement["id"],
    }
    assert reversals_by_original[a_cash_sale_movement["id"]]["cashDelta"] == "-20.00"
    assert reversals_by_original[a_collection_movement["id"]]["cashDelta"] == "-30.00"

    close_b_response = client.post(
        f"/api/v1/pos/registers/{register_b['id']}/close",
        headers=_idempotent(headers, f"pos-history-close-b-{suffix}"),
        json={"countedCash": "25.00", "version": current_b["version"]},
    )
    assert close_b_response.status_code == 200, close_b_response.text
    assert close_b_response.json()["difference"] == "0.00"


@pytest.mark.integration
def test_concurrent_open_register_keeps_one_open_session(client: TestClient) -> None:
    summary, branch_id = _bootstrap_isolated_branch()
    headers = _login(client)
    suffix = uuid7().hex[-12:]
    principal = AuthPrincipal(
        platform_user_id=summary.platform_user_id,
        membership_id=summary.membership_id,
        workspace_id=summary.workspace_id,
        session_id=uuid7(),
        email=_OWNER_EMAIL,
        display_name="Local Owner",
    )
    grant = PermissionGrant(
        permission_code="pos.register.manage",
        workspace_id=summary.workspace_id,
        membership_id=summary.membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    values = {
        "branch_id": branch_id,
        "opening_cash": Decimal("0.00"),
        "currency": "DOP",
        "notes": "Apertura concurrente",
    }
    barrier = Barrier(2)

    def attempt(index: int) -> str:
        with get_session_factory()() as database:
            barrier.wait(timeout=10)
            try:
                PosService(database).open_register(
                    principal=principal,
                    grant=grant,
                    values=values,
                    idempotency_key=f"pos-concurrent-open-{suffix}-{index}",
                )
            except ConflictError:
                return "conflict"
            return "created"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(attempt, (1, 2)))
    assert outcomes.count("created") == 1
    assert outcomes.count("conflict") == 1

    current_response = client.get(
        "/api/v1/pos/registers/current",
        headers=headers,
        params={"branchId": str(branch_id)},
    )
    assert current_response.status_code == 200, current_response.text
    current = current_response.json()
    assert current is not None
    close_response = client.post(
        f"/api/v1/pos/registers/{current['id']}/close",
        headers=_idempotent(headers, f"pos-concurrent-close-{suffix}"),
        json={"countedCash": "0.00", "version": current["version"]},
    )
    assert close_response.status_code == 200, close_response.text
