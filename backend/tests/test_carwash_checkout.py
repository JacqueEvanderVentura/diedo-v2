from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Event
from uuid import UUID, uuid7

import pytest
from app.db.models import (
    CarwashCommission,
    CarwashServiceConfig,
    CarwashWash,
    CashMovement,
    CashRegister,
    CustomerPayment,
    CustomerReceivable,
    EmployeeBranchAssignment,
    InventoryItemProfile,
    PaymentMethod,
    Sale,
)
from app.db.session import session_scope
from app.services.carwash_operations import CarwashOperationsService
from app.services.pos import PosService
from sqlalchemy import func, select

from tests.test_carwash_operations import action, register
from tests.test_carwash_operations import operation as operation_fixture
from tests.test_carwash_settings import BASE, scoped_user
from tests.test_carwash_settings import setup as settings_fixture

pytestmark = pytest.mark.integration


@pytest.fixture
def checkout_setup(client):
    for setup in settings_fixture.__wrapped__(client):
        setup = operation_fixture.__wrapped__(client, setup)
        response = client.post(
            "/api/v1/pos/registers",
            headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
            json={"branchId": setup["branchId"], "openingCash": "0.00"},
        )
        assert response.status_code == 201, response.text
        setup["registerId"] = response.json()["id"]
        with session_scope() as session:
            method = session.scalar(
                select(PaymentMethod).where(
                    PaymentMethod.workspace_id == setup["workspaceId"],
                    PaymentMethod.channel == "cash",
                    PaymentMethod.status == "active",
                )
            )
            setup["paymentMethodId"] = str(method.id)
        yield setup


def washing(client, setup, **changes):
    wash = register(client, setup, **changes).json()
    response = action(client, setup, wash, "start")
    assert response.status_code == 200, response.text
    return response.json()


def complete(client, setup, wash, key=None, **changes):
    return action(
        client,
        setup,
        wash,
        "complete",
        key,
        registerId=setup["registerId"],
        paymentMethodId=setup["paymentMethodId"],
        **changes,
    )


def commissions(setup, wash):
    with session_scope() as session:
        return list(
            session.scalars(
                select(CarwashCommission)
                .where(
                    CarwashCommission.workspace_id == setup["workspaceId"],
                    CarwashCommission.wash_id == UUID(wash["id"]),
                )
                .order_by(CarwashCommission.role)
            )
        )


def test_completion_snapshots_discounts_commissions_and_replay(client, checkout_setup):
    setup = checkout_setup
    wash = washing(client, setup)
    with session_scope() as session:
        profile = session.scalar(
            select(InventoryItemProfile).where(
                InventoryItemProfile.item_id == UUID(setup["services"][0]["itemId"])
            )
        )
        profile.sale_price = Decimal("9999")
        profile.tax_rate = Decimal("5")
        config = session.get(CarwashServiceConfig, UUID(setup["services"][0]["id"]))
        config.washer_rate = Decimal("60")
        config.enabled = False
    context = client.get(f"{BASE}/washes/{wash['id']}/checkout-context", headers=setup["headers"])
    assert context.status_code == 200, context.text
    assert context.json()["canDiscount"]
    key = str(uuid7())
    discount = {"discountType": "percent", "discountValue": "10.00"}
    preview = client.post(
        f"{BASE}/washes/{wash['id']}/preview",
        headers=setup["headers"],
        json={"version": wash["version"], **discount},
    )
    assert preview.status_code == 200, preview.text
    response = complete(client, setup, wash, key, **discount)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "completed"
    assert result["total"] == "708.30"
    assert result["finalTotal"] == preview.json()["total"] == "637.46"
    assert result["finalDiscountAmount"] == "60.03"
    assert complete(client, setup, wash, key, **discount).json() == result
    assert complete(client, setup, wash).status_code == 409
    assert complete(client, setup, wash, key).status_code == 409
    rows = commissions(setup, wash)
    assert len(rows) == 4
    assert {row.employee_id for row in rows} == {UUID(wash["washerId"])}
    assert sorted(row.amount for row in rows) == [
        Decimal("0"),
        Decimal("0"),
        Decimal("27.01"),
        Decimal("108.04"),
    ]
    assert all(row.status == "pending" for row in rows)
    billing = client.get(f"{BASE}/washes/{wash['id']}/billing", headers=setup["headers"]).json()
    assert billing["paidAmount"] == "637.46" and billing["pendingAmount"] == "0"
    with session_scope() as session:
        assert (
            session.scalar(
                select(func.count()).select_from(Sale).where(Sale.id == UUID(result["saleId"]))
            )
            == 1
        )
        assert session.scalar(
            select(CashMovement.amount).where(CashMovement.sale_id == UUID(result["saleId"]))
        ) == Decimal("637.46")
    assert action(client, setup, result, "cancel", reason="No es cancelación").status_code == 409


