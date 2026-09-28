from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid7

import pytest
from app.db.models import (
    CarwashCommission,
    CarwashSettlement,
    CarwashSettlementDetail,
    CashMovement,
    CashRegister,
    FinanceExpense,
    PaymentMethod,
)
from app.db.session import session_scope
from app.repositories.finance import FinanceRepository
from app.services.carwash_commissions import CarwashCommissionService
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from tests.test_carwash_checkout import checkout_setup as checkout_fixture
from tests.test_carwash_checkout import complete, washing
from tests.test_carwash_operations import action
from tests.test_carwash_settings import BASE, scoped_user

pytestmark = pytest.mark.integration


@pytest.fixture
def setup(client):
    yield from checkout_fixture.__wrapped__(client)


def earned(client, setup, **changes):
    response = complete(client, setup, washing(client, setup, **changes))
    assert response.status_code == 200, response.text
    wash = response.json()
    result = client.get(
        f"{BASE}/commissions", headers=setup["headers"], params={"branchId": setup["branchId"]}
    )
    assert result.status_code == 200, result.text
    return wash, [row for row in result.json()["items"] if row["washId"] == wash["id"]]


def pay(client, setup, rows, key=None, **changes):
    payload = {
        "branchId": setup["branchId"],
        "employeeId": rows[0]["employeeId"],
        "registerId": setup["registerId"],
        "paymentMethodId": setup["paymentMethodId"],
        "commissions": [{"id": row["id"], "version": row["version"]} for row in rows],
        **changes,
    }
    return client.post(
        f"{BASE}/settlements",
        headers={**setup["headers"], "Idempotency-Key": key or str(uuid7())},
        json=payload,
    )


def reverse(client, setup, row, key=None, **changes):
    return client.post(
        f"{BASE}/settlements/{row['id']}/reverse",
        headers={**setup["headers"], "Idempotency-Key": key or str(uuid7())},
        json={"version": row["version"], "reason": "Pago equivocado", **changes},
    )


def expenses(setup):
    with session_scope() as session:
        return (
            FinanceRepository(session)
            .list_expenses(
                workspace_id=setup["workspaceId"],
                visible_branch_ids=None,
                branch_id=UUID(setup["branchId"]),
                search=None,
                status=None,
                date_from=None,
                date_to=None,
                timezone="America/La_Paz",
                page=1,
                page_size=100,
                sort_by="date",
                sort_direction="desc",
            )
            .total_items
        )


def test_settlement_replay_reversal_and_finance_reconcile(client, setup):
    wash, rows = earned(client, setup)
    assert len(rows) == 4  # two services, same employee in both roles, including free service
    before = expenses(setup)
    summary = client.get(
        f"{BASE}/commissions",
        headers=setup["headers"],
        params={"branchId": setup["branchId"], "pageSize": 1},
    ).json()
    assert len(summary["items"]) == 1
    assert summary["summary"] == {
        "washes": 1,
        "billed": "708.30",
        "commissions": "150.06",
        "pending": "150.06",
    }
    key = str(uuid7())
    paid = pay(client, setup, rows, key)
    assert paid.status_code == 201, paid.text
    row = paid.json()
    assert row["amount"] == "150.06" and row["movementId"]
    assert pay(client, setup, rows, key).json() == row
    assert pay(client, setup, rows).status_code == 409
    assert pay(client, setup, rows[:1], key).status_code == 409
    assert client.get(f"{BASE}/settlements/{row['id']}", headers=setup["headers"]).json() == row
    assert expenses(setup) == before + 1
    with session_scope() as session:
        register = session.get(CashRegister, UUID(setup["registerId"]))
        assert register.cash_expense_amount == Decimal("150.06")
        assert (
            session.scalar(
                select(func.count())
                .select_from(FinanceExpense)
                .where(FinanceExpense.branch_id == register.branch_id)
            )
            == 0
        )
    assert action(client, setup, wash, "void", reason="No debe permitir").status_code == 409
    reversal_key = str(uuid7())
    result = reverse(client, setup, row, reversal_key)
    assert result.status_code == 200, result.text
    reverted = result.json()
    assert reverted["reversalMovementId"] and reverted["status"] == "reversed"
    assert reverse(client, setup, row, reversal_key).json() == reverted
    assert reverse(client, setup, row).status_code == 409
    assert reverse(client, setup, row, reversal_key, reason="Otro motivo").status_code == 409
    assert expenses(setup) == before
    with session_scope() as session:
        assert session.get(CashRegister, UUID(setup["registerId"])).cash_expense_amount == 0
        assert all(
            detail.reversed_at
            for detail in session.scalars(
                select(CarwashSettlementDetail).where(
                    CarwashSettlementDetail.settlement_id == UUID(row["id"])
                )
            )
        )
    repaid = pay(client, setup, reverted["commissions"])
    assert repaid.status_code == 201, repaid.text
    assert reverse(client, setup, repaid.json()).status_code == 200
    assert action(client, setup, wash, "void", reason="Anular tras reverso").status_code == 200
    summary = client.get(
        f"{BASE}/commissions", headers=setup["headers"], params={"branchId": setup["branchId"]}
    ).json()["summary"]
    assert summary == {"washes": 0, "billed": "0", "commissions": "0", "pending": "0"} or all(
        Decimal(str(value)) == 0 for value in summary.values()
    )


