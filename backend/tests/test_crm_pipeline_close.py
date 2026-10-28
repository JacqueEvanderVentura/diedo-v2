from decimal import Decimal
from typing import Any
from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import (
    Branch,
    CrmLead,
    InventoryItemProfile,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    UnitOfMeasure,
)
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation
from app.services.pos import PosService
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from tests.customer_payloads import customer_create_payload, unique_lead_document_fields

_PASSWORD = "crm-pipeline-close-password-not-a-secret"


def _seed(*, with_item: bool = False) -> tuple[str, str | None]:
    with session_scope() as session:
        seeded = bootstrap_local_foundation(session, hash_password(_PASSWORD))
        branch_id = session.scalar(
            select(Branch.id).where(
                Branch.workspace_id == seeded.workspace_id,
                Branch.status == "active",
            )
        )
        assert branch_id is not None
        if not with_item:
            return str(branch_id), None
        unit_id = session.scalar(
            select(UnitOfMeasure.id).where(
                UnitOfMeasure.workspace_id == seeded.workspace_id,
                UnitOfMeasure.code == "unit",
            )
        )
        assert unit_id is not None
        suffix = uuid7().hex[-12:]
        category = ItemCategory(
            workspace_id=seeded.workspace_id,
            name=f"Pipeline close {suffix}",
            normalized_name=f"pipeline close {suffix}",
            status="active",
        )
        session.add(category)
        session.flush()
        item = Item(
            workspace_id=seeded.workspace_id,
            category_id=category.id,
            unit_of_measure_id=unit_id,
            item_type="service",
            name=f"Servicio cierre {suffix}",
            sku=f"PCL-{suffix}",
            status="active",
        )
        session.add(item)
        session.flush()
        session.add_all(
            [
                ItemBranchAssignment(
                    workspace_id=seeded.workspace_id,
                    item_id=item.id,
                    branch_id=branch_id,
                    status="active",
                ),
                InventoryItemProfile(
                    workspace_id=seeded.workspace_id,
                    item_id=item.id,
                    sale_price=Decimal("1000.00"),
                    unit_cost=Decimal("300.00"),
                    tax_rate=Decimal("18.00"),
                ),
            ]
        )
        session.flush()
        return str(branch_id), str(item.id)


def _headers(client: TestClient) -> dict[str, str]:
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@erp.dev", "password": _PASSWORD},
    )
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['accessToken']}"}