@pytest.mark.parametrize("from_pos", [False, True])
def test_atomic_void_from_both_entry_points(client, checkout_setup, from_pos):
    setup = checkout_setup
    wash = complete(client, setup, washing(client, setup)).json()
    key = str(uuid7())
    if from_pos:

        def request():
            return client.post(
                f"/api/v1/pos/sales/{wash['saleId']}/void",
                headers={**setup["headers"], "Idempotency-Key": key},
                json={"version": 1, "reason": "Anulación desde factura"},
            )
    else:

        def request():
            return action(client, setup, wash, "void", key, reason="Anulación desde lavado")

    response = request()
    assert response.status_code == 200, response.text
    assert request().status_code == 200
    current = client.get(f"{BASE}/washes/{wash['id']}", headers=setup["headers"]).json()
    assert current["status"] == "voided" and current["voidReason"]
    assert all(row.status == "voided" for row in commissions(setup, wash))
    with session_scope() as session:
        register_row = session.get(CashRegister, UUID(setup["registerId"]))
        assert register_row.cash_sales_amount == Decimal("0")
        assert session.get(Sale, UUID(wash["saleId"])).status == "voided"


def test_concurrent_completion_and_atomic_failure(client, checkout_setup, monkeypatch):
    setup = checkout_setup
    wash = washing(client, setup)
    original = CarwashOperationsService.audit

    def fail(self, principal, wash, verb, before):
        if verb == "complete":
            raise RuntimeError("Injected failure after sale and commission flush")
        return original(self, principal, wash, verb, before)

    monkeypatch.setattr(CarwashOperationsService, "audit", fail)
    assert complete(client, setup, wash).status_code == 500
    with session_scope() as session:
        assert session.get(CarwashWash, UUID(wash["id"])).status == "washing"
        assert (
            session.scalar(
                select(func.count())
                .select_from(Sale)
                .where(Sale.branch_id == UUID(setup["branchId"]))
            )
            == 0
        )
    assert commissions(setup, wash) == []
    monkeypatch.setattr(CarwashOperationsService, "audit", original)
    key = str(uuid7())
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: complete(client, setup, wash, key), range(2)))
    assert [row.status_code for row in results] == [200, 200], [row.text for row in results]
    assert results[0].json()["saleId"] == results[1].json()["saleId"]
    assert len(commissions(setup, wash)) == 4


def test_free_checkout_closed_register_and_permissions(client, checkout_setup):
    setup = checkout_setup
    wash = washing(client, setup, serviceIds=[setup["services"][1]["id"]])
    reader = {
        **setup,
        "headers": scoped_user(client, setup, ["carwash.read", "carwash.wash.complete"]),
    }
    assert complete(client, reader, wash).status_code == 403
    response = complete(client, setup, wash)
    assert response.status_code == 200, response.text
    assert response.json()["finalTotal"] == "0.00"
    with session_scope() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(CashMovement)
                .where(CashMovement.sale_id == UUID(response.json()["saleId"]))
            )
            == 0
        )
        version = session.get(CashRegister, UUID(setup["registerId"])).version
    closed = client.post(
        f"/api/v1/pos/registers/{setup['registerId']}/close",
        headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
        json={"countedCash": "0.00", "version": version},
    )
    assert closed.status_code == 200, closed.text
    assert complete(client, setup, washing(client, setup)).status_code == 409


def test_deferred_commission_accrual_and_settlement_guard(client, checkout_setup):
    setup = checkout_setup
    with session_scope() as session:
        method = PaymentMethod(
            workspace_id=setup["workspaceId"],
            code="cw" + uuid7().hex[:12],
            name="Carwash crédito",
            channel="other",
            settlement_policy="receivable",
            affects_cash_drawer=False,
            status="active",
        )
        session.add(method)
        session.flush()
        setup["paymentMethodId"] = str(method.id)
    wash = complete(client, setup, washing(client, setup)).json()
    assert wash["receivableId"]
    assert sum(row.amount for row in commissions(setup, wash)) == Decimal("150.06")
    with session_scope() as session:
        row = session.get(CarwashCommission, commissions(setup, wash)[0].id)
        row.status = "settled"
    assert (
        action(client, setup, wash, "void", reason="Intento con comisión liquidada").status_code
        == 409
    )
    with session_scope() as session:
        for row in session.scalars(
            select(CarwashCommission).where(CarwashCommission.wash_id == UUID(wash["id"]))
        ):
            row.status = "pending"
    result = action(client, setup, wash, "void", reason="Anular deuda pendiente")
    assert result.status_code == 200, result.text
    with session_scope() as session:
        assert session.get(CustomerReceivable, UUID(wash["receivableId"])).status == "cancelled"


