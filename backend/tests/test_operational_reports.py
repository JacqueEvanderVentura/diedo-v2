from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid7

import pytest
from app.core.errors import ResourceNotFoundError
from app.core.security import hash_password
from app.db.models import Branch, PlatformUser, WorkspaceMembership
from app.db.session import get_engine, session_scope
from app.services.authorization import PermissionGrant
from app.services.demo_seed import seed_demo_data
from app.services.reports import ReportsService
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

_FIXED_NOW = datetime(2026, 9, 3, 16, 0, tzinfo=UTC)


def test_report_periods_use_calendar_boundaries() -> None:
    assert ReportsService._period_dates("today", date(2026, 9, 3)) == (
        date(2026, 9, 3),
        date(2026, 9, 4),
    )
    assert ReportsService._period_dates("week", date(2026, 9, 3)) == (
        date(2026, 8, 31),
        date(2026, 9, 7),
    )
    assert ReportsService._period_dates("month", date(2026, 9, 3)) == (
        date(2026, 9, 1),
        date(2026, 10, 1),
    )
    assert ReportsService._period_dates("quarter", date(2026, 9, 3)) == (
        date(2026, 7, 1),
        date(2026, 10, 1),
    )
    assert ReportsService._period_dates("quarter", date(2026, 12, 3)) == (
        date(2026, 10, 1),
        date(2027, 1, 1),
    )
    assert ReportsService._quantity_label(None) == "0"
    assert ReportsService._percent(Decimal("1"), Decimal("0")) == Decimal("0.00")


def test_membership_status_boundaries() -> None:
    today = date(2026, 9, 3)
    assert ReportsService._membership_status(date(2026, 10, 1), today, "active") == "activo"
    assert ReportsService._membership_status(date(2026, 9, 10), today, "active") == "proximo"
    assert ReportsService._membership_status(date(2026, 9, 2), today, "active") == "vencido"
    assert ReportsService._membership_status(date(2026, 8, 3), today, "active") == "inactivo"
    assert ReportsService._membership_status(date(2026, 10, 1), today, "inactive") == "inactivo"


