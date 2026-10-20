from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid7

import pytest
from fastapi.testclient import TestClient

from tests.customer_payloads import customer_create_payload
from tests.test_invoice_pdf import _auth, _create_catalog_product

pytestmark = pytest.mark.integration


def _setup_customer(client: TestClient, headers: dict[str, str], branch_id: str) -> str:
    suffix = uuid7().hex[-10:]
    customer = client.post(
        "/api/v1/customers",
        headers=headers,
        json=customer_create_payload(
            display_name=f"Quote Sections Customer {suffix}",
            branch_id=branch_id,
        ),
    )
    assert customer.status_code == 201, customer.text
    return customer.json()["id"]


def test_crm_quote_sections_persist_and_pdf(client: TestClient) -> None:
    headers, branch_id = _auth(client)
    item_id = _create_catalog_product(client, headers, branch_id)
    customer_id = _setup_customer(client, headers, branch_id)
    suffix = uuid7().hex[-10:]
    quote = client.post(
        "/api/v1/crm/quotes",
        headers={**headers, "Idempotency-Key": f"crm-quote-sections-{suffix}"},
        json={
            "customerId": customer_id,
            "branchId": branch_id,
            "lines": [
                {"kind": "section", "title": "Sala"},
                {"kind": "item", "itemId": item_id, "quantity": "2", "unitPrice": "100"},
                {"kind": "section", "title": "Habitación principal"},
                {"kind": "item", "itemId": item_id, "quantity": "1", "unitPrice": "150"},
            ],
            "status": "borrador",
            "validUntil": (datetime.now(UTC) + timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )
    assert quote.status_code == 201, quote.text
    quote_id = quote.json()["quote"]["id"]
    lines = quote.json()["quote"]["lines"]
    assert lines[0]["kind"] == "section"
    assert lines[0]["title"] == "Sala"
    assert lines[1]["kind"] == "item"
    assert lines[2]["kind"] == "section"
    assert lines[2]["title"] == "Habitación principal"
    assert lines[3]["kind"] == "item"

    pdf = client.get(f"/api/v1/crm/quotes/{quote_id}/document.pdf", headers=headers)
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF")


def test_crm_quote_rejects_only_sections(client: TestClient) -> None:
    headers, branch_id = _auth(client)
    customer_id = _setup_customer(client, headers, branch_id)
    suffix = uuid7().hex[-10:]
    quote = client.post(
        "/api/v1/crm/quotes",
        headers={**headers, "Idempotency-Key": f"crm-quote-only-sections-{suffix}"},
        json={
            "customerId": customer_id,
            "branchId": branch_id,
            "lines": [{"kind": "section", "title": "Sala"}],
            "status": "borrador",
            "validUntil": (datetime.now(UTC) + timedelta(days=14)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )
    assert quote.status_code in (400, 422), quote.text
