from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid7

import pytest
from app.core.security import hash_password
from app.db.models import Branch, PlatformUser, WorkspaceMembership
from app.db.session import get_engine, session_scope
from app.services.authorization import PermissionGrant
from app.services.dashboard import DashboardService
from app.services.demo_seed import seed_demo_data
from app.services.errors import ResourceNotFoundError
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "dashboard-owner-password-not-a-secret"
_FIXED_NOW = datetime(2026, 9, 1, 16, 0, tzinfo=UTC)


def test_dashboard_calendar_periods_are_not_rolling_windows() -> None:
    assert DashboardService._period_dates("today", date(2026, 9, 1)) == (
        date(2026, 9, 1),
        date(2026, 9, 2),
    )
    assert DashboardService._period_dates("week", date(2026, 9, 3)) == (
        date(2026, 8, 31),
        date(2026, 9, 7),
    )
    assert DashboardService._period_dates("month", date(2026, 9, 17)) == (
        date(2026, 9, 1),
        date(2026, 10, 1),
    )
    assert DashboardService._period_dates("quarter", date(2026, 9, 17)) == (
        date(2026, 7, 1),
        date(2026, 10, 1),
    )
    assert DashboardService._period_dates("month", date(2026, 12, 17)) == (
        date(2026, 12, 1),
        date(2027, 1, 1),
    )
    assert DashboardService._period_dates("quarter", date(2026, 12, 17)) == (
        date(2026, 10, 1),
        date(2027, 1, 1),
    )


