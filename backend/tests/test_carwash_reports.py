from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid7

import pytest
from app.db.models import (
    Branch,
    CarwashCommission,
    CarwashSettlement,
    CarwashSettlementDetail,
    CarwashWash,
    CarwashWashLine,
)
from app.db.session import session_scope
from app.services.carwash_reports import date_bounds
from sqlalchemy import delete, select

from tests.test_carwash_checkout import checkout_setup as checkout_fixture
from tests.test_carwash_checkout import complete, washing
from tests.test_carwash_commissions import pay, reverse
from tests.test_carwash_operations import action, register
from tests.test_carwash_settings import BASE, create, new_service, scoped_user

pytestmark = pytest.mark.integration


@pytest.fixture
def setup(client, monkeypatch):
    monkeypatch.setattr(
        "app.services.carwash_reports.now_utc", lambda: datetime(2026, 9, 28, 2, tzinfo=UTC)
    )
    for value in checkout_fixture.__wrapped__(client):
        try:
            yield value
        finally:
            # Only this fixture's disposable branch; later migration tests downgrade the schema.
            with session_scope() as session:
                for model in (
                    CarwashSettlementDetail,
                    CarwashSettlement,
                    CarwashCommission,
                    CarwashWashLine,
                    CarwashWash,
                ):
                    session.execute(delete(model).where(model.branch_id == UUID(value["branchId"])))


def reports(client, setup, **query):
    return client.get(
        f"{BASE}/reports", headers=setup["headers"], params={"branchId": setup["branchId"], **query}
    )


def indicators(client, setup, **query):
    return client.get(
        f"{BASE}/indicators",
        headers=setup["headers"],
        params={"branchId": setup["branchId"], **query},
    )


def completed(client, setup, at, **changes):
    response = complete(client, setup, washing(client, setup), **changes)
    assert response.status_code == 200, response.text
    wash = response.json()
    with session_scope() as session:
        session.get(CarwashWash, UUID(wash["id"])).completed_at = at
        for row in session.scalars(
            select(CarwashCommission).where(CarwashCommission.wash_id == UUID(wash["id"]))
        ):
            row.accrued_at = at
    return wash


def test_reports_reconcile_multiple_services_roles_discounts_settlements_and_voids(client, setup):
    wash = completed(
        client,
        setup,
        datetime(2026, 9, 28, 2, tzinfo=UTC),
        discountType="percent",
        discountValue="10",
    )
    register(client, setup, plate="WAITING")
    washing(client, setup, plate="WASHING")
    response = reports(client, setup)
    assert response.status_code == 200, response.text
    data = response.json()
    assert response.headers["cache-control"] == "no-store"
    assert (data["dateFrom"], data["dateTo"], len(data["daily"])) == (
        "2026-09-01",
        "2026-09-30",
        30,
    )
    assert data["totals"] == {
        "washes": 1,
        "billed": "637.46",
        "washerCommissions": "108.04",
        "supervisorCommissions": "27.01",
        "commissions": "135.05",
        "serviceCount": 2,
        "employeeCount": 1,
    }
    assert sum(row["count"] for row in data["services"]) == 2
    assert data["employees"][0]["washes"] == 1
    assert data["employees"][0]["commissions"] == "135.05"
    assert data["daily"][26]["billed"] == "637.46"
    assert data["daily"][27]["billed"] == "0.00"
    kpi = indicators(client, setup).json()
    assert kpi["today"] == "2026-09-27"
    assert (
        kpi["activeWashes"],
        kpi["completedToday"],
        kpi["billedToday"],
        kpi["pendingCommissions"],
    ) == (2, 1, "637.46", "135.05")
    rows = client.get(
        f"{BASE}/commissions", headers=setup["headers"], params={"branchId": setup["branchId"]}
    ).json()["items"]
    paid = pay(client, setup, rows)
    assert paid.status_code == 201, paid.text
    assert Decimal(indicators(client, setup).json()["pendingCommissions"]) == 0
    assert reports(client, setup).json()["totals"] == data["totals"]
    assert reverse(client, setup, paid.json()).status_code == 200
    assert indicators(client, setup).json()["pendingCommissions"] == "135.05"
    assert action(client, setup, wash, "void", reason="Excluir de reportes").status_code == 200
    empty = reports(client, setup).json()
    assert empty["totals"]["washes"] == 0
    assert empty["services"] == empty["employees"] == []
    assert all(Decimal(row["billed"]) == 0 for row in empty["daily"])
    assert indicators(client, setup).json()["completedToday"] == 0


def test_period_boundaries_equal_totals_zero_sales_and_empty_results(client, setup):
    completed(client, setup, datetime(2026, 9, 1, 3, 59, 59, tzinfo=UTC))  # previous local month
    completed(client, setup, datetime(2026, 9, 1, 4, tzinfo=UTC))
    completed(client, setup, datetime(2026, 10, 1, 3, 59, 59, tzinfo=UTC))
    completed(client, setup, datetime(2026, 10, 1, 4, tzinfo=UTC))  # next local month
    data = reports(client, setup).json()
    assert data["totals"]["washes"] == 2 and data["totals"]["billed"] == "1416.60"
    assert sum(Decimal(row["billed"]) for row in data["daily"]) == Decimal("1416.60")
    assert data["daily"][0]["washes"] == data["daily"][-1]["washes"] == 1
    assert data["employees"][0]["washes"] == 2
    assert reports(client, setup, dateFrom="2026-09-30", dateTo="2026-09-01").status_code == 400
    assert reports(client, setup, dateFrom="2020-01-01", dateTo="2026-09-30").status_code == 400
    assert reports(client, setup, dateTo="9999-12-31").status_code == 400
    assert reports(client, setup, dateFrom="invalid").status_code == 400
    assert (
        reports(client, setup, dateFrom="2024-01-01", dateTo="2024-12-31").json()["totals"][
            "washes"
        ]
        == 0
    )
    assert (
        len(reports(client, setup, dateFrom="2024-01-01", dateTo="2024-12-31").json()["daily"])
        == 366
    )


