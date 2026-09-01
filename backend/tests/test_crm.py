from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.models import (
    Branch,
    CrmActivity,
    CrmLead,
    CrmOpportunity,
    InventoryItemProfile,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    Sale,
    SalesQuote,
    UnitOfMeasure,
)
from app.db.session import get_engine, session_scope
from app.services.authorization import PermissionGrant
from app.services.crm import CrmService
from app.services.crm_scoring import DEFAULT_SCORING_WEIGHTS, compute_auto_score
from app.services.demo_seed import seed_demo_data
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

_PASSWORD = "crm-test-password-not-a-secret"
_NOW = datetime(2026, 9, 1, 16, 0, tzinfo=UTC)


def test_crm_scoring_detects_vertical_signals_and_respects_manual_boundaries() -> None:
    result = compute_auto_score(
        {
            "company": "Zen Spa",
            "raw_snippet": "Spa de masajes con reservas, citas, clientes y sitio web",
            "website": "https://zen.example.com",
            "phone": "809-555-0101",
        },
        DEFAULT_SCORING_WEIGHTS,
    )

    assert 0 <= result.score <= 100
    assert result.module_fits["agenda"] == 100
    assert result.module_fits["crm"] == 100
    assert "Vertical detectada: spa" in result.reasons
    assert "Tiene sitio web" in result.reasons
    assert "Teléfono disponible" in result.reasons


@pytest.mark.integration
def test_seeded_crm_has_complete_commercial_trace_and_overview() -> None:
    connection = get_engine().connect()
    transaction = connection.begin()
    try:
        with Session(bind=connection, expire_on_commit=False) as session:
            summary = seed_demo_data(session, hash_password(_PASSWORD), enabled=True)
            assert summary.workspace_id is not None
            assert summary.crm_profile_count == 5
            assert summary.crm_lead_count == 8
            assert summary.crm_opportunity_count == 6
            assert summary.crm_activity_count == 8

            membership_id = session.scalar(
                select(CrmLead.assigned_membership_id).where(
                    CrmLead.workspace_id == summary.workspace_id
                )
            )
            assert membership_id is not None
            grant = PermissionGrant(
                permission_code="crm.read",
                workspace_id=summary.workspace_id,
                membership_id=membership_id,
                allowed_legal_entity_ids=None,
                allowed_branch_ids=None,
            )
            service = CrmService(session)
            leads = service.list_leads(
                grant,
                branch_id=None,
                status=None,
                source=None,
                search=None,
                page=1,
                page_size=100,
            )
            opportunities = service.list_opportunities(
                grant,
                branch_id=None,
                stage=None,
                customer_id=None,
                search=None,
                page=1,
                page_size=100,
            )
            activities = service.list_activities(
                grant,
                branch_id=None,
                activity_type=None,
                completed=None,
                overdue=None,
                opportunity_id=None,
                customer_id=None,
                page=1,
                page_size=100,
            )
            overview = service.overview(grant, branch_id=None, now=_NOW)

            assert leads.total_items == 8
            assert opportunities.total_items == 6
            assert activities.total_items == 8
            assert overview.values.total_leads == 8
            assert overview.values.qualified_leads == 2
            assert overview.values.open_opportunities == 5
            assert overview.values.pipeline_value == Decimal("221000.00")

            converted_quote = session.scalar(
                select(SalesQuote).where(
                    SalesQuote.workspace_id == summary.workspace_id,
                    SalesQuote.origin == "crm",
                    SalesQuote.crm_status == "aceptada",
                )
            )
            assert converted_quote is not None
            assert converted_quote.opportunity_id is not None
            sale = session.scalar(
                select(Sale).where(
                    Sale.workspace_id == summary.workspace_id,
                    Sale.quote_id == converted_quote.id,
                )
            )
            assert sale is not None
            assert sale.customer_id == converted_quote.customer_id
    finally:
        transaction.rollback()
        connection.close()