def test_filters_permissions_scopes_versions_and_validation(client, setup):
    _, rows = earned(client, setup)
    upper_bound = client.get(
        f"{BASE}/commissions",
        headers=setup["headers"],
        params={"branchId": setup["branchId"], "dateTo": "9999-12-31"},
    )
    assert upper_bound.status_code == 200 and upper_bound.json()["totalItems"] == 4
    context = client.get(
        f"{BASE}/commission-context",
        headers=setup["headers"],
        params={"branchId": setup["branchId"]},
    )
    assert (
        context.status_code == 200 and context.json()["canSettle"] and context.json()["canReverse"]
    )
    query = {
        "branchId": setup["branchId"],
        "employeeId": rows[0]["employeeId"],
        "role": "washer",
        "status": "pending",
        "dateFrom": "2000-01-01",
        "dateTo": "2099-12-31",
    }
    assert (
        client.get(f"{BASE}/commissions", headers=setup["headers"], params=query).json()[
            "totalItems"
        ]
        == 2
    )
    assert (
        client.get(
            f"{BASE}/commissions",
            headers=setup["headers"],
            params={**query, "dateFrom": "2099-01-01"},
        ).json()["totalItems"]
        == 0
    )
    assert (
        client.get(
            f"{BASE}/commissions",
            headers=setup["headers"],
            params={**query, "dateFrom": "2100-01-01"},
        ).status_code
        == 400
    )
    assert pay(client, setup, rows + rows[:1]).status_code == 400
    assert pay(client, setup, [{**rows[0], "version": 999}]).status_code == 409
    assert pay(client, setup, rows, employeeId=str(uuid7())).status_code == 400
    assert pay(client, setup, [{**rows[0], "id": str(uuid7())}]).status_code == 404
    assert pay(client, setup, rows, branchId=setup["otherBranchId"]).status_code == 404
    read = scoped_user(client, setup, {"carwash.read", "carwash.commissions.read"})
    assert (
        client.get(
            f"{BASE}/commissions", headers=read, params={"branchId": setup["branchId"]}
        ).status_code
        == 200
    )
    assert pay(client, {**setup, "headers": read}, rows).status_code == 403
    assert (
        client.get(
            f"{BASE}/commissions", headers=read, params={"branchId": setup["otherBranchId"]}
        ).status_code
        == 403
    )
    assert (
        client.get(f"{BASE}/commissions", params={"branchId": setup["branchId"]}).status_code == 401
    )
    assert client.get(f"{BASE}/settlements/{uuid7()}", headers=setup["headers"]).status_code == 404
    paid = pay(client, setup, rows).json()
    assert reverse(client, {**setup, "headers": read}, paid).status_code == 403
    assert reverse(client, setup, paid, reason="  ").status_code == 400
    assert reverse(client, setup, paid, version=99).status_code == 409
    history = client.get(
        f"{BASE}/settlements",
        headers=setup["headers"],
        params={"branchId": setup["branchId"], "employeeId": rows[0]["employeeId"]},
    ).json()
    assert history["totalItems"] == 1