def _lead(client: TestClient, headers: dict[str, str], branch_id: str, label: str) -> Any:
    marker = uuid7().hex[-12:]
    response = client.post(
        "/api/v1/crm/leads",
        headers={**headers, "Idempotency-Key": f"pcl-lead-{label}-{marker}"},
        json={
            "branchId": branch_id,
            "name": f"Lead {label} {marker}",
            **unique_lead_document_fields(),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _customer(client: TestClient, headers: dict[str, str], branch_id: str, label: str) -> Any:
    marker = uuid7().hex[-12:]
    response = client.post(
        "/api/v1/customers",
        headers={**headers, "Idempotency-Key": f"pcl-customer-{label}-{marker}"},
        json=customer_create_payload(
            display_name=f"Cliente {label} {marker}", branch_id=UUID(branch_id)
        ),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _get_lead(client: TestClient, headers: dict[str, str], lead_id: str) -> Any:
    response = client.get(f"/api/v1/crm/leads/{lead_id}", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _patch_lead(
    client: TestClient, headers: dict[str, str], lead_id: str, body: dict[str, Any]
) -> Any:
    current = _get_lead(client, headers, lead_id)
    return client.patch(
        f"/api/v1/crm/leads/{lead_id}",
        headers=headers,
        json={"version": current["version"], **body},
    )


@pytest.mark.integration
def test_link_customer_manual_won_and_reopen_rules(client: TestClient) -> None:
    branch_id, _ = _seed()
    headers = _headers(client)
    lead = _lead(client, headers, branch_id, "link")
    customer = _customer(client, headers, branch_id, "link")

    no_customer = _patch_lead(client, headers, lead["id"], {"status": "cerrado"})
    assert no_customer.status_code == 400, no_customer.text
    assert no_customer.json()["parameter"] == "customerId"

    null_customer = _patch_lead(client, headers, lead["id"], {"customerId": None})
    assert null_customer.status_code == 400, null_customer.text

    unknown_customer = _patch_lead(client, headers, lead["id"], {"customerId": str(uuid7())})
    assert unknown_customer.status_code == 404, unknown_customer.text

    linked = _patch_lead(client, headers, lead["id"], {"customerId": customer["id"]})
    assert linked.status_code == 200, linked.text
    assert linked.json()["customerId"] == customer["id"]
    assert linked.json()["status"] == "nuevo"

    relinked_same = _patch_lead(client, headers, lead["id"], {"customerId": customer["id"]})
    assert relinked_same.status_code == 200, relinked_same.text

    replay_convert = client.post(
        f"/api/v1/crm/leads/{lead['id']}/convert",
        headers={**headers, "Idempotency-Key": f"pcl-convert-linked-{uuid7().hex[-12:]}"},
        json={"version": relinked_same.json()["version"]},
    )
    assert replay_convert.status_code == 200, replay_convert.text
    assert replay_convert.json()["id"] == customer["id"]
    assert _get_lead(client, headers, lead["id"])["status"] == "nuevo"

    won = _patch_lead(client, headers, lead["id"], {"status": "cerrado"})
    assert won.status_code == 200, won.text
    assert won.json()["status"] == "cerrado"

    edit_closed = _patch_lead(client, headers, lead["id"], {"name": "Cambio"})
    assert edit_closed.status_code == 409, edit_closed.text

    reopened = _patch_lead(client, headers, lead["id"], {"status": "propuesta"})
    assert reopened.status_code == 200, reopened.text
    assert reopened.json()["status"] == "propuesta"
    assert reopened.json()["customerId"] == customer["id"]


@pytest.mark.integration
def test_convert_reuses_existing_customer_for_several_leads(client: TestClient) -> None:
    branch_id, _ = _seed()
    headers = _headers(client)
    marker = uuid7().hex[-12:]
    body = customer_create_payload(
        display_name=f"Cliente reuso {marker}", branch_id=UUID(branch_id)
    )
    customer = client.post(
        "/api/v1/customers",
        headers={**headers, "Idempotency-Key": f"pcl-reuse-customer-{marker}"},
        json=body,
    )
    assert customer.status_code == 201, customer.text

    for index in range(2):
        lead = _lead(client, headers, branch_id, f"reuse-{index}")
        converted = client.post(
            f"/api/v1/crm/leads/{lead['id']}/convert",
            headers={**headers, "Idempotency-Key": f"pcl-reuse-convert-{index}-{marker}"},
            json={
                "version": lead["version"],
                "documentType": body["documentType"],
                "documentId": body["documentId"],
            },
        )
        assert converted.status_code == 200, converted.text
        assert converted.json()["id"] == customer.json()["id"]
        refreshed = _get_lead(client, headers, lead["id"])
        assert refreshed["status"] == "nuevo"
        assert refreshed["customerId"] == customer.json()["id"]


@pytest.mark.integration
def test_quote_customer_links_open_lead_and_respects_won_lead(client: TestClient) -> None:
    branch_id, item_id = _seed(with_item=True)
    headers = _headers(client)
    lead = _lead(client, headers, branch_id, "quote-link")
    first = _customer(client, headers, branch_id, "quote-first")
    second = _customer(client, headers, branch_id, "quote-second")
    marker = uuid7().hex[-12:]

    quote = client.post(
        "/api/v1/crm/quotes",
        headers={**headers, "Idempotency-Key": f"pcl-quote-a-{marker}"},
        json={
            "leadId": lead["id"],
            "customerId": first["id"],
            "branchId": branch_id,
            "lines": [{"itemId": item_id, "quantity": "1"}],
        },
    )
    assert quote.status_code == 201, quote.text
    after_create = _get_lead(client, headers, lead["id"])
    assert after_create["customerId"] == first["id"]
    assert after_create["status"] == "propuesta"

    switched = client.patch(
        f"/api/v1/crm/quotes/{quote.json()['quote']['id']}",
        headers=headers,
        json={"version": quote.json()["quote"]["version"], "customerId": second["id"]},
    )
    assert switched.status_code == 200, switched.text
    assert _get_lead(client, headers, lead["id"])["customerId"] == second["id"]

    status_only = client.patch(
        f"/api/v1/crm/quotes/{quote.json()['quote']['id']}",
        headers=headers,
        json={"version": switched.json()["quote"]["version"], "status": "enviada"},
    )
    assert status_only.status_code == 200, status_only.text

    won = _patch_lead(client, headers, lead["id"], {"status": "cerrado"})
    assert won.status_code == 200, won.text
    other_customer_quote = client.post(
        "/api/v1/crm/quotes",
        headers={**headers, "Idempotency-Key": f"pcl-quote-b-{marker}"},
        json={
            "leadId": lead["id"],
            "customerId": first["id"],
            "branchId": branch_id,
            "lines": [{"itemId": item_id, "quantity": "1"}],
        },
    )
    assert other_customer_quote.status_code == 400, other_customer_quote.text
    assert other_customer_quote.json()["parameter"] == "customerId"


def _cash_method_id(client: TestClient, headers: dict[str, str], branch_id: str) -> str:
    pos_state = client.get("/api/v1/pos/state", headers=headers, params={"branchId": branch_id})
    assert pos_state.status_code == 200, pos_state.text
    return str(
        next(
            method["id"]
            for method in pos_state.json()["paymentMethods"]
            if method["channel"] == "cash"
        )
    )


def _accepted_quote(
    client: TestClient,
    headers: dict[str, str],
    *,
    branch_id: str,
    item_id: str,
    lead_id: str,
    customer_id: str,
    label: str,
) -> Any:
    quote = client.post(
        "/api/v1/crm/quotes",
        headers={**headers, "Idempotency-Key": f"pcl-accepted-{label}-{uuid7().hex[-12:]}"},
        json={
            "leadId": lead_id,
            "customerId": customer_id,
            "branchId": branch_id,
            "lines": [{"itemId": item_id, "quantity": "1"}],
            "status": "aceptada",
        },
    )
    assert quote.status_code == 201, quote.text
    return quote.json()["quote"]


@pytest.mark.integration
def test_invoice_closes_unconverted_lead_and_blocks_reopen(client: TestClient) -> None:
    branch_id, item_id = _seed(with_item=True)
    assert item_id is not None
    headers = _headers(client)
    lead = _lead(client, headers, branch_id, "invoice")
    customer = _customer(client, headers, branch_id, "invoice")
    other_lead = _lead(client, headers, branch_id, "invoice-other")
    quote = _accepted_quote(
        client,
        headers,
        branch_id=branch_id,
        item_id=item_id,
        lead_id=lead["id"],
        customer_id=customer["id"],
        label="main",
    )
    _accepted_quote(
        client,
        headers,
        branch_id=branch_id,
        item_id=item_id,
        lead_id=other_lead["id"],
        customer_id=customer["id"],
        label="other",
    )

    by_lead = client.get("/api/v1/crm/quotes", headers=headers, params={"leadId": lead["id"]})
    assert by_lead.status_code == 200, by_lead.text
    assert [item["quote"]["id"] for item in by_lead.json()["items"]] == [quote["id"]]

    key = f"pcl-invoice-{uuid7().hex[-12:]}"
    body = {
        "version": quote["version"],
        "paymentMethodId": _cash_method_id(client, headers, branch_id),
        "collectionMode": "now",
    }
    invoice = client.post(
        f"/api/v1/crm/quotes/{quote['id']}/invoice",
        headers={**headers, "Idempotency-Key": key},
        json=body,
    )
    assert invoice.status_code == 201, invoice.text
    closed = _get_lead(client, headers, lead["id"])
    assert closed["status"] == "cerrado"
    assert closed["customerId"] == customer["id"]

    with session_scope() as session:
        stored = session.get(CrmLead, UUID(lead["id"]))
        assert stored is not None
        stored.status = "negociacion"
    replay = client.post(
        f"/api/v1/crm/quotes/{quote['id']}/invoice",
        headers={**headers, "Idempotency-Key": key},
        json=body,
    )
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == invoice.json()["id"]
    assert _get_lead(client, headers, lead["id"])["status"] == "cerrado"

    reopen = _patch_lead(client, headers, lead["id"], {"status": "propuesta"})
    assert reopen.status_code == 409, reopen.text
    assert reopen.json()["parameter"] == "status"


@pytest.mark.integration
def test_invoice_recovers_from_concurrent_checkout_insert(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    branch_id, item_id = _seed(with_item=True)
    assert item_id is not None
    headers = _headers(client)
    lead = _lead(client, headers, branch_id, "race")
    customer = _customer(client, headers, branch_id, "race")
    quote = _accepted_quote(
        client,
        headers,
        branch_id=branch_id,
        item_id=item_id,
        lead_id=lead["id"],
        customer_id=customer["id"],
        label="race",
    )
    original = PosService.checkout_in_transaction
    calls = {"count": 0}

    def flaky_checkout(self: PosService, **kwargs: Any) -> Any:
        calls["count"] += 1
        if calls["count"] == 1:
            raise IntegrityError("INSERT INTO sales", {}, Exception("concurrent insert"))
        return original(self, **kwargs)

    monkeypatch.setattr(PosService, "checkout_in_transaction", flaky_checkout)
    invoice = client.post(
        f"/api/v1/crm/quotes/{quote['id']}/invoice",
        headers={**headers, "Idempotency-Key": f"pcl-race-{uuid7().hex[-12:]}"},
        json={
            "version": quote["version"],
            "paymentMethodId": _cash_method_id(client, headers, branch_id),
            "collectionMode": "now",
        },
    )
    assert invoice.status_code == 201, invoice.text
    assert calls["count"] == 2
    assert _get_lead(client, headers, lead["id"])["status"] == "cerrado"
