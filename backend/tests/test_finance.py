from collections.abc import Generator
from datetime import date, datetime
from decimal import Decimal
from typing import Any, cast
from uuid import UUID, uuid7
from zoneinfo import ZoneInfo

import pytest
from app.core.security import hash_password
from app.db.models import AuditEntry, CashRegister, Sale
from app.db.session import dispose_engine, get_engine, get_session
from app.main import app
from app.schemas.finance import (
    CreateFinanceLiabilityRequest,
    PayFinanceFixedExpenseRequest,
)
from app.services.demo_seed import seed_demo_data
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

_PASSWORD = "finance-test-password-not-a-secret"
_OWNER_EMAIL = "owner@erp.dev"


def _login(client: TestClient, email: str = _OWNER_EMAIL) -> tuple[dict[str, str], dict[str, Any]]:
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": _PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    return headers, cast(dict[str, Any], me.json())


@pytest.fixture
def finance_context() -> Generator[tuple[TestClient, Session]]:
    """Run the complete demo-backed contract inside a rollback-only transaction."""
    dispose_engine()
    connection = get_engine().connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    summary = seed_demo_data(session, hash_password(_PASSWORD), enabled=True)
    assert summary.finance_budget_count == 4
    assert summary.finance_expense_count == 6
    assert summary.finance_fixed_expense_count == 4
    assert summary.finance_fixed_payment_count == 3
    assert summary.finance_liability_count == 3
    assert summary.finance_account_count == 3
    assert summary.finance_income_count == 3

    def override_session() -> Generator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    try:
        with TestClient(app, raise_server_exceptions=False) as isolated_client:
            yield isolated_client, session
    finally:
        app.dependency_overrides.pop(get_session, None)
        session.close()
        transaction.rollback()
        connection.close()
        dispose_engine()


def test_finance_schemas_reject_inconsistent_liabilities_and_periods() -> None:
    branch_id = uuid7()
    with pytest.raises(ValidationError, match="día de corte"):
        CreateFinanceLiabilityRequest.model_validate(
            {
                "name": "Tarjeta sin corte",
                "type": "tarjeta",
                "initialAmount": "1000.00",
                "branchId": branch_id,
            }
        )
    with pytest.raises(ValidationError, match="no puede superar"):
        CreateFinanceLiabilityRequest.model_validate(
            {
                "name": "Préstamo inconsistente",
                "type": "prestamo",
                "initialAmount": "1000.00",
                "pendingAmount": "1000.01",
                "branchId": branch_id,
            }
        )
    with pytest.raises(ValidationError, match="primer día"):
        PayFinanceFixedExpenseRequest(period=date(2026, 9, 2))