@pytest.mark.integration
def test_crm_http_flow_is_idempotent_and_reaches_quote(client: TestClient) -> None:
    with session_scope() as session:
        seeded = bootstrap_local_foundation(session, hash_password(_PASSWORD))
        branch_id = session.scalar(
            select(Branch.id).where(
                Branch.workspace_id == seeded.workspace_id,
                Branch.status == "active",
            )
        )
        unit_id = session.scalar(
            select(UnitOfMeasure.id).where(
                UnitOfMeasure.workspace_id == seeded.workspace_id,
                UnitOfMeasure.code == "unit",
            )
        )
        assert branch_id is not None
        assert unit_id is not None
        suffix = uuid7().hex[-12:]
        category = ItemCategory(
            workspace_id=seeded.workspace_id,
            name=f"CRM API {suffix}",
            normalized_name=f"crm api {suffix}",
            status="active",
        )
        session.add(category)
        session.flush()
        item = Item(
            workspace_id=seeded.workspace_id,
            category_id=category.id,
            unit_of_measure_id=unit_id,
            item_type="service",
            name="Implementación CRM",
            sku=f"CRM-{suffix}",
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
                    sale_price=Decimal("25000.00"),
                    unit_cost=Decimal("10000.00"),
                    tax_rate=Decimal("18.00"),
                ),
            ]
        )
        session.flush()
        item_id = item.id
        branch_id_text = str(branch_id)
        membership_id_text = str(seeded.membership_id)

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@erp.dev", "password": _PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}

    state = client.get("/api/v1/crm/state", headers=headers)
    assert state.status_code == 200, state.text
    assert state.headers["cache-control"] == "no-store"

    discovery = client.get("/api/v1/crm/discovery/capabilities", headers=headers)
    assert discovery.status_code == 200, discovery.text
    assert discovery.json() == {
        "enabled": False,
        "provider": "serpapi",
        "status": "not_configured",
        "hourLimit": 50,
        "monthLimit": 250,
    }
    unavailable_search = client.post(
        "/api/v1/crm/discovery/search",
        headers=headers,
        json={"query": "salones de belleza", "location": "Santo Domingo", "limit": 10},
    )
    assert unavailable_search.status_code == 503, unavailable_search.text
    assert unavailable_search.json()["parameter"] == "provider"

    scoring = client.get("/api/v1/crm/settings/scoring", headers=headers)
    assert scoring.status_code == 200, scoring.text
    updated_scoring = client.patch(
        "/api/v1/crm/settings/scoring",
        headers=headers,
        json={"version": scoring.json()["version"], "weights": scoring.json()["weights"]},
    )
    assert updated_scoring.status_code == 200, updated_scoring.text

    creation_headers = {**headers, "Idempotency-Key": f"crm-lead-{suffix}"}
    lead_payload = {
        "branchId": branch_id_text,
        "name": f"Lead API {suffix}",
        "company": f"Empresa API {suffix}",
        "email": f"crm-{suffix}@example.com",
        "phone": "809-555-0999",
        "source": "manual",
        "rawSnippet": "Spa con agenda, clientes, inventario y punto de venta.",
        "status": "calificado",
    }
    created = client.post(
        "/api/v1/crm/leads",
        headers=creation_headers,
        json=lead_payload,
    )
    replay = client.post(
        "/api/v1/crm/leads",
        headers=creation_headers,
        json=lead_payload,
    )
    assert created.status_code == 201, created.text
    assert replay.status_code == 201, replay.text
    assert replay.json()["id"] == created.json()["id"]
    lead = created.json()

    imported = client.post(
        "/api/v1/crm/leads/import",
        headers={**headers, "Idempotency-Key": f"crm-import-{suffix}"},
        json={
            "branchId": branch_id_text,
            "source": "import",
            "items": [
                {
                    "branchId": branch_id_text,
                    "name": f"Lead importado {suffix}",
                    "company": "Comercio Importado",
                    "phone": "809-555-0777",
                }
            ],
        },
    )
    assert imported.status_code == 201, imported.text
    imported_replay = client.post(
        "/api/v1/crm/leads/import",
        headers={**headers, "Idempotency-Key": f"crm-import-{suffix}"},
        json={
            "branchId": branch_id_text,
            "source": "import",
            "items": [
                {
                    "branchId": branch_id_text,
                    "name": f"Lead importado {suffix}",
                    "company": "Comercio Importado",
                    "phone": "809-555-0777",
                }
            ],
        },
    )
    assert imported_replay.status_code == 201, imported_replay.text
    assert imported_replay.json()["items"][0]["id"] == imported.json()["items"][0]["id"]
    imported_lead = imported.json()["items"][0]
    changed_lead = client.patch(
        f"/api/v1/crm/leads/{imported_lead['id']}",
        headers=headers,
        json={
            "version": imported_lead["version"],
            "assignedMembershipId": membership_id_text,
            "status": "contactado",
            "scoreManual": 72,
            "scoreNotes": "Prioridad revisada por ventas",
        },
    )
    assert changed_lead.status_code == 200, changed_lead.text
    assert changed_lead.json()["score"] == 72
    assert (
        client.get(f"/api/v1/crm/leads/{changed_lead.json()['id']}", headers=headers).status_code
        == 200
    )
    filtered_leads = client.get(
        "/api/v1/crm/leads",
        headers=headers,
        params={
            "branchId": branch_id_text,
            "status": "contactado",
            "source": "import",
            "search": "Comercio",
        },
    )
    assert filtered_leads.status_code == 200, filtered_leads.text
    assert filtered_leads.json()["totalItems"] == 1
    rescored = client.patch(
        "/api/v1/crm/settings/scoring",
        headers=headers,
        json={
            "version": updated_scoring.json()["version"],
            "weights": updated_scoring.json()["weights"],
        },
    )
    assert rescored.status_code == 200, rescored.text

    opportunity = client.post(
        f"/api/v1/crm/leads/{lead['id']}/opportunity",
        headers={**headers, "Idempotency-Key": f"crm-opp-{suffix}"},
        json={"stage": "propuesta", "value": "25000.00"},
    )
    assert opportunity.status_code == 201, opportunity.text
    opportunity_replay = client.post(
        f"/api/v1/crm/leads/{lead['id']}/opportunity",
        headers={**headers, "Idempotency-Key": f"crm-opp-{suffix}"},
        json={"stage": "propuesta", "value": "25000.00"},
    )
    assert opportunity_replay.status_code == 201, opportunity_replay.text
    assert opportunity_replay.json()["id"] == opportunity.json()["id"]

    activity = client.post(
        "/api/v1/crm/activities",
        headers={**headers, "Idempotency-Key": f"crm-act-{suffix}"},
        json={
            "branchId": branch_id_text,
            "leadId": lead["id"],
            "opportunityId": opportunity.json()["id"],
            "type": "reunion",
            "title": "Demo integral del ERP",
            "dueAt": "2026-09-03T15:00:00Z",
        },
    )
    assert activity.status_code == 201, activity.text
    activity_replay = client.post(
        "/api/v1/crm/activities",
        headers={**headers, "Idempotency-Key": f"crm-act-{suffix}"},
        json={
            "branchId": branch_id_text,
            "leadId": lead["id"],
            "opportunityId": opportunity.json()["id"],
            "type": "reunion",
            "title": "Demo integral del ERP",
            "dueAt": "2026-09-03T15:00:00Z",
        },
    )
    assert activity_replay.status_code == 201, activity_replay.text
    assert activity_replay.json()["id"] == activity.json()["id"]
    completed = client.post(
        f"/api/v1/crm/activities/{activity.json()['id']}/complete",
        headers=headers,
        json={"version": activity.json()["version"]},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["completedAt"] is not None
    reopened = client.post(
        f"/api/v1/crm/activities/{activity.json()['id']}/reopen",
        headers=headers,
        json={"version": completed.json()["version"]},
    )
    assert reopened.status_code == 200, reopened.text
    edited_activity = client.patch(
        f"/api/v1/crm/activities/{activity.json()['id']}",
        headers=headers,
        json={
            "version": reopened.json()["version"],
            "assignedMembershipId": membership_id_text,
            "type": "tarea",
            "title": "Preparar propuesta CRM",
            "description": "Enviar alcance revisado",
            "customerName": f"Empresa API {suffix}",
            "dueAt": None,
        },
    )
    assert edited_activity.status_code == 200, edited_activity.text
    assert (
        client.get(f"/api/v1/crm/activities/{activity.json()['id']}", headers=headers).status_code
        == 200
    )
    filtered_activities = client.get(
        "/api/v1/crm/activities",
        headers=headers,
        params={
            "branchId": branch_id_text,
            "type": "tarea",
            "completed": "false",
            "opportunityId": opportunity.json()["id"],
        },
    )
    assert filtered_activities.status_code == 200, filtered_activities.text
    assert filtered_activities.json()["totalItems"] == 1
    already_open = client.post(
        f"/api/v1/crm/activities/{activity.json()['id']}/reopen",
        headers=headers,
        json={"version": edited_activity.json()["version"]},
    )
    assert already_open.status_code == 200, already_open.text
    lead_for_conversion = client.get(f"/api/v1/crm/leads/{lead['id']}", headers=headers).json()

    converted = client.post(
        f"/api/v1/crm/leads/{lead['id']}/convert",
        headers={**headers, "Idempotency-Key": f"crm-convert-{suffix}"},
        json={
            "version": lead_for_conversion["version"],
            "customerType": "business",
            "displayName": f"Empresa API {suffix}",
            "businessName": f"Empresa API {suffix}",
            "branchIds": [branch_id_text],
            "lifecycleStatus": "prospecto",
        },
    )
    assert converted.status_code == 200, converted.text
    converted_replay = client.post(
        f"/api/v1/crm/leads/{lead['id']}/convert",
        headers={**headers, "Idempotency-Key": f"crm-convert-{suffix}"},
        json={
            "version": lead_for_conversion["version"],
            "customerType": "business",
            "displayName": f"Empresa API {suffix}",
            "businessName": f"Empresa API {suffix}",
            "branchIds": [branch_id_text],
            "lifecycleStatus": "prospecto",
        },
    )
    assert converted_replay.status_code == 200, converted_replay.text
    assert converted_replay.json()["id"] == converted.json()["id"]

    current_opportunity = client.get(
        f"/api/v1/crm/opportunities/{opportunity.json()['id']}", headers=headers
    )
    assert current_opportunity.status_code == 200, current_opportunity.text
    moved_opportunity = client.patch(
        f"/api/v1/crm/opportunities/{opportunity.json()['id']}",
        headers=headers,
        json={
            "version": current_opportunity.json()["version"],
            "stage": "negociacion",
            "notes": "Condiciones comerciales en revisión",
        },
    )
    assert moved_opportunity.status_code == 200, moved_opportunity.text
    detached_opportunity = client.patch(
        f"/api/v1/crm/opportunities/{opportunity.json()['id']}",
        headers=headers,
        json={
            "version": moved_opportunity.json()["version"],
            "assignedMembershipId": membership_id_text,
            "customerId": None,
            "title": "Implementación CRM cerrada",
            "customerName": f"Empresa API {suffix}",
            "stage": "cerrado",
            "value": "26000.00",
            "notes": "Acuerdo confirmado",
        },
    )
    assert detached_opportunity.status_code == 200, detached_opportunity.text
    standalone_opportunity = client.post(
        "/api/v1/crm/opportunities",
        headers={**headers, "Idempotency-Key": f"crm-standalone-{suffix}"},
        json={
            "branchId": branch_id_text,
            "customerId": converted.json()["id"],
            "title": "Renovación anual",
            "customerName": converted.json()["displayName"],
            "stage": "perdido",
            "value": "5000.00",
            "lostReason": "Presupuesto pospuesto",
        },
    )
    assert standalone_opportunity.status_code == 201, standalone_opportunity.text
    standalone_replay = client.post(
        "/api/v1/crm/opportunities",
        headers={**headers, "Idempotency-Key": f"crm-standalone-{suffix}"},
        json={
            "branchId": branch_id_text,
            "customerId": converted.json()["id"],
            "title": "Renovación anual",
            "customerName": converted.json()["displayName"],
            "stage": "perdido",
            "value": "5000.00",
            "lostReason": "Presupuesto pospuesto",
        },
    )
    assert standalone_replay.status_code == 201, standalone_replay.text
    assert standalone_replay.json()["id"] == standalone_opportunity.json()["id"]
    filtered_opportunities = client.get(
        "/api/v1/crm/opportunities",
        headers=headers,
        params={
            "branchId": branch_id_text,
            "stage": "perdido",
            "customerId": converted.json()["id"],
            "search": "Renovación",
        },
    )
    assert filtered_opportunities.status_code == 200, filtered_opportunities.text
    assert filtered_opportunities.json()["totalItems"] == 1

    customer = client.get(f"/api/v1/crm/customers/{converted.json()['id']}", headers=headers)
    assert customer.status_code == 200, customer.text
    profile = client.patch(
        f"/api/v1/crm/customers/{converted.json()['id']}/profile",
        headers=headers,
        json={
            "version": customer.json()["profileVersion"],
            "lifecycleStatus": "activo",
            "loyaltyPoints": 25,
            "notes": "Cliente activado desde el flujo de prueba",
        },
    )
    assert profile.status_code == 200, profile.text
    assert profile.json()["loyaltyPoints"] == 25
    filtered_customers = client.get(
        "/api/v1/crm/customers",
        headers=headers,
        params={"branchId": branch_id_text, "status": "activo", "search": "Empresa API"},
    )
    assert filtered_customers.status_code == 200, filtered_customers.text
    assert filtered_customers.json()["totalItems"] == 1
    purchases = client.get(
        f"/api/v1/crm/customers/{converted.json()['id']}/purchases",
        headers=headers,
        params={"branchId": branch_id_text},
    )
    assert purchases.status_code == 200, purchases.text
    assert purchases.json()["purchases"] == []
    customer_activity = client.post(
        "/api/v1/crm/activities",
        headers={**headers, "Idempotency-Key": f"crm-customer-act-{suffix}"},
        json={
            "branchId": branch_id_text,
            "customerId": converted.json()["id"],
            "type": "email",
            "title": "Enviar bienvenida",
        },
    )
    assert customer_activity.status_code == 201, customer_activity.text

    quote = client.post(
        "/api/v1/crm/quotes",
        headers={**headers, "Idempotency-Key": f"crm-quote-{suffix}"},
        json={
            "opportunityId": opportunity.json()["id"],
            "customerId": converted.json()["id"],
            "branchId": branch_id_text,
            "lines": [{"itemId": str(item_id), "quantity": "1"}],
            "status": "enviada",
            "validUntil": "2026-09-20T03:59:59Z",
        },
    )
    assert quote.status_code == 201, quote.text
    assert quote.json()["crmStatus"] == "enviada"
    assert quote.json()["opportunityId"] == opportunity.json()["id"]
    quote_id = quote.json()["quote"]["id"]
    assert client.get(f"/api/v1/crm/quotes/{quote_id}", headers=headers).status_code == 200
    quote_list = client.get(
        "/api/v1/crm/quotes",
        headers=headers,
        params={
            "branchId": branch_id_text,
            "customerId": converted.json()["id"],
            "status": "enviada",
        },
    )
    assert quote_list.status_code == 200, quote_list.text
    assert quote_list.json()["totalItems"] == 1
    changed_quote = client.patch(
        f"/api/v1/crm/quotes/{quote_id}",
        headers=headers,
        json={
            "version": quote.json()["quote"]["version"],
            "status": "rechazada",
            "notes": "El cliente solicitó una revisión",
        },
    )
    assert changed_quote.status_code == 200, changed_quote.text
    cancelled_quote = client.post(
        f"/api/v1/crm/quotes/{quote_id}/cancel",
        headers=headers,
        json={
            "version": changed_quote.json()["quote"]["version"],
            "reason": "Sustituida por una nueva propuesta",
        },
    )
    assert cancelled_quote.status_code == 200, cancelled_quote.text

    sale_quote = client.post(
        "/api/v1/crm/quotes",
        headers={**headers, "Idempotency-Key": f"crm-sale-quote-{suffix}"},
        json={
            "opportunityId": opportunity.json()["id"],
            "customerId": converted.json()["id"],
            "branchId": branch_id_text,
            "lines": [{"itemId": str(item_id), "quantity": "1"}],
            "status": "aceptada",
        },
    )
    assert sale_quote.status_code == 201, sale_quote.text
    pos_state = client.get(
        "/api/v1/pos/state", headers=headers, params={"branchId": branch_id_text}
    )
    assert pos_state.status_code == 200, pos_state.text
    cash_method = next(
        method for method in pos_state.json()["paymentMethods"] if method["channel"] == "cash"
    )
    register = client.post(
        "/api/v1/pos/registers",
        headers={**headers, "Idempotency-Key": f"crm-register-{suffix}"},
        json={"branchId": branch_id_text, "openingCash": "0.00", "currency": "DOP"},
    )
    assert register.status_code == 201, register.text
    checkout = client.post(
        "/api/v1/pos/checkout",
        headers={**headers, "Idempotency-Key": f"crm-checkout-{suffix}"},
        json={
            "branchId": branch_id_text,
            "registerId": register.json()["id"],
            "quoteId": sale_quote.json()["quote"]["id"],
            "quoteVersion": sale_quote.json()["quote"]["version"],
            "paymentMethodId": cash_method["id"],
            "lines": [{"itemId": str(item_id), "quantity": "1"}],
        },
    )
    assert checkout.status_code == 201, checkout.text
    crm_sale = client.get(f"/api/v1/crm/sales/{checkout.json()['id']}", headers=headers)
    assert crm_sale.status_code == 200, crm_sale.text
    assert crm_sale.json()["customer"]["id"] == converted.json()["id"]
    purchases_after_sale = client.get(
        f"/api/v1/crm/customers/{converted.json()['id']}/purchases", headers=headers
    )
    assert purchases_after_sale.status_code == 200, purchases_after_sale.text
    assert len(purchases_after_sale.json()["purchases"]) == 1

    overview = client.get("/api/v1/crm/overview", headers=headers)
    customers = client.get("/api/v1/crm/customers", headers=headers)
    sales = client.get(
        "/api/v1/crm/sales",
        headers=headers,
        params={
            "branchId": branch_id_text,
            "customerId": converted.json()["id"],
            "status": "completed",
            "dateFrom": "2026-01-01",
            "dateTo": "2026-12-31",
        },
    )
    assert overview.status_code == 200, overview.text
    assert customers.status_code == 200, customers.text
    assert sales.status_code == 200, sales.text
    assert overview.json()["totalLeads"] >= 1
    assert sales.json()["totalItems"] == 1
    stale_settings = client.patch(
        "/api/v1/crm/settings/scoring",
        headers=headers,
        json={"version": scoring.json()["version"], "weights": scoring.json()["weights"]},
    )
    assert stale_settings.status_code == 409
    changed_replay = client.post(
        "/api/v1/crm/leads",
        headers=creation_headers,
        json={**lead_payload, "company": "Otra empresa"},
    )
    assert changed_replay.status_code == 409
    converted_lead = client.get(f"/api/v1/crm/leads/{lead['id']}", headers=headers).json()
    immutable_lead = client.patch(
        f"/api/v1/crm/leads/{lead['id']}",
        headers=headers,
        json={"version": converted_lead["version"], "status": "contactado"},
    )
    assert immutable_lead.status_code == 409
    unknown_id = str(uuid7())
    assert client.get(f"/api/v1/crm/leads/{unknown_id}", headers=headers).status_code == 404
    assert client.get(f"/api/v1/crm/opportunities/{unknown_id}", headers=headers).status_code == 404
    assert client.get(f"/api/v1/crm/activities/{unknown_id}", headers=headers).status_code == 404
    assert client.get(f"/api/v1/crm/customers/{unknown_id}", headers=headers).status_code == 404
    assert client.get(f"/api/v1/crm/quotes/{unknown_id}", headers=headers).status_code == 404
    assert client.get(f"/api/v1/crm/sales/{unknown_id}", headers=headers).status_code == 404
    assert (
        client.post(
            "/api/v1/crm/leads",
            headers={**headers, "Idempotency-Key": f"crm-empty-{suffix}"},
            json={"branchId": branch_id_text},
        ).status_code
        == 400
    )
    assert (
        client.patch(
            f"/api/v1/crm/leads/{changed_lead.json()['id']}",
            headers=headers,
            json={"version": changed_lead.json()["version"]},
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/api/v1/crm/leads/{changed_lead.json()['id']}/convert",
            headers={**headers, "Idempotency-Key": f"crm-duplicates-{suffix}"},
            json={
                "version": changed_lead.json()["version"],
                "branchIds": [branch_id_text, branch_id_text],
            },
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/crm/opportunities",
            headers={**headers, "Idempotency-Key": f"crm-lost-invalid-{suffix}"},
            json={
                "branchId": branch_id_text,
                "title": "Oportunidad inválida",
                "customerName": "Sin motivo",
                "stage": "perdido",
            },
        ).status_code
        == 400
    )
    assert (
        client.patch(
            f"/api/v1/crm/opportunities/{standalone_opportunity.json()['id']}",
            headers=headers,
            json={"version": standalone_opportunity.json()["version"]},
        ).status_code
        == 400
    )
    assert (
        client.patch(
            f"/api/v1/crm/activities/{customer_activity.json()['id']}",
            headers=headers,
            json={"version": customer_activity.json()["version"]},
        ).status_code
        == 400
    )
    assert (
        client.patch(
            "/api/v1/crm/settings/scoring",
            headers=headers,
            json={"version": rescored.json()["version"], "weights": {"crm": 1}},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/crm/quotes",
            headers={**headers, "Idempotency-Key": f"crm-duplicate-lines-{suffix}"},
            json={
                "customerId": converted.json()["id"],
                "branchId": branch_id_text,
                "lines": [
                    {"itemId": str(item_id), "quantity": "1"},
                    {"itemId": str(item_id), "quantity": "2"},
                ],
            },
        ).status_code
        == 400
    )
    missing_lead_opportunity = client.post(
        "/api/v1/crm/opportunities",
        headers={**headers, "Idempotency-Key": f"crm-missing-lead-{suffix}"},
        json={
            "branchId": branch_id_text,
            "leadId": unknown_id,
            "title": "Lead inexistente",
            "customerName": "Nadie",
        },
    )
    assert missing_lead_opportunity.status_code == 404
    missing_customer_opportunity = client.post(
        "/api/v1/crm/opportunities",
        headers={**headers, "Idempotency-Key": f"crm-missing-customer-{suffix}"},
        json={
            "branchId": branch_id_text,
            "customerId": unknown_id,
            "title": "Cliente inexistente",
            "customerName": "Nadie",
        },
    )
    assert missing_customer_opportunity.status_code == 404
    for relation, key in (
        ("leadId", "lead"),
        ("opportunityId", "opportunity"),
        ("customerId", "customer"),
    ):
        missing_activity = client.post(
            "/api/v1/crm/activities",
            headers={**headers, "Idempotency-Key": f"crm-missing-{key}-{suffix}"},
            json={
                "branchId": branch_id_text,
                relation: unknown_id,
                "type": "tarea",
                "title": f"Referencia {key} inexistente",
            },
        )
        assert missing_activity.status_code == 404
    assert (
        client.post(
            f"/api/v1/crm/leads/{lead['id']}/opportunity",
            headers={**headers, "Idempotency-Key": f"crm-second-opp-{suffix}"},
            json={"title": "Oportunidad duplicada"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/v1/crm/leads/{unknown_id}/opportunity",
            headers={**headers, "Idempotency-Key": f"crm-unknown-opp-{suffix}"},
            json={},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/crm/opportunities/{unknown_id}",
            headers=headers,
            json={"version": 1, "stage": "contactado"},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/crm/activities/{unknown_id}",
            headers=headers,
            json={"version": 1, "title": "No existe"},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/crm/activities/{unknown_id}/complete",
            headers=headers,
            json={"version": 1},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/v1/crm/leads/{unknown_id}/convert",
            headers={**headers, "Idempotency-Key": f"crm-unknown-convert-{suffix}"},
            json={"version": 1},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            f"/api/v1/crm/customers/{unknown_id}/profile",
            headers=headers,
            json={"version": 1, "lifecycleStatus": "activo"},
        ).status_code
        == 404
    )
    assert client.get("/api/v1/crm/leads").status_code == 401
    assert session_scalar_count(CrmLead) >= 1
    assert session_scalar_count(CrmOpportunity) >= 1
    assert session_scalar_count(CrmActivity) >= 1


def session_scalar_count(model: type[object]) -> int:
    with session_scope() as session:
        return int(session.scalar(select(func.count()).select_from(model)) or 0)