def test_report_permission_scope_and_redacted_commission_indicator(client, setup):
    read = scoped_user(client, setup, {"carwash.read"})
    restricted = {**setup, "headers": read}
    assert indicators(client, restricted).json()["pendingCommissions"] is None
    assert reports(client, restricted).status_code == 403
    reporter = scoped_user(client, setup, {"carwash.read", "carwash.reports.read"})
    assert reports(client, {**setup, "headers": reporter}).status_code == 200
    assert (
        Decimal(indicators(client, {**setup, "headers": reporter}).json()["pendingCommissions"])
        == 0
    )
    assert indicators(client, restricted, branchId=setup["otherBranchId"]).status_code == 403
    assert (
        reports(client, {**setup, "headers": reporter}, branchId=setup["otherBranchId"]).status_code
        == 403
    )
    assert reports(client, setup, branchId=str(uuid7())).status_code == 404
    assert indicators(client, setup, branchId=str(uuid7())).status_code == 404
    assert client.get(f"{BASE}/reports", params={"branchId": setup["branchId"]}).status_code == 401
    with session_scope() as session:
        session.get(Branch, UUID(setup["branchId"])).status = "inactive"
    assert reports(client, setup).status_code == 404


def test_free_services_credit_sales_and_other_branch_are_reported_correctly(client, setup):
    free = {**setup, "payload": {**setup["payload"], "serviceIds": [setup["services"][1]["id"]]}}
    completed(client, free, datetime(2026, 9, 28, 2, tzinfo=UTC))
    data = reports(client, setup).json()
    assert data["totals"]["washes"] == 1 and data["totals"]["billed"] == "0.00"
    assert data["services"][0]["count"] == 1
    assert data["employees"][0]["commissions"] == "0.00"
    method = client.post(
        "/api/v1/payment-methods",
        headers=setup["headers"],
        json={
            "code": f"cw-{uuid7()}",
            "name": "Crédito reportes",
            "channel": "bank_transfer",
            "settlementPolicy": "pending_confirmation",
            "affectsCashDrawer": False,
            "requiresEvidence": False,
        },
    )
    assert method.status_code == 201, method.text
    wash = washing(client, setup)
    credit = action(
        client,
        setup,
        wash,
        "complete",
        registerId=setup["registerId"],
        paymentMethodId=method.json()["id"],
    )
    assert credit.status_code == 200, credit.text
    assert credit.json()["receivableId"]
    with session_scope() as session:
        session.get(CarwashWash, UUID(wash["id"])).completed_at = datetime(
            2026, 9, 28, 2, tzinfo=UTC
        )
    billing = client.get(f"{BASE}/washes/{wash['id']}/billing", headers=setup["headers"]).json()
    assert billing["paidAmount"] == "0.00"
    data = reports(client, setup).json()
    assert data["totals"]["washes"] == 2 and data["totals"]["billed"] == "708.30"
    assert data["totals"]["commissions"] == "150.06"
    assert reports(client, setup, branchId=setup["otherBranchId"]).json()["totals"]["washes"] == 0
    assert (
        indicators(client, setup, branchId=setup["otherBranchId"]).json()["pendingCommissions"]
        == "0.00"
    )


def test_service_rollup_and_employee_ranking_preserve_full_totals(client, setup):
    result = create(
        client,
        setup,
        [new_service(setup, salePrice=str(index + 1), taxRate="0") for index in range(11)],
    )
    assert result.status_code == 201, result.text
    for index, service in enumerate(result.json()["items"]):
        employee = client.post(
            "/api/v1/employees",
            headers=setup["headers"],
            json={
                "employeeNumber": uuid7().hex[-20:],
                "firstName": f"Empleado {index}",
                "lastName": "Reportes",
                "position": "Lavador",
                "hireDate": "2026-01-01",
                "branchIds": [setup["branchId"]],
            },
        )
        assert employee.status_code == 201, employee.text
        scoped = {
            **setup,
            "payload": {
                **setup["payload"],
                "plate": f"RPT{index:02d}{uuid7().hex[:4].upper()}",
                "serviceIds": [service["id"]],
                "washerId": employee.json()["id"],
                "supervisorId": employee.json()["id"],
            },
        }
        completed(client, scoped, datetime(2026, 9, 28, 2, tzinfo=UTC))
    data = reports(client, setup).json()
    assert data["totals"]["serviceCount"] == data["totals"]["employeeCount"] == 11
    assert len(data["services"]) == 10 and data["services"][-1] == {
        "itemId": None,
        "name": "Otros servicios",
        "count": 2,
    }
    assert sum(row["count"] for row in data["services"]) == 11
    assert len(data["employees"]) == 10
    assert data["employees"][0]["name"] == "Empleado 10 Reportes"
    assert data["employees"][0]["commissions"] == "2.75"
    assert data["totals"]["billed"] == "66.00" and data["totals"]["commissions"] == "16.50"


@pytest.mark.parametrize("day,hours", [(date(2026, 3, 8), 23), (date(2026, 11, 1), 25)])
def test_local_day_bounds_follow_daylight_saving(day, hours):
    start, end = date_bounds(day, day, "America/New_York")
    assert (end.astimezone(UTC) - start.astimezone(UTC)).total_seconds() == hours * 3600
