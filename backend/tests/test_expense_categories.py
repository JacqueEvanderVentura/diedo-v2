"""Finance expenses with catalog expense categories."""

from datetime import date
from uuid import uuid7

import pytest

from tests.test_finance import _login

pytest_plugins = ("tests.test_finance",)


@pytest.mark.integration
def test_expense_accepts_catalog_expense_category(finance_context) -> None:
    client, _session = finance_context
    headers, session_context = _login(client)
    north = next(
        branch for branch in session_context["visibleBranches"] if branch["code"] == "NORTH"
    )
    branch_id = str(north["id"])
    suffix = uuid7().hex[:8]
    current_date = date.today().isoformat()

    category = client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": f"Salario de Empleados {suffix}", "categoryKind": "expense"},
    )
    assert category.status_code == 201, category.text
    category_id = category.json()["id"]

    expense = client.post(
        "/api/v1/finance/expenses",
        headers={**headers, "Idempotency-Key": f"custom-cat-{suffix}"},
        json={
            "concept": f"Pago nómina {suffix}",
            "amount": "1.00",
            "categoryId": category_id,
            "date": current_date,
            "branchId": branch_id,
            "status": "pagado",
        },
    )
    assert expense.status_code == 201, expense.text
    body = expense.json()
    assert body["category"] == category_id
    assert body["categoryId"] == category_id
    assert body["status"] == "pagado"


@pytest.mark.integration
def test_expense_rejects_product_category_kind(finance_context) -> None:
    client, _session = finance_context
    headers, session_context = _login(client)
    north = next(
        branch for branch in session_context["visibleBranches"] if branch["code"] == "NORTH"
    )
    branch_id = str(north["id"])
    suffix = uuid7().hex[:8]
    current_date = date.today().isoformat()

    category = client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": f"Solo producto {suffix}", "categoryKind": "product"},
    )
    assert category.status_code == 201, category.text

    expense = client.post(
        "/api/v1/finance/expenses",
        headers={**headers, "Idempotency-Key": f"wrong-kind-{suffix}"},
        json={
            "concept": "Gasto inválido",
            "amount": "10.00",
            "categoryId": category.json()["id"],
            "date": current_date,
            "branchId": branch_id,
            "status": "pagado",
        },
    )
    assert expense.status_code == 400
    assert expense.json()["parameter"] == "categoryId"