@pytest.mark.integration
def test_pos_income_is_recognized_on_register_close_and_removed_on_sale_void(
    finance_context: tuple[TestClient, Session],
) -> None:
    client, database = finance_context
    headers, session_context = _login(client)
    hq = next(branch for branch in session_context["visibleBranches"] if branch["code"] == "HQ")
    register = database.scalar(
        select(CashRegister).where(
            CashRegister.workspace_id == UUID(session_context["workspaceId"]),
            CashRegister.branch_id == UUID(hq["id"]),
            CashRegister.status == "open",
        )
    )
    assert register is not None
    sale = database.scalar(
        select(Sale).where(
            Sale.workspace_id == UUID(session_context["workspaceId"]),
            Sale.cash_register_id == register.id,
            Sale.payment_method_code == "card",
            Sale.status == "completed",
        )
    )
    assert sale is not None
    sale_id = str(sale.id)
    sale_total = sale.total

    before_close = client.get(
        "/api/v1/finance/incomes",
        headers=headers,
        params={"pageSize": 200},
    )
    assert before_close.status_code == 200, before_close.text
    assert sale_id not in {item["id"] for item in before_close.json()["items"]}

    current_response = client.get(
        "/api/v1/pos/registers/current",
        headers=headers,
        params={"branchId": str(hq["id"])},
    )
    assert current_response.status_code == 200, current_response.text
    current = current_response.json()
    close_response = client.post(
        f"/api/v1/pos/registers/{register.id}/close",
        headers={**headers, "Idempotency-Key": f"finance-close-{uuid7().hex}"},
        json={
            "countedCash": current["expectedCash"],
            "notes": "Reconocimiento financiero de prueba",
            "version": current["version"],
        },
    )
    assert close_response.status_code == 200, close_response.text
    closed = close_response.json()

    after_close = client.get(
        "/api/v1/finance/incomes",
        headers=headers,
        params={"pageSize": 200},
    )
    assert after_close.status_code == 200, after_close.text
    recognized = next(item for item in after_close.json()["items"] if item["id"] == sale_id)
    closed_at = datetime.fromisoformat(closed["closedAt"])
    expected_income_date = closed_at.astimezone(ZoneInfo("America/Santo_Domingo")).date()
    assert recognized["date"] == expected_income_date.isoformat()
    assert Decimal(recognized["amount"]) == sale_total

    summary_before_void = client.get(
        "/api/v1/pos/sales/summary",
        headers=headers,
        params={"branchId": str(hq["id"])},
    )
    assert summary_before_void.status_code == 200, summary_before_void.text
    sale_detail = client.get(f"/api/v1/pos/sales/{sale_id}", headers=headers)
    assert sale_detail.status_code == 200, sale_detail.text
    void_response = client.post(
        f"/api/v1/pos/sales/{sale_id}/void",
        headers={**headers, "Idempotency-Key": f"finance-void-{uuid7().hex}"},
        json={"reason": "Factura duplicada de prueba", "version": sale_detail.json()["version"]},
    )
    assert void_response.status_code == 200, void_response.text
    assert void_response.json()["status"] == "voided"

    after_void = client.get(
        "/api/v1/finance/incomes",
        headers=headers,
        params={"pageSize": 200},
    )
    assert after_void.status_code == 200, after_void.text
    assert sale_id not in {item["id"] for item in after_void.json()["items"]}

    persisted_invoice = client.get(f"/api/v1/pos/sales/{sale_id}", headers=headers)
    assert persisted_invoice.status_code == 200, persisted_invoice.text
    assert persisted_invoice.json()["status"] == "voided"
    sales_history = client.get(
        "/api/v1/pos/sales",
        headers=headers,
        params={"registerId": str(register.id), "pageSize": 200},
    )
    assert sales_history.status_code == 200, sales_history.text
    historical = next(item for item in sales_history.json()["items"] if item["id"] == sale_id)
    assert historical["status"] == "voided"

    summary_after_void = client.get(
        "/api/v1/pos/sales/summary",
        headers=headers,
        params={"branchId": str(hq["id"])},
    )
    assert summary_after_void.status_code == 200, summary_after_void.text
    assert Decimal(summary_after_void.json()["netSales"]) == (
        Decimal(summary_before_void.json()["netSales"]) - sale_total
    )
    assert summary_after_void.json()["salesCount"] == (summary_before_void.json()["salesCount"] - 1)
    assert summary_after_void.json()["voidedCount"] == (
        summary_before_void.json()["voidedCount"] + 1
    )