def test_zero_commissions_closed_box_and_inactive_payment(client, setup):
    _, rows = earned(client, setup, serviceIds=[setup["services"][1]["id"]])
    with session_scope() as session:
        session.get(PaymentMethod, UUID(setup["paymentMethodId"])).status = "inactive"
    assert pay(client, setup, rows).status_code == 404
    with session_scope() as session:
        method = session.get(PaymentMethod, UUID(setup["paymentMethodId"]))
        method.status = "active"
        method.channel = "bank_transfer"
        method.affects_cash_drawer = False
    assert pay(client, setup, rows).status_code == 400
    with session_scope() as session:
        method = session.get(PaymentMethod, UUID(setup["paymentMethodId"]))
        method.channel = "cash"
        method.affects_cash_drawer = True
    response = pay(client, setup, rows)
    assert response.status_code == 201, response.text
    paid = response.json()
    assert paid["amount"] == "0.00" and paid["movementId"] is None
    reverted = reverse(client, setup, paid)
    assert reverted.status_code == 200 and reverted.json()["reversalMovementId"] is None
    with session_scope() as session:
        register = session.get(CashRegister, UUID(setup["registerId"]))
        version = register.version
    close = client.post(
        f"/api/v1/pos/registers/{setup['registerId']}/close",
        headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
        json={"version": version, "countedCash": "0.00"},
    )
    assert close.status_code == 200, close.text
    assert pay(client, setup, reverted.json()["commissions"]).status_code == 409


@pytest.mark.parametrize("database_failure", [False, True])
def test_concurrent_payment_atomic_failure_and_void_race(
    client, setup, monkeypatch, database_failure
):
    wash, rows = earned(client, setup)
    original = CarwashCommissionService.audit

    def fail(*args):
        if database_failure:
            raise IntegrityError(
                "injected post-flush failure", {}, RuntimeError("database failure")
            )
        raise RuntimeError("Failure after movement and commission flush")

    monkeypatch.setattr(CarwashCommissionService, "audit", fail)
    assert pay(client, setup, rows).status_code == (409 if database_failure else 500)
    with session_scope() as session:
        assert session.get(CashRegister, UUID(setup["registerId"])).cash_expense_amount == 0
        assert (
            session.scalar(
                select(func.count())
                .select_from(CarwashSettlement)
                .where(CarwashSettlement.branch_id == UUID(setup["branchId"]))
            )
            == 0
        )
    monkeypatch.setattr(CarwashCommissionService, "audit", original)
    key = str(uuid7())
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: pay(client, setup, rows, key), range(2)))
    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json()["id"] == responses[1].json()["id"]
    paid = responses[0].json()
    monkeypatch.setattr(CarwashCommissionService, "audit", fail)
    assert reverse(client, setup, paid).status_code == (409 if database_failure else 500)
    with session_scope() as session:
        assert session.get(CarwashSettlement, UUID(paid["id"])).status == "posted"
        assert (
            session.scalar(
                select(func.count())
                .select_from(CashMovement)
                .where(CashMovement.reversal_of_movement_id == UUID(paid["movementId"]))
            )
            == 0
        )
    monkeypatch.setattr(CarwashCommissionService, "audit", original)
    assert reverse(client, setup, paid).status_code == 200
    rows = client.get(
        f"{BASE}/commissions", headers=setup["headers"], params={"branchId": setup["branchId"]}
    ).json()["items"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        payment = pool.submit(pay, client, setup, rows)
        void = pool.submit(action, client, setup, wash, "void", reason="Carrera controlada")
        payment_response, void_response = payment.result(timeout=30), void.result(timeout=30)
    assert sorted([payment_response.status_code, void_response.status_code]) in (
        [201, 409],
        [200, 409],
    )
    with session_scope() as session:
        states = set(
            session.scalars(
                select(CarwashCommission.status).where(
                    CarwashCommission.wash_id == UUID(wash["id"])
                )
            )
        )
        assert states in ({"settled"}, {"voided"})


def test_reversal_in_new_register_concurrent_retry_and_local_dates(client, setup):
    wash, rows = earned(client, setup)
    with session_scope() as session:
        for row in rows:
            session.get(CarwashCommission, UUID(row["id"])).accrued_at = datetime(
                2026, 9, 28, 2, tzinfo=UTC
            )
    # Fixture branch is America/Santo_Domingo: UTC 02:00 is the previous local day.
    query = {"branchId": setup["branchId"], "dateFrom": "2026-09-27", "dateTo": "2026-09-27"}
    assert (
        client.get(f"{BASE}/commissions", headers=setup["headers"], params=query).json()[
            "totalItems"
        ]
        == 4
    )
    query.update(dateFrom="2026-09-28", dateTo="2026-09-28")
    assert (
        client.get(f"{BASE}/commissions", headers=setup["headers"], params=query).json()[
            "totalItems"
        ]
        == 0
    )
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: pay(client, setup, rows), range(2)))
    assert sorted(response.status_code for response in responses) == [201, 409]
    paid = next(response.json() for response in responses if response.status_code == 201)
    with session_scope() as session:
        register = session.get(CashRegister, UUID(setup["registerId"]))
        version = register.version
    closed = client.post(
        f"/api/v1/pos/registers/{setup['registerId']}/close",
        headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
        json={"version": version, "countedCash": "558.24"},
    )
    assert closed.status_code == 200, closed.text
    assert reverse(client, setup, paid).status_code == 409
    opened = client.post(
        "/api/v1/pos/registers",
        headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
        json={"branchId": setup["branchId"], "openingCash": "0.00"},
    )
    assert opened.status_code == 201, opened.text
    key = str(uuid7())
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: reverse(client, setup, paid, key), range(2)))
    assert [response.status_code for response in responses] == [200, 200]
    assert responses[0].json() == responses[1].json()
    with session_scope() as session:
        old = session.get(CashRegister, UUID(setup["registerId"]))
        new = session.get(CashRegister, UUID(opened.json()["id"]))
        assert old.cash_expense_amount == Decimal("150.06") and old.status == "closed"
        assert new.cash_income_amount == Decimal("150.06")
    assert expenses(setup) == 0