@pytest.mark.integration
def test_seeded_reports_cover_every_submodule() -> None:
    connection = get_engine().connect()
    transaction = connection.begin()
    try:
        with Session(bind=connection, expire_on_commit=False) as session:
            seeded = seed_demo_data(
                session,
                hash_password("reports-owner-password-not-a-secret"),
                enabled=True,
            )
            assert seeded.workspace_id is not None
            owner_membership_id = session.scalar(
                select(WorkspaceMembership.id)
                .join(PlatformUser, PlatformUser.id == WorkspaceMembership.platform_user_id)
                .where(
                    WorkspaceMembership.workspace_id == seeded.workspace_id,
                    PlatformUser.external_subject == "local:owner",
                )
            )
            assert owner_membership_id is not None
            grant = PermissionGrant(
                permission_code="report.read",
                workspace_id=seeded.workspace_id,
                membership_id=owner_membership_id,
                allowed_legal_entity_ids=None,
                allowed_branch_ids=None,
            )
            reports = ReportsService(session)

            general = reports.general_summary(grant, period="month", branch_id=None, now=_FIXED_NOW)
            memberships = reports.memberships(
                grant,
                branch_id=None,
                status=None,
                plan=None,
                search=None,
                page=1,
                page_size=20,
                sort_key="clientName",
                sort_direction="asc",
                now=_FIXED_NOW,
            )
            agenda = reports.agenda_summary(
                grant,
                period="quarter",
                branch_id=None,
                status=None,
                search=None,
                now=_FIXED_NOW,
            )
            inventory = reports.inventory_summary(
                grant, branch_id=None, category_id=None, search=None
            )
            dividends = reports.dividends(
                grant,
                period="quarter",
                branch_id=None,
                search=None,
                page=1,
                page_size=20,
                sort_key="dividend",
                sort_direction="desc",
                now=_FIXED_NOW,
            )
            personal = reports.personal(
                grant,
                period="quarter",
                branch_id=None,
                search=None,
                now=_FIXED_NOW,
            )

            assert general.totals.income > 0
            assert general.series
            assert {item.status for item in memberships.items} == {
                "activo",
                "proximo",
                "vencido",
                "inactivo",
            }
            assert memberships.summary.plans == ["Membresía Charm"]
            assert agenda.total_appointments > 0
            assert agenda.status_distribution
            assert inventory.products_with_stock > 0
            assert inventory.value_at_cost > 0
            assert inventory.categories
            assert dividends.summary.partners == 7
            assert dividends.items
            assert all(item.document for item in dividends.items)
            assert personal.totals.transactions > 0
            assert personal.totals.appointments_attended == 4
            assert personal.totals.employee_incidents >= 4
            assert personal.totals.vacation_days == 5
            assert personal.totals.supplies_used >= Decimal("10.000")
            assert personal.totals.team_average_attended == Decimal("1.000")
            assert personal.by_user
            assert personal.by_employee
            assert max(row.attendance_vs_team_pct for row in personal.by_employee) == Decimal(
                "200.00"
            )
            assert {row.id for row in personal.incident_distribution} == {
                "ausencia",
                "vacaciones",
                "amonestacion",
                "tardanza",
            }
            assert personal.incident_metrics
            assert personal.supply_usage

            hq_id = session.scalar(
                select(Branch.id).where(
                    Branch.workspace_id == seeded.workspace_id,
                    Branch.code == "HQ",
                )
            )
            north_id = session.scalar(
                select(Branch.id).where(
                    Branch.workspace_id == seeded.workspace_id,
                    Branch.code == "NORTH",
                )
            )
            assert hq_id is not None and north_id is not None
            scoped_grant = PermissionGrant(
                permission_code="report.read",
                workspace_id=seeded.workspace_id,
                membership_id=owner_membership_id,
                allowed_legal_entity_ids=None,
                allowed_branch_ids=frozenset({hq_id}),
            )
            assert (
                reports.general_summary(
                    scoped_grant, period="month", branch_id=hq_id, now=_FIXED_NOW
                ).branch_id
                == hq_id
            )
            assert reports.memberships(
                scoped_grant,
                branch_id=hq_id,
                status=None,
                plan=None,
                search=None,
                page=1,
                page_size=20,
                sort_key="clientName",
                sort_direction="asc",
                now=_FIXED_NOW,
            )
            assert (
                reports.agenda_summary(
                    scoped_grant,
                    period="quarter",
                    branch_id=hq_id,
                    status=None,
                    search=None,
                    now=_FIXED_NOW,
                ).branch_id
                == hq_id
            )
            assert (
                reports.inventory_summary(
                    scoped_grant, branch_id=hq_id, category_id=None, search="sin-coincidencias"
                ).branch_id
                == hq_id
            )
            assert (
                reports.inventory_summary(
                    scoped_grant, branch_id=hq_id, category_id=uuid7(), search=None
                ).products_with_stock
                == 0
            )
            assert (
                reports.dividends(
                    scoped_grant,
                    period="quarter",
                    branch_id=hq_id,
                    search="sin-coincidencias",
                    page=1,
                    page_size=20,
                    sort_key="dividend",
                    sort_direction="desc",
                    now=_FIXED_NOW,
                ).items
                == []
            )
            scoped_personal = reports.personal(
                scoped_grant,
                period="quarter",
                branch_id=hq_id,
                search="sin-coincidencias",
                now=datetime(2026, 9, 3, 16, 0),
            )
            assert scoped_personal.by_user == []
            assert scoped_personal.by_employee == []
            assert scoped_personal.incident_metrics == []
            assert scoped_personal.supply_usage == []
            with pytest.raises(ResourceNotFoundError, match="no existe"):
                reports.personal(
                    grant,
                    period="quarter",
                    branch_id=uuid7(),
                    search=None,
                    now=_FIXED_NOW,
                )
            with pytest.raises(ResourceNotFoundError, match="fuera de tu alcance"):
                reports.personal(
                    scoped_grant,
                    period="quarter",
                    branch_id=north_id,
                    search=None,
                    now=_FIXED_NOW,
                )
            missing_workspace_grant = PermissionGrant(
                permission_code="report.read",
                workspace_id=uuid7(),
                membership_id=owner_membership_id,
                allowed_legal_entity_ids=None,
                allowed_branch_ids=None,
            )
            with pytest.raises(ResourceNotFoundError, match="workspace"):
                reports.general_summary(
                    missing_workspace_grant,
                    period="month",
                    branch_id=None,
                    now=_FIXED_NOW,
                )

            hq = session.get(Branch, hq_id)
            assert hq is not None
            original_timezone = hq.timezone
            hq.timezone = "Invalid/Timezone"
            session.flush()
            assert (
                reports.general_summary(
                    scoped_grant,
                    period="month",
                    branch_id=hq_id,
                    now=datetime(2026, 9, 3, 16, 0),
                ).branch_id
                == hq_id
            )
            hq.timezone = original_timezone
            session.flush()
    finally:
        transaction.rollback()
        connection.close()