def test_override_validation_and_scoped_authority(client, checkout_setup):
    setup = checkout_setup
    wash = washing(client, setup)
    limited = {
        **setup,
        "headers": scoped_user(
            client, setup, {"carwash.read", "carwash.wash.complete", "pos.sell"}
        ),
    }
    preview_url = f"{BASE}/washes/{wash['id']}/preview"
    assert (
        client.post(
            preview_url,
            headers=limited["headers"],
            json={"version": wash["version"], "discountType": "percent", "discountValue": "10"},
        ).status_code
        == 403
    )
    overrides = [{"washLineId": wash["lines"][0]["id"], "unitPrice": "0.05"}]
    assert complete(client, limited, wash, priceOverrides=overrides).status_code == 403
    assert (
        complete(
            client, setup, wash, priceOverrides=[{"washLineId": str(uuid7()), "unitPrice": "1"}]
        ).status_code
        == 400
    )
    assert complete(client, setup, wash, priceOverrides=overrides * 2).status_code == 400
    assert (
        complete(client, setup, wash, discountType="percent", discountValue="101").status_code
        == 400
    )
    assert complete(client, setup, wash, discountType="percent").status_code == 400
    stale = {**wash, "version": wash["version"] - 1}
    assert complete(client, setup, stale).status_code == 409
    other = {**setup, "branchId": setup["otherBranchId"]}
    foreign = {
        **setup,
        "headers": scoped_user(
            client, other, {"carwash.read", "carwash.wash.complete", "pos.sell"}
        ),
    }
    assert complete(client, foreign, wash).status_code in (403, 404)
    response = complete(client, setup, wash, priceOverrides=overrides)
    assert response.status_code == 200, response.text
    assert response.json()["finalTotal"] == "0.06"
    assert sum(row.amount for row in commissions(setup, wash)) == Decimal("0.01")
    # POS permission alone cannot bypass the Carwash void permission.
    pos_only = scoped_user(client, setup, {"sales.invoice.void"})
    assert (
        client.post(
            f"/api/v1/pos/sales/{response.json()['saleId']}/void",
            headers={**pos_only, "Idempotency-Key": str(uuid7())},
            json={"version": 1, "reason": "Sin permiso de Carwash"},
        ).status_code
        == 403
    )


def test_completion_revalidates_employee_and_payment_method(client, checkout_setup):
    setup = checkout_setup
    wash = washing(client, setup)
    with session_scope() as session:
        employee = session.scalar(
            select(EmployeeBranchAssignment).where(
                EmployeeBranchAssignment.branch_id == UUID(setup["branchId"])
            )
        )
        employee.status = "inactive"
    assert complete(client, setup, wash).status_code == 404
    with session_scope() as session:
        employee = session.scalar(
            select(EmployeeBranchAssignment).where(
                EmployeeBranchAssignment.branch_id == UUID(setup["branchId"])
            )
        )
        employee.status = "active"
        session.get(PaymentMethod, UUID(setup["paymentMethodId"])).status = "inactive"
    assert complete(client, setup, wash).status_code == 404
    with session_scope() as session:
        session.get(PaymentMethod, UUID(setup["paymentMethodId"])).status = "active"
    assert (
        client.get(f"{BASE}/washes/{wash['id']}/billing", headers=setup["headers"]).status_code
        == 404
    )
    assert (
        client.get(
            f"{BASE}/washes/{uuid7()}/checkout-context", headers=setup["headers"]
        ).status_code
        == 404
    )
    assert action(client, setup, wash, "void", reason="Aún no facturado").status_code == 409
    assert complete(client, setup, register(client, setup).json()).status_code == 409
    assert complete(client, setup, wash).status_code == 200


def test_completion_and_void_key_collisions_and_rollback(client, checkout_setup, monkeypatch):
    setup = checkout_setup
    first, second = washing(client, setup), washing(client, setup, plate="SECOND")
    key = str(uuid7())
    first = complete(client, setup, first, key).json()
    assert complete(client, setup, second, key).status_code == 409
    assert (
        client.get(f"{BASE}/washes/{second['id']}", headers=setup["headers"]).json()["status"]
        == "washing"
    )
    assert not commissions(setup, second)
    second = complete(client, setup, second).json()
    original = CarwashOperationsService.audit

    def fail(self, principal, wash, verb, before):
        if verb == "void":
            raise RuntimeError("Failure after voiding source")
        return original(self, principal, wash, verb, before)

    monkeypatch.setattr(CarwashOperationsService, "audit", fail)
    assert action(client, setup, first, "void", reason="Prueba rollback").status_code == 500
    assert all(row.status == "pending" for row in commissions(setup, first))
    with session_scope() as session:
        assert session.get(Sale, UUID(first["saleId"])).status == "completed"
    monkeypatch.setattr(CarwashOperationsService, "audit", original)
    assert (
        action(client, setup, {**first, "version": 1}, "void", reason="Versión antigua").status_code
        == 409
    )
    void_key = str(uuid7())
    assert (
        action(client, setup, first, "void", void_key, reason="Anular primero").status_code == 200
    )
    assert action(client, setup, first, "void", void_key, reason="Otro motivo").status_code == 409
    assert (
        action(client, setup, second, "void", void_key, reason="Anular segundo").status_code == 409
    )
    assert all(row.status == "pending" for row in commissions(setup, second))
    assert action(client, setup, second, "void", reason="   ").status_code == 400
    assert action(client, setup, second, "void", reason="Anular segundo").status_code == 200


