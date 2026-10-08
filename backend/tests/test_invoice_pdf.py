from decimal import Decimal
from uuid import uuid4, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import Branch
from app.db.session import session_scope
from app.schemas.invoice_documents import InvoiceDocumentRequest, InvoiceLineItemRequest
from app.services.invoice_html import build_invoice_document_html
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.pdf_renderer import StubPdfRenderer, set_pdf_renderer
from fastapi.testclient import TestClient

_OWNER_EMAIL = "owner@erp.dev"
_PASSWORD = "invoice-pdf-test-password-not-a-secret"


def _auth(client: TestClient) -> tuple[dict[str, str], str]:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(_PASSWORD))
        suffix = uuid7().hex[-12:]
        branch = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=f"inv-pdf-{suffix}",
            name=f"Invoice PDF {suffix}",
            status="active",
            timezone="America/Santo_Domingo",
        )
        session.add(branch)
        session.flush()
        branch_id = branch.id
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_PASSWORD))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    return headers, str(branch_id)


def _checkout_sale(client: TestClient, headers: dict[str, str], branch_id: str) -> str:
    suffix = uuid7().hex[-10:]
    state = client.get(
        "/api/v1/pos/state",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert state.status_code == 200, state.text
    cash_method = next(
        method for method in state.json()["paymentMethods"] if method["channel"] == "cash"
    )
    category = client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": f"Invoice PDF {suffix}"},
    )
    assert category.status_code == 201, category.text
    unit_id = client.get("/api/v1/catalog/units-of-measure", headers=headers).json()[0]["id"]
    product = client.post(
        "/api/v1/inventory/products",
        headers={**headers, "Idempotency-Key": f"invoice-pdf-product-{suffix}"},
        json={
            "name": f"Invoice PDF Product {suffix}",
            "sku": f"INV-{suffix}",
            "categoryId": category.json()["id"],
            "unitOfMeasureId": unit_id,
            "branchId": branch_id,
            "salePrice": "25.00",
            "unitCost": "10.00",
            "taxRate": "0.00",
            "stock": "5",
            "minimumStock": "0",
        },
    )
    assert product.status_code == 201, product.text
    state_body = state.json()
    open_register = state_body.get("register")
    if open_register and open_register.get("status") == "open":
        register_id = open_register["id"]
    else:
        register = client.post(
            "/api/v1/pos/registers",
            headers={**headers, "Idempotency-Key": f"invoice-pdf-register-{suffix}"},
            json={"branchId": branch_id, "openingCash": "0.00", "currency": "DOP"},
        )
        assert register.status_code == 201, register.text
        register_id = register.json()["id"]
    checkout = client.post(
        "/api/v1/pos/checkout",
        headers={**headers, "Idempotency-Key": f"invoice-pdf-checkout-{suffix}"},
        json={
            "branchId": branch_id,
            "registerId": register_id,
            "paymentMethodId": cash_method["id"],
            "lines": [{"itemId": product.json()["id"], "quantity": "1"}],
        },
    )
    assert checkout.status_code == 201, checkout.text
    return checkout.json()["id"]


@pytest.fixture(autouse=True)
def stub_invoice_pdf_renderer() -> None:
    set_pdf_renderer(StubPdfRenderer())
    yield
    set_pdf_renderer(None)


def test_build_invoice_document_html_includes_billing_footer() -> None:
    payload = InvoiceDocumentRequest(
        id="FAC-TEST-001",
        kind="sale",
        issued_at="7 oct 2026, 4:42 p.m.",
        branch_name="Principal",
        region="es-DO",
        customer_name="Cliente Demo",
        customer_tax_line="RNC: 132-90890-2",
        payment_method="Efectivo",
        business_name="CHARM ESTHETIC CLINIC SRL",
        legal_name="CHARM ESTHETIC CLINIC SRL",
        business_rnc="132-90890-2",
        business_address="Plaza Grufica, C/ Virgilio Díaz Ordóñez 54, Santo Domingo 10130",
        business_phone="+1 (829) 361-5068",
        business_email="charmestheticclinic@gmail.com",
        items=[
            InvoiceLineItemRequest(
                name="Servicio",
                qty=Decimal("1"),
                price=Decimal("1500"),
                list_price=Decimal("1800"),
            )
        ],
        subtotal=Decimal("1500"),
        discount_amt=Decimal("0"),
        tax_pct=Decimal("18"),
        tax_amt=Decimal("270"),
        total=Decimal("1770"),
    )
    html = build_invoice_document_html(payload)
    assert "CHARM ESTHETIC CLINIC SRL" in html
    assert "Principal · es-DO" in html
    assert "invoice-footer" in html
    assert "position: fixed" not in html
    assert '<s class="strike">' in html


@pytest.mark.integration
def test_post_invoice_pdf_returns_pdf_bytes(client: TestClient) -> None:
    headers, _branch_id = _auth(client)
    payload = InvoiceDocumentRequest(
        id="FAC-DRAFT",
        kind="sale",
        issued_at="7 oct 2026",
        business_name="Helios Demo",
        customer_name="Cliente",
        payment_method="Efectivo",
        items=[InvoiceLineItemRequest(name="Item", qty=Decimal("1"), price=Decimal("100"))],
        subtotal=Decimal("100"),
        tax_amt=Decimal("0"),
        total=Decimal("100"),
    )
    response = client.post(
        "/api/v1/documents/invoices/pdf",
        headers=headers,
        json=payload.model_dump(mode="json", by_alias=True),
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/pdf")
    assert response.content.startswith(b"%PDF")


@pytest.mark.integration
def test_get_sale_invoice_pdf_after_checkout(client: TestClient) -> None:
    headers, branch_id = _auth(client)
    sale_id = _checkout_sale(client, headers, branch_id)
    response = client.get(
        f"/api/v1/pos/sales/{sale_id}/invoice.pdf",
        headers=headers,
    )
    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")


@pytest.mark.integration
def test_get_sale_invoice_pdf_not_found(client: TestClient) -> None:
    headers, _branch_id = _auth(client)
    response = client.get(
        f"/api/v1/pos/sales/{uuid4()}/invoice.pdf",
        headers=headers,
    )
    assert response.status_code == 404


@pytest.mark.integration
def test_get_sale_invoice_pdf_requires_auth(client: TestClient) -> None:
    response = client.get(f"/api/v1/pos/sales/{uuid4()}/invoice.pdf")
    assert response.status_code == 401