@pytest.mark.integration
def test_seeded_dashboard_aggregates_every_summary_and_branch_scope() -> None:
    connection = get_engine().connect()
    transaction = connection.begin()
    try:
        with Session(bind=connection, expire_on_commit=False) as session:
            seeded = seed_demo_data(
                session,
                hash_password(_OWNER_PASSWORD),
                enabled=True,
            )
            assert seeded.workspace_id is not None
            owner_membership_id = session.scalar(
                select(WorkspaceMembership.id)
                .join(
                    PlatformUser,
                    PlatformUser.id == WorkspaceMembership.platform_user_id,
                )
                .where(
                    WorkspaceMembership.workspace_id == seeded.workspace_id,
                    PlatformUser.external_subject == "local:owner",
                )
            )
            assert owner_membership_id is not None
            grant = PermissionGrant(
                permission_code="dashboard.read",
                workspace_id=seeded.workspace_id,
                membership_id=owner_membership_id,
                allowed_legal_entity_ids=None,
                allowed_branch_ids=None,
            )
            service = DashboardService(session)

            today = service.summary(grant, period="today", branch_id=None, now=_FIXED_NOW)
            week = service.summary(grant, period="week", branch_id=None, now=_FIXED_NOW)
            month = service.summary(grant, period="month", branch_id=None, now=_FIXED_NOW)
            quarter = service.summary(grant, period="quarter", branch_id=None, now=_FIXED_NOW)
            trend = service.sales_trend(grant, period="week", branch_id=None, now=_FIXED_NOW)
            today_trend = service.sales_trend(grant, period="today", branch_id=None, now=_FIXED_NOW)
            month_trend = service.sales_trend(grant, period="month", branch_id=None, now=_FIXED_NOW)
            quarter_trend = service.sales_trend(
                grant, period="quarter", branch_id=None, now=_FIXED_NOW
            )
            alerts = service.stock_alerts(grant, branch_id=None, limit=100)
            agenda_date, appointments = service.appointments_today(
                grant, branch_id=None, limit=100, now=_FIXED_NOW
            )
            activity = service.recent_activity(
                grant,
                period="today",
                branch_id=None,
                limit=50,
                now=_FIXED_NOW,
            )

            assert today.revenue > Decimal("0")
            assert today.appointments_today == 8
            assert today.open_tasks == 4
            assert week.open_tasks == 9
            assert month.open_tasks == 12
            assert quarter.open_tasks == 16
            assert trend.total == week.revenue
            assert len(trend.points) == 7
            assert today_trend.total == today.revenue
            assert len(today_trend.points) == 12
            assert month_trend.total == month.revenue
            assert len(month_trend.points) == 5
            assert quarter_trend.total == quarter.revenue
            assert len(quarter_trend.points) == 3
            assert alerts
            assert {record.balance.branch_id for record in alerts}
            assert agenda_date == date(2026, 9, 1)
            assert len(appointments) == 8
            assert activity
            assert {item.source for item in activity} >= {"Agenda", "POS", "Tareas"}

            hq = session.scalar(
                select(Branch).where(
                    Branch.workspace_id == seeded.workspace_id,
                    Branch.code == "HQ",
                )
            )
            assert hq is not None
            hq_today = service.summary(
                grant,
                period="today",
                branch_id=hq.id,
                now=_FIXED_NOW,
            )
            assert hq_today.appointments_today == 2
            assert hq_today.open_tasks == 1
            hq_week = service.summary(
                grant,
                period="week",
                branch_id=hq.id,
                now=_FIXED_NOW,
            )
            assert hq_week.revenue < week.revenue

            restricted_grant = PermissionGrant(
                permission_code="dashboard.read",
                workspace_id=seeded.workspace_id,
                membership_id=owner_membership_id,
                allowed_legal_entity_ids=None,
                allowed_branch_ids=frozenset({hq.id}),
            )
            restricted_today = service.summary(
                restricted_grant,
                period="today",
                branch_id=None,
                now=_FIXED_NOW.replace(tzinfo=None),
            )
            restricted_trend = service.sales_trend(
                restricted_grant,
                period="today",
                branch_id=None,
                now=_FIXED_NOW,
            )
            restricted_alerts = service.stock_alerts(
                restricted_grant,
                branch_id=None,
                limit=100,
            )
            _, restricted_appointments = service.appointments_today(
                restricted_grant,
                branch_id=None,
                limit=100,
                now=_FIXED_NOW,
            )
            restricted_activity = service.recent_activity(
                restricted_grant,
                period="today",
                branch_id=None,
                limit=50,
                now=_FIXED_NOW,
            )
            assert restricted_today.revenue == hq_today.revenue
            assert restricted_today.appointments_today == hq_today.appointments_today
            assert restricted_today.open_tasks == hq_today.open_tasks
            assert restricted_trend.total == hq_today.revenue
            assert {record.balance.branch_id for record in restricted_alerts} <= {hq.id}
            assert {item.branch_id for item in restricted_appointments} <= {hq.id}
            assert {item.branch_id for item in restricted_activity} <= {hq.id}

            with pytest.raises(ResourceNotFoundError, match="fuera de tu alcance"):
                service.summary(
                    restricted_grant,
                    period="today",
                    branch_id=uuid7(),
                    now=_FIXED_NOW,
                )
    finally:
        transaction.rollback()
        connection.close()


@pytest.mark.integration
def test_dashboard_http_contract_auth_filters_and_validation(client: TestClient) -> None:
    with session_scope() as session:
        bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}

    paths = (
        "/api/v1/dashboard/summary?period=quarter",
        "/api/v1/dashboard/sales-trend?period=month",
        "/api/v1/dashboard/stock-alerts?limit=6",
        "/api/v1/dashboard/appointments?limit=6",
        "/api/v1/dashboard/activity?period=week&limit=6",
    )
    for path in paths:
        response = client.get(path, headers=headers)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "no-store"

    summary = client.get("/api/v1/dashboard/summary", headers=headers)
    assert "leads" not in summary.json()
    assert client.get("/api/v1/dashboard/summary").status_code == 401
    invalid_period = client.get(
        "/api/v1/dashboard/summary?period=year",
        headers=headers,
    )
    assert invalid_period.status_code == 400