def test_paid_credit_wash_can_settle_without_collecting_receivable(client, setup):
    method = client.post(
        "/api/v1/payment-methods",
        headers=setup["headers"],
        json={
            "code": f"cw{uuid7().hex[:12]}",
            "name": "Crédito Carwash",
            "channel": "bank_transfer",
            "settlementPolicy": "pending_confirmation",
            "affectsCashDrawer": False,
            "requiresEvidence": False,
        },
    )
    assert method.status_code == 201, method.text
    wash = washing(client, setup)
    response = action(
        client,
        setup,
        wash,
        "complete",
        registerId=setup["registerId"],
        paymentMethodId=method.json()["id"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["receivableId"]
    rows = client.get(
        f"{BASE}/commissions", headers=setup["headers"], params={"branchId": setup["branchId"]}
    ).json()["items"]
    paid = pay(client, setup, rows)
    assert paid.status_code == 201, paid.text
    billing = client.get(f"{BASE}/washes/{wash['id']}/billing", headers=setup["headers"]).json()
    assert billing["pendingAmount"] == "708.30" and billing["paidAmount"] == "0.00"
    assert reverse(client, setup, paid.json()).status_code == 200


def test_multiple_washes_with_equal_totals_share_one_expense(client, setup):
    _, first = earned(client, setup)
    _, second = earned(client, setup, plate="CW-SECOND")
    other_register = client.post(
        "/api/v1/pos/registers",
        headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
        json={"branchId": setup["otherBranchId"], "openingCash": "0.00"},
    )
    assert other_register.status_code == 201, other_register.text
    assert pay(client, setup, first, registerId=other_register.json()["id"]).status_code == 400
    result = pay(client, setup, first + second)
    assert result.status_code == 201, result.text
    assert result.json()["amount"] == "300.12"
    assert len(result.json()["commissions"]) == 8
    summary = client.get(
        f"{BASE}/commissions",
        headers=setup["headers"],
        params={"branchId": setup["branchId"], "status": "settled"},
    ).json()["summary"]
    assert summary["washes"] == 2
    assert summary["billed"] == "1416.60"
    assert summary["commissions"] == "300.12"
    assert Decimal(summary["pending"]) == 0
    assert expenses(setup) == 1