@pytest.mark.integration
def test_finance_complete_http_contract_projections_scope_and_audit(
    finance_context: tuple[TestClient, Session],
) -> None:
    client, database = finance_context
    headers, session_context = _login(client)
    assert "finance" in session_context["enabledModules"]
    assert {"finance.read", "finance.manage"} <= set(session_context["effectivePermissionCodes"])
    visible_branches = cast(list[dict[str, Any]], session_context["visibleBranches"])
    north = next(branch for branch in visible_branches if branch["code"] == "NORTH")
    center = next(branch for branch in visible_branches if branch["code"] == "DOWNTOWN")
    north_id = str(north["id"])
    center_id = str(center["id"])
    suffix = uuid7().hex[-10:]
    period = date.today().strftime("%Y-%m")
    current_date = date.today().isoformat()

    assert client.get("/api/v1/finance/overview").status_code == 401
    cashier_headers, _ = _login(client, "demo.paz.cashier@example.com")
    assert client.get("/api/v1/finance/overview", headers=cashier_headers).status_code == 403
    supervisor_headers, supervisor = _login(client, "demo.luz.supervisor@example.com")
    supervisor_overview = client.get("/api/v1/finance/overview", headers=supervisor_headers)
    assert supervisor_overview.status_code == 200, supervisor_overview.text
    assert len(supervisor["visibleBranches"]) == 1
    forbidden_write = client.post(
        "/api/v1/finance/accounts",
        headers={**supervisor_headers, "Idempotency-Key": f"read-only-{suffix}"},
        json={
            "name": f"Cuenta sin permiso {suffix}",
            "branchId": str(supervisor["visibleBranches"][0]["id"]),
        },
    )
    assert forbidden_write.status_code == 403

    projected_expenses = client.get(
        "/api/v1/finance/expenses",
        headers=headers,
        params={"pageSize": 200},
    )
    assert projected_expenses.status_code == 200, projected_expenses.text
    assert projected_expenses.headers["cache-control"] == "no-store"
    expense_sources = {item["source"] for item in projected_expenses.json()["items"]}
    assert {"finanzas", "caja"} <= expense_sources
    assert any(not item["editable"] for item in projected_expenses.json()["items"])

    projected_incomes = client.get(
        "/api/v1/finance/incomes",
        headers=headers,
        params={"pageSize": 200},
    )
    assert projected_incomes.status_code == 200, projected_incomes.text
    assert {item["source"] for item in projected_incomes.json()["items"]} >= {
        "POS",
        "Formulario",
    }
    assert {item["origin"] for item in projected_incomes.json()["items"]} == {"manual", "pos"}
    assert all(item["editable"] for item in projected_incomes.json()["items"])
    assert all(item["version"] for item in projected_incomes.json()["items"])
    assert any(
        item["reference"] for item in projected_incomes.json()["items"] if item["origin"] == "pos"
    )

    overview_before = client.get(
        "/api/v1/finance/overview",
        headers=headers,
        params={"branchId": north_id, "period": period, "trendMonths": 12},
    )
    assert overview_before.status_code == 200, overview_before.text
    assert overview_before.json()["currency"] == "DOP"
    assert len(overview_before.json()["trend"]) == 12
    assert Decimal(overview_before.json()["balance"]) == (
        Decimal(overview_before.json()["incomes"]) - Decimal(overview_before.json()["expenses"])
    )
    inaccessible_branch = client.get(
        "/api/v1/finance/overview",
        headers=supervisor_headers,
        params={"branchId": center_id},
    )
    assert inaccessible_branch.status_code == 403
    backwards_range = client.get(
        "/api/v1/finance/expenses",
        headers=headers,
        params={"dateFrom": "2026-09-02", "dateTo": "2026-09-01"},
    )
    assert backwards_range.status_code == 400
    assert backwards_range.json()["parameter"] == "dateTo"

    budget_payload = {
        "name": f"Operaciones HTTP {suffix}",
        "group": "operaciones",
        "monthlyLimit": "15000.00",
        "branchId": north_id,
    }
    budget_key = f"finance-budget-{suffix}"
    create_budget = client.post(
        "/api/v1/finance/budgets",
        headers={**headers, "Idempotency-Key": budget_key},
        json=budget_payload,
    )
    assert create_budget.status_code == 201, create_budget.text
    budget = create_budget.json()
    assert budget["spent"] == "0"
    replay_budget = client.post(
        "/api/v1/finance/budgets",
        headers={**headers, "Idempotency-Key": budget_key},
        json=budget_payload,
    )
    assert replay_budget.status_code == 201
    assert replay_budget.json()["id"] == budget["id"]
    budget_conflict = client.post(
        "/api/v1/finance/budgets",
        headers={**headers, "Idempotency-Key": budget_key},
        json={**budget_payload, "monthlyLimit": "16000.00"},
    )
    assert budget_conflict.status_code == 409
    assert budget_conflict.json()["parameter"] == "Idempotency-Key"

    expense_payload = {
        "concept": f"Insumos controlados {suffix}",
        "amount": "1250.50",
        "category": "insumos",
        "date": current_date,
        "branchId": north_id,
        "status": "pendiente",
        "budgetId": budget["id"],
    }
    expense_key = f"finance-expense-{suffix}"
    create_expense = client.post(
        "/api/v1/finance/expenses",
        headers={**headers, "Idempotency-Key": expense_key},
        json=expense_payload,
    )
    assert create_expense.status_code == 201, create_expense.text
    expense = create_expense.json()
    assert expense["source"] == "finanzas"
    assert expense["editable"] is True
    mismatched_budget = client.post(
        "/api/v1/finance/expenses",
        headers={**headers, "Idempotency-Key": f"wrong-budget-{suffix}"},
        json={**expense_payload, "concept": f"Sucursal incorrecta {suffix}", "branchId": center_id},
    )
    assert mismatched_budget.status_code == 400
    assert mismatched_budget.json()["parameter"] == "budgetId"
    expense_list = client.get(
        "/api/v1/finance/expenses",
        headers=headers,
        params={
            "branchId": north_id,
            "search": suffix,
            "status": "pendiente",
            "dateFrom": current_date,
            "dateTo": current_date,
            "sortBy": "amount",
            "sortDirection": "asc",
        },
    )
    assert expense_list.status_code == 200, expense_list.text
    assert [item["id"] for item in expense_list.json()["items"]] == [expense["id"]]
    update_expense = client.patch(
        f"/api/v1/finance/expenses/{expense['id']}",
        headers=headers,
        json={"version": expense["version"], "status": "pagado", "amount": "1300.75"},
    )
    assert update_expense.status_code == 200, update_expense.text
    expense = update_expense.json()
    assert expense["version"] == 2
    stale_expense = client.patch(
        f"/api/v1/finance/expenses/{expense['id']}",
        headers=headers,
        json={"version": 1, "amount": "1.00"},
    )
    assert stale_expense.status_code == 409
    assert stale_expense.json()["parameter"] == "version"
    budget_after_expense = client.get(
        "/api/v1/finance/budgets",
        headers=headers,
        params={"search": suffix, "period": period},
    )
    assert budget_after_expense.status_code == 200
    assert Decimal(budget_after_expense.json()["items"][0]["spent"]) == Decimal("1300.75")
    assert len(budget_after_expense.json()["items"][0]["transactions"]) == 1

    fixed_payload = {
        "concept": f"Conectividad mensual {suffix}",
        "amount": "3200.00",
        "category": "servicios",
        "branchId": north_id,
        "dayOfMonth": 8,
    }
    create_fixed = client.post(
        "/api/v1/finance/fixed-expenses",
        headers={**headers, "Idempotency-Key": f"finance-fixed-{suffix}"},
        json=fixed_payload,
    )
    assert create_fixed.status_code == 201, create_fixed.text
    fixed = create_fixed.json()
    payment_key = f"finance-fixed-payment-{suffix}"
    pay_fixed = client.post(
        f"/api/v1/finance/fixed-expenses/{fixed['id']}/payments",
        headers={**headers, "Idempotency-Key": payment_key},
        json={"period": f"{period}-01", "paidOn": current_date},
    )
    assert pay_fixed.status_code == 200, pay_fixed.text
    fixed = pay_fixed.json()
    assert period in fixed["paidPeriods"]
    replay_payment = client.post(
        f"/api/v1/finance/fixed-expenses/{fixed['id']}/payments",
        headers={**headers, "Idempotency-Key": payment_key},
        json={"period": f"{period}-01", "paidOn": current_date},
    )
    assert replay_payment.status_code == 200
    duplicate_period = client.post(
        f"/api/v1/finance/fixed-expenses/{fixed['id']}/payments",
        headers={**headers, "Idempotency-Key": f"other-payment-{suffix}"},
        json={"period": f"{period}-01", "paidOn": current_date},
    )
    assert duplicate_period.status_code == 409
    assert duplicate_period.json()["parameter"] == "period"

    invalid_card = client.post(
        "/api/v1/finance/liabilities",
        headers={**headers, "Idempotency-Key": f"invalid-card-{suffix}"},
        json={
            "name": f"Tarjeta inválida {suffix}",
            "type": "tarjeta",
            "initialAmount": "50000.00",
            "branchId": north_id,
            "payDay": 20,
        },
    )
    assert invalid_card.status_code == 400
    liability_payload = {
        "name": f"Préstamo equipos HTTP {suffix}",
        "type": "prestamo",
        "initialAmount": "120000.00",
        "pendingAmount": "90000.00",
        "branchId": north_id,
        "payDay": 12,
        "installment": "10000.00",
        "paidInstallments": 3,
        "totalInstallments": 12,
        "categoryIds": ["mantenimiento"],
    }
    create_liability = client.post(
        "/api/v1/finance/liabilities",
        headers={**headers, "Idempotency-Key": f"finance-liability-{suffix}"},
        json=liability_payload,
    )
    assert create_liability.status_code == 201, create_liability.text
    liability = create_liability.json()
    liability_stats = client.get(
        "/api/v1/finance/liabilities/stats",
        headers=headers,
        params={"branchId": north_id},
    )
    assert liability_stats.status_code == 200
    assert Decimal(liability_stats.json()["totalDebt"]) >= Decimal("90000.00")
    liability_update = client.patch(
        f"/api/v1/finance/liabilities/{liability['id']}",
        headers=headers,
        json={
            "version": liability["version"],
            "pendingAmount": "80000.00",
            "paidInstallments": 4,
        },
    )
    assert liability_update.status_code == 200, liability_update.text
    liability = liability_update.json()
    assert Decimal(liability["pendingAmount"]) == Decimal("80000.00")

    account_payload = {
        "name": f"Cuenta operativa HTTP {suffix}",
        "type": "banco",
        "bank": "Banco de prueba",
        "accountNumber": "001-234567890",
        "balance": "14500.25",
        "currency": "DOP",
        "branchId": north_id,
        "notes": "Solo debe persistirse el número enmascarado.",
    }
    create_account = client.post(
        "/api/v1/finance/accounts",
        headers={**headers, "Idempotency-Key": f"finance-account-{suffix}"},
        json=account_payload,
    )
    assert create_account.status_code == 201, create_account.text
    account = create_account.json()
    assert account["accountNumber"] == "****7890"
    assert "234567890" not in create_account.text
    account_update = client.patch(
        f"/api/v1/finance/accounts/{account['id']}",
        headers=headers,
        json={"version": account["version"], "balance": "15000.50"},
    )
    assert account_update.status_code == 200, account_update.text
    account = account_update.json()
    account_stats = client.get(
        "/api/v1/finance/accounts/stats",
        headers=headers,
        params={"branchId": north_id},
    )
    assert account_stats.status_code == 200
    assert Decimal(account_stats.json()["bank"]) >= Decimal("15000.50")

    income_payload = {
        "category": "transferencia",
        "branchId": north_id,
        "amount": "8750.00",
        "date": current_date,
        "customer": f"Cliente HTTP {suffix}",
        "source": "Formulario",
        "status": "pagado",
    }
    create_income = client.post(
        "/api/v1/finance/manual-incomes",
        headers={**headers, "Idempotency-Key": f"finance-income-{suffix}"},
        json=income_payload,
    )
    assert create_income.status_code == 201, create_income.text
    income = create_income.json()
    assert income["editable"] is True
    income_projection = client.get(
        "/api/v1/finance/incomes",
        headers=headers,
        params={"search": suffix, "branchId": north_id, "dateFrom": current_date},
    )
    assert income_projection.status_code == 200, income_projection.text
    assert [item["id"] for item in income_projection.json()["items"]] == [income["id"]]
    income_update = client.patch(
        f"/api/v1/finance/incomes/{income['id']}",
        headers=headers,
        json={"version": income["version"], "status": "pendiente", "amount": "9000.00"},
    )
    assert income_update.status_code == 200, income_update.text
    income = income_update.json()
    stale_income = client.patch(
        f"/api/v1/finance/incomes/{income['id']}",
        headers=headers,
        json={"version": 1, "amount": "1.00"},
    )
    assert stale_income.status_code == 409

    overview_after = client.get(
        "/api/v1/finance/overview",
        headers=headers,
        params={"branchId": north_id, "period": period},
    )
    assert overview_after.status_code == 200, overview_after.text
    income_delta = Decimal(overview_after.json()["incomes"]) - Decimal(
        overview_before.json()["incomes"]
    )
    expense_delta = Decimal(overview_after.json()["expenses"]) - Decimal(
        overview_before.json()["expenses"]
    )
    assert income_delta == Decimal("9000.00")
    assert expense_delta == Decimal("4500.75")

    assert (
        client.delete(
            f"/api/v1/finance/incomes/{income['id']}",
            headers=headers,
            params={"version": income["version"]},
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/finance/accounts/{account['id']}",
            headers=headers,
            params={"version": account["version"]},
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/finance/liabilities/{liability['id']}",
            headers=headers,
            params={"version": liability["version"]},
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/finance/fixed-expenses/{fixed['id']}",
            headers=headers,
            params={"version": fixed["version"]},
        ).status_code
        == 204
    )
    assert (
        client.delete(
            f"/api/v1/finance/expenses/{expense['id']}",
            headers=headers,
            params={"version": expense["version"]},
        ).status_code
        == 204
    )
    budget_update = client.patch(
        f"/api/v1/finance/budgets/{budget['id']}",
        headers=headers,
        json={"version": budget["version"], "monthlyLimit": "17500.00"},
    )
    assert budget_update.status_code == 200, budget_update.text
    budget = budget_update.json()
    assert (
        client.delete(
            f"/api/v1/finance/budgets/{budget['id']}",
            headers=headers,
            params={"version": budget["version"]},
        ).status_code
        == 204
    )

    assert (
        client.get(f"/api/v1/finance/expenses/{expense['id']}", headers=headers).status_code == 404
    )
    assert (
        client.get(f"/api/v1/finance/manual-incomes/{income['id']}", headers=headers).status_code
        == 404
    )

    audit_count = database.scalar(
        select(func.count(AuditEntry.id)).where(
            AuditEntry.action.like("finance.%"),
            AuditEntry.target_id.in_(
                {
                    expense["id"],
                    fixed["id"],
                    liability["id"],
                    budget["id"],
                    account["id"],
                    income["id"],
                }
            ),
        )
    )
    assert audit_count is not None and audit_count >= 12