@pytest.mark.integration
def test_report_endpoints_require_auth_and_return_live_contracts(client: TestClient) -> None:
    password = "reports-api-password-not-a-secret"
    with session_scope() as session:
        seed_demo_data(session, hash_password(password), enabled=True)

    unauthorized = client.get("/api/v1/reports/general/summary")
    assert unauthorized.status_code == 401

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@erp.dev", "password": password},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    requests = (
        ("/api/v1/reports/general/summary", {"period": "month"}),
        ("/api/v1/reports/general/transactions", {"period": "month"}),
        ("/api/v1/reports/general/expense-categories", {"period": "month"}),
        ("/api/v1/reports/memberships", {}),
        ("/api/v1/reports/agenda/summary", {"period": "quarter"}),
        ("/api/v1/reports/agenda/appointments", {"period": "quarter"}),
        ("/api/v1/reports/inventory/summary", {}),
        ("/api/v1/reports/inventory/items", {}),
        ("/api/v1/reports/dividends", {"period": "quarter"}),
        ("/api/v1/reports/personal", {"period": "quarter"}),
    )
    responses = []
    for path, params in requests:
        response = client.get(path, headers=headers, params=params)
        assert response.status_code == 200, f"{path}: {response.text}"
        assert response.headers["cache-control"] == "no-store"
        responses.append(response.json())

    assert responses[0]["totals"]["income"] != "0.00"
    assert responses[3]["summary"]["activeCount"] == 1
    assert responses[4]["totalAppointments"] == 9
    assert responses[6]["productsWithStock"] > 0
    assert responses[8]["summary"]["partners"] == 7
    assert responses[9]["byEmployee"]
    assert responses[9]["totals"]["appointmentsAttended"] == 4
    assert responses[9]["totals"]["employeeIncidents"] >= 4
    assert responses[9]["totals"]["vacationDays"] == 5
    assert Decimal(responses[9]["totals"]["suppliesUsed"]) >= Decimal("10.000")
    assert responses[9]["totals"]["teamAverageAttended"] == "1.000"
    assert responses[9]["incidentMetrics"]
    assert responses[9]["incidentDistribution"]
    assert responses[9]["supplyUsage"]

    personal_incidents = client.get(
        "/api/v1/incidents",
        headers=headers,
        params={"type": "personal", "sortBy": "createdAt", "sortDirection": "desc"},
    )
    assert personal_incidents.status_code == 200, personal_incidents.text
    assert personal_incidents.json()["totalItems"] >= 3
    assert all(item["employee"] for item in personal_incidents.json()["items"])
    assert all(item["employeeIncidentKind"] for item in personal_incidents.json()["items"])

    supply_usage = client.get("/api/v1/inventory/supply-usage", headers=headers)
    assert supply_usage.status_code == 200, supply_usage.text
    assert supply_usage.json()
    assert sum(Decimal(row["quantity"]) for row in supply_usage.json()) >= Decimal("10")