def test_receivable_partial_paid_reversals_and_coordinated_void(client, checkout_setup):
    setup = checkout_setup
    cash_id = setup["paymentMethodId"]
    with session_scope() as session:
        method = PaymentMethod(
            workspace_id=setup["workspaceId"],
            code="cw" + uuid7().hex[:12],
            name="Crédito carwash",
            channel="credit",
            settlement_policy="receivable",
            affects_cash_drawer=False,
            status="active",
        )
        session.add(method)
        session.flush()
        setup["paymentMethodId"] = str(method.id)
    wash = complete(client, setup, washing(client, setup)).json()
    debt_id = wash["receivableId"]
    amounts = ["100.00", "608.30"]
    for index, amount in enumerate(amounts):
        payment = client.post(
            f"/api/v1/pos/receivables/{debt_id}/payments",
            headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
            data={
                "amount": amount,
                "methodId": cash_id,
                "registerId": setup["registerId"],
                "version": str(index + 1),
            },
        )
        assert payment.status_code == 201, payment.text
        billing = client.get(f"{BASE}/washes/{wash['id']}/billing", headers=setup["headers"]).json()
        assert billing["receivableStatus"] == ("partial" if index == 0 else "paid")
        assert action(client, setup, wash, "void", reason="No revertidos").status_code == 409
    with session_scope() as session:
        payments = list(
            session.scalars(
                select(CustomerPayment).where(CustomerPayment.receivable_id == UUID(debt_id))
            )
        )
    for payment in payments:
        result = client.post(
            f"/api/v1/pos/payments/{payment.id}/reverse",
            headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
            json={"version": payment.version, "reason": "Devolución antes de anular"},
        )
        assert result.status_code == 200, result.text
    assert (
        action(client, setup, wash, "void", reason="Todos los cobros revertidos").status_code == 200
    )
    billing = client.get(f"{BASE}/washes/{wash['id']}/billing", headers=setup["headers"]).json()
    assert Decimal(billing["paidAmount"]) == Decimal(billing["pendingAmount"]) == 0


def test_pos_and_carwash_checkout_share_register_lock_order(client, checkout_setup, monkeypatch):
    setup = checkout_setup
    wash = washing(client, setup)
    register_locked = Event()
    carwash_waiting = Event()
    checkout = PosService.checkout_in_transaction
    lock_register = PosService._locked_open_register

    def mark_source(self, **kwargs):
        self._ordinary_checkout_test = kwargs.get("snapshot") is None
        return checkout(self, **kwargs)

    def controlled_register(self, grant, register_id):
        if getattr(self, "_ordinary_checkout_test", False):
            result = lock_register(self, grant, register_id)
            register_locked.set()
            assert carwash_waiting.wait(10), "Carwash did not reach the register"
            return result
        carwash_waiting.set()
        return lock_register(self, grant, register_id)

    monkeypatch.setattr(PosService, "checkout_in_transaction", mark_source)
    monkeypatch.setattr(PosService, "_locked_open_register", controlled_register)
    with ThreadPoolExecutor(max_workers=2) as pool:
        ordinary = pool.submit(
            lambda: client.post(
                "/api/v1/pos/checkout",
                headers={**setup["headers"], "Idempotency-Key": str(uuid7())},
                json={
                    "branchId": setup["branchId"],
                    "registerId": setup["registerId"],
                    "customerId": wash["customerId"],
                    "paymentMethodId": setup["paymentMethodId"],
                    "lines": [{"itemId": setup["services"][0]["itemId"], "quantity": "1"}],
                },
            )
        )
        assert register_locked.wait(10)
        carwash = pool.submit(lambda: complete(client, setup, wash))
        first, second = ordinary.result(timeout=20), carwash.result(timeout=20)
    assert first.status_code == 201, first.text
    assert second.status_code == 200, second.text
    assert first.json()["id"] != second.json()["saleId"]
    assert len(commissions(setup, wash)) == 4
    with session_scope() as session:
        assert session.get(CashRegister, UUID(setup["registerId"])).cash_sales_amount == Decimal(
            "1416.60"
        )