@pytest.mark.integration
def test_finance_pos_income_correction_and_exclusion_preserve_original_sale(
    finance_context: tuple[TestClient, Session],
) -> None:
    client, database = finance_context
    headers, _ = _login(client)
    supervisor_headers, _ = _login(client, "demo.luz.supervisor@example.com")
    projection = client.get(
        "/api/v1/finance/incomes",
        headers=headers,
        params={"pageSize": 200},
    )
    assert projection.status_code == 200, projection.text
    pos_income = next(item for item in projection.json()["items"] if item["origin"] == "pos")
    income_id = pos_income["id"]
    original_amount = Decimal(pos_income["amount"])
    corrected_amount = original_amount + Decimal("321.09")
    period = pos_income["date"][:7]
    branch_id = pos_income["branchId"]

    original_sale = client.get(f"/api/v1/pos/sales/{income_id}", headers=headers)
    assert original_sale.status_code == 200, original_sale.text
    original_sale_body = original_sale.json()
    overview_before = client.get(
        "/api/v1/finance/overview",
        headers=headers,
        params={"period": period, "branchId": branch_id},
    )
    assert overview_before.status_code == 200, overview_before.text

    forbidden = client.patch(
        f"/api/v1/finance/incomes/{income_id}",
        headers=supervisor_headers,
        json={"version": pos_income["version"], "amount": str(corrected_amount)},
    )
    assert forbidden.status_code == 403
    correction = client.patch(
        f"/api/v1/finance/incomes/{income_id}",
        headers=headers,
        json={
            "version": pos_income["version"],
            "amount": str(corrected_amount),
            "customer": "Cliente POS corregido",
            "category": pos_income["category"],
            "branchId": branch_id,
            "date": pos_income["date"],
            "source": "POS",
            "status": "pendiente",
        },
    )
    assert correction.status_code == 200, correction.text
    corrected = correction.json()
    assert corrected["origin"] == "pos"
    assert corrected["source"] == "POS"
    assert corrected["adjusted"] is True
    assert corrected["editable"] is True
    assert corrected["version"] == pos_income["version"] + 1
    assert Decimal(corrected["amount"]) == corrected_amount
    assert corrected["customer"] == "Cliente POS corregido"

    stale = client.patch(
        f"/api/v1/finance/incomes/{income_id}",
        headers=headers,
        json={"version": pos_income["version"], "amount": "1.00"},
    )
    assert stale.status_code == 409
    assert stale.json()["parameter"] == "version"
    invalid_source = client.patch(
        f"/api/v1/finance/incomes/{income_id}",
        headers=headers,
        json={"version": corrected["version"], "source": "Formulario"},
    )
    assert invalid_source.status_code == 400
    assert invalid_source.json()["parameter"] == "source"
    filtered = client.get(
        "/api/v1/finance/incomes",
        headers=headers,
        params={"search": "Cliente POS corregido"},
    )
    assert filtered.status_code == 200, filtered.text
    assert [item["id"] for item in filtered.json()["items"]] == [income_id]

    overview_corrected = client.get(
        "/api/v1/finance/overview",
        headers=headers,
        params={"period": period, "branchId": branch_id},
    )
    assert overview_corrected.status_code == 200, overview_corrected.text
    assert (
        Decimal(overview_corrected.json()["incomes"]) - Decimal(overview_before.json()["incomes"])
        == corrected_amount - original_amount
    )

    sale_after_correction = client.get(f"/api/v1/pos/sales/{income_id}", headers=headers)
    assert sale_after_correction.status_code == 200, sale_after_correction.text
    assert sale_after_correction.json()["total"] == original_sale_body["total"]
    assert sale_after_correction.json()["customer"] == original_sale_body["customer"]
    assert sale_after_correction.json()["status"] == "completed"

    exclusion = client.delete(
        f"/api/v1/finance/incomes/{income_id}",
        headers=headers,
        params={"version": corrected["version"]},
    )
    assert exclusion.status_code == 204, exclusion.text
    after_exclusion = client.get(
        "/api/v1/finance/incomes",
        headers=headers,
        params={"pageSize": 200},
    )
    assert after_exclusion.status_code == 200, after_exclusion.text
    assert income_id not in {item["id"] for item in after_exclusion.json()["items"]}
    overview_excluded = client.get(
        "/api/v1/finance/overview",
        headers=headers,
        params={"period": period, "branchId": branch_id},
    )
    assert overview_excluded.status_code == 200, overview_excluded.text
    assert (
        Decimal(overview_corrected.json()["incomes"]) - Decimal(overview_excluded.json()["incomes"])
        == corrected_amount
    )

    sale_after_exclusion = client.get(f"/api/v1/pos/sales/{income_id}", headers=headers)
    assert sale_after_exclusion.status_code == 200, sale_after_exclusion.text
    assert sale_after_exclusion.json()["total"] == original_sale_body["total"]
    assert sale_after_exclusion.json()["status"] == "completed"
    repeated_exclusion = client.delete(
        f"/api/v1/finance/incomes/{income_id}",
        headers=headers,
        params={"version": corrected["version"] + 1},
    )
    assert repeated_exclusion.status_code == 404

    audit_actions = set(
        database.scalars(
            select(AuditEntry.action).where(
                AuditEntry.target_id == income_id,
                AuditEntry.action.in_({"finance.pos_income.correct", "finance.pos_income.exclude"}),
            )
        )
    )
    assert audit_actions == {"finance.pos_income.correct", "finance.pos_income.exclude"}
