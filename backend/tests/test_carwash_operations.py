from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from threading import Barrier
from uuid import UUID, uuid7

import pytest
from app.db.models import (
    AuditEntry,
    CarwashWash,
    CarwashWashLine,
    CashMovement,
    CustomerBranchAssignment,
    CustomerReceivable,
    EmployeeBranchAssignment,
    InventoryItemProfile,
    PaymentMethod,
    Sale,
)
from app.db.session import session_scope
from app.services.carwash_operations import CarwashOperationsService
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from tests.test_carwash_settings import BASE, create, new_service, scoped_user
from tests.test_carwash_settings import setup as settings_setup

pytestmark = pytest.mark.integration


def financial_counts(workspace_id):
    with session_scope() as session:
        return [
            session.scalar(
                select(func.count()).select_from(model).where(model.workspace_id == workspace_id)
            )
            for model in (Sale, CashMovement, CustomerReceivable)
        ]


def test_payment_is_only_planned_free_services_and_replaced_lines(client, operation):
    setup = operation
    with session_scope() as session:
        payment = PaymentMethod(
            workspace_id=setup["workspaceId"],
            code=str(uuid7()),
            name="Pago previsto Carwash",
            status="active",
            channel="cash",
            affects_cash_drawer=True,
        )
        session.add(payment)
        session.flush()
        payment_id = str(payment.id)
    before = financial_counts(setup["workspaceId"])
    wash = register(client, setup, paymentMethodId=payment_id).json()
    assert wash["paymentMethodName"] == "Pago previsto Carwash"
    updated = client.patch(
        f"{BASE}/washes/{wash['id']}",
        headers=setup["headers"],
        json=edit_payload(setup, wash, serviceIds=[setup["services"][1]["id"]]),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["total"] == "0.00"
    assert updated.json()["paymentMethodId"] is None
    added = create(client, setup, [new_service(setup, salePrice="0.05", taxRate="10.00")]).json()[
        "items"
    ][0]
    updated = client.patch(
        f"{BASE}/washes/{wash['id']}",
        headers=setup["headers"],
        json=edit_payload(setup, updated.json(), serviceIds=[added["id"]]),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["total"] == "0.06"
    assert len(updated.json()["lines"]) == 1
    assert updated.json()["lines"][0]["configVersion"] == 1
    assert action(client, setup, updated.json(), "cancel", reason="    ").status_code == 400
    assert action(client, setup, updated.json(), "cancel", reason="Sin cobro").status_code == 200
    assert financial_counts(setup["workspaceId"]) == before
    with session_scope() as session:
        session.get(PaymentMethod, UUID(payment_id)).status = "inactive"
    assert register(client, setup, paymentMethodId=payment_id).status_code == 404


@pytest.mark.parametrize("role", ["customer", "employee"])
def test_inactive_branch_assignments_block_reception_and_start(client, operation, role):
    setup = operation
    wash = register(client, setup).json()
    model = CustomerBranchAssignment if role == "customer" else EmployeeBranchAssignment
    with session_scope() as session:
        assignment = session.scalar(select(model).where(model.branch_id == UUID(setup["branchId"])))
        assignment.status = "inactive"
    assert register(client, setup).status_code == 404
    assert action(client, setup, wash, "start").status_code == 404
    assert (
        action(client, setup, wash, "cancel", reason="Responsable no disponible").status_code == 200
    )


def test_action_key_collision_concurrent_edits_and_database_scope(client, operation):
    setup = operation
    first = register(client, setup).json()
    second = register(client, setup, plate="SECOND").json()
    key = str(uuid7())
    assert action(client, setup, first, "start", key).status_code == 200
    assert action(client, setup, second, "start", key).status_code == 409
    assert (
        client.get(f"{BASE}/washes/{second['id']}", headers=setup["headers"]).json()["status"]
        == "waiting"
    )
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                lambda plate: client.patch(
                    f"{BASE}/washes/{second['id']}",
                    headers=setup["headers"],
                    json=edit_payload(setup, second, plate=plate),
                ),
                ["ONE", "TWO"],
            )
        )
    assert sorted(result.status_code for result in results) == [200, 409]
    for model, identifier in [
        (CarwashWash, second["id"]),
        (CarwashWashLine, second["lines"][0]["id"]),
    ]:
        with session_scope() as session:
            record = session.get(model, UUID(identifier))
            record.workspace_id = uuid7()
            with pytest.raises(IntegrityError):
                session.flush()
            session.rollback()
    assert client.get(f"{BASE}/washes/{first['id']}").status_code == 401
    assert (
        client.post(f"{BASE}/washes", headers=setup["headers"], json=setup["payload"]).status_code
        == 400
    )


@pytest.fixture
def operation(client, carwash_setup):
    setup = carwash_setup
    customer = client.post(
        "/api/v1/customers",
        headers=setup["headers"],
        json={
            "displayName": "Cliente operativo",
            "documentType": "cedula",
            "documentId": "001-1234567-8",
            "branchIds": [setup["branchId"]],
        },
    )
    assert customer.status_code == 201, customer.text
    employee = client.post(
        "/api/v1/employees",
        headers=setup["headers"],
        json={
            "employeeNumber": f"CW-{uuid7().hex[-20:]}",
            "firstName": "Ana",
            "lastName": "Lavado",
            "position": "Lavador",
            "hireDate": "2026-01-01",
            "branchIds": [setup["branchId"]],
        },
    )
    assert employee.status_code == 201, employee.text
    services = create(client, setup, [new_service(setup), new_service(setup, salePrice="0.00")])
    assert services.status_code == 201, services.text
    setup["services"] = services.json()["items"]
    setup["payload"] = {
        "branchId": setup["branchId"],
        "customerId": customer.json()["id"],
        "plate": "  abc 123  ",
        "vehicleModel": "Toyota Corolla",
        "vehicleColor": "Azul",
        "washerId": employee.json()["id"],
        "supervisorId": employee.json()["id"],
        "serviceIds": [item["id"] for item in setup["services"]],
        "paymentMethodId": None,
    }
    return setup


@pytest.fixture
def carwash_setup(client):
    yield from settings_setup.__wrapped__(client)


def register(client, setup, key=None, **changes):
    return client.post(
        f"{BASE}/washes",
        json={**setup["payload"], **changes},
        headers={**setup["headers"], "Idempotency-Key": key or str(uuid7())},
    )


def action(client, setup, wash, verb, key=None, **changes):
    return client.post(
        f"{BASE}/washes/{wash['id']}/{verb}",
        json={"version": wash["version"], **changes},
        headers={**setup["headers"], "Idempotency-Key": key or str(uuid7())},
    )


def edit_payload(setup, wash, **changes):
    return {
        key: value
        for key, value in {**setup["payload"], "version": wash["version"], **changes}.items()
        if key != "branchId"
    }


def test_reception_lifecycle_snapshots_and_audit(client, operation):
    setup = operation
    response = register(client, setup)
    assert response.status_code == 201, response.text
    wash = response.json()
    assert wash["plate"] == "ABC 123"
    assert wash["status"] == "waiting"
    assert wash["total"] == "708.30"
    assert wash["lines"][1]["total"] == "0.00"
    assert wash["washerId"] == wash["supervisorId"]
    with session_scope() as session:
        profile = session.scalar(
            select(InventoryItemProfile).where(
                InventoryItemProfile.item_id == UUID(setup["services"][0]["itemId"])
            )
        )
        profile.sale_price = Decimal("999.99")
    config = setup["services"][0]
    updated = client.patch(
        f"{BASE}/services/{config['id']}",
        headers=setup["headers"],
        json={
            "version": config["version"],
            "washerRate": "30",
            "supervisorRate": "10",
            "enabled": False,
        },
    )
    assert updated.status_code == 200, updated.text
    edited = client.patch(
        f"{BASE}/washes/{wash['id']}",
        headers=setup["headers"],
        json=edit_payload(setup, wash, plate="ABC-456"),
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["lines"] == wash["lines"]
    assert edited.json()["total"] == wash["total"]
    assert (
        client.patch(
            f"{BASE}/washes/{wash['id']}", headers=setup["headers"], json=edit_payload(setup, wash)
        ).status_code
        == 409
    )
    started = action(client, setup, edited.json(), "start")
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "washing"
    cancelled = action(client, setup, started.json(), "cancel", reason="Cliente se retiró")
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["cancelReason"] == "Cliente se retiró"
    assert action(client, setup, cancelled.json(), "start").status_code == 409
    assert (
        client.patch(
            f"{BASE}/washes/{wash['id']}",
            headers=setup["headers"],
            json=edit_payload(setup, cancelled.json()),
        ).status_code
        == 409
    )
    with session_scope() as session:
        entries = list(
            session.scalars(select(AuditEntry).where(AuditEntry.target_id == UUID(wash["id"])))
        )
        assert {entry.action for entry in entries} == {
            "carwash.wash.create",
            "carwash.wash.update",
            "carwash.wash.start",
            "carwash.wash.cancel",
        }
        assert (
            next(entry for entry in entries if entry.action.endswith("update")).details["before"][
                "plate"
            ]
            == "ABC 123"
        )


def test_idempotency_and_concurrent_creation(client, operation, monkeypatch):
    setup = operation
    key = str(uuid7())
    first_reads = Barrier(2)
    original_replay = CarwashOperationsService.replay

    def concurrent_replay(service, principal, request_key, signature):
        result = original_replay(service, principal, request_key, signature)
        if result is None and request_key == key:
            first_reads.wait(timeout=10)
        return result

    monkeypatch.setattr(CarwashOperationsService, "replay", concurrent_replay)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: register(client, setup, key), range(2)))
    assert [r.status_code for r in results] == [201, 201], [r.text for r in results]
    wash = results[0].json()
    assert results[1].json()["id"] == wash["id"]
    assert register(client, setup, key, plate="OTHER").status_code == 409
    start_key = str(uuid7())
    started = action(client, setup, wash, "start", start_key)
    assert started.status_code == 200, started.text
    assert action(client, setup, wash, "start", start_key).json() == started.json()
    assert action(client, setup, started.json(), "start", start_key).status_code == 409
    assert action(client, setup, started.json(), "start").status_code == 409
    cancel_key = str(uuid7())
    cancelled = action(
        client, setup, started.json(), "cancel", cancel_key, reason="Cancelado a petición"
    )
    assert cancelled.status_code == 200
    assert (
        action(
            client, setup, started.json(), "cancel", cancel_key, reason="Cancelado a petición"
        ).json()
        == cancelled.json()
    )
    assert (
        action(
            client, setup, started.json(), "cancel", cancel_key, reason="Otro motivo"
        ).status_code
        == 409
    )


def test_queries_permissions_and_branch_isolation(client, operation):
    setup = operation
    wash = register(client, setup).json()
    reader = scoped_user(client, setup, {"carwash.read"})
    manager = scoped_user(client, setup, {"carwash.read", "carwash.wash.manage"})
    query = {"branchId": setup["branchId"]}
    context = client.get(f"{BASE}/operation-context", params=query, headers=manager)
    assert context.status_code == 200, context.text
    assert context.json()["canManage"] is True
    assert context.json()["canCreateCustomer"] is False
    for kind in ["services", "customers", "employees", "paymentMethods"]:
        result = client.get(f"{BASE}/wash-options", params={**query, "kind": kind}, headers=manager)
        assert result.status_code == 200, result.text
        assert len(result.json()["items"]) >= (0 if kind == "paymentMethods" else 1)
    for search in ["abc", "Cliente operativo", setup["services"][0]["name"]]:
        result = client.get(
            f"{BASE}/washes",
            params={**query, "search": search, "employeeId": wash["washerId"], "pageSize": 1},
            headers=reader,
        )
        assert result.status_code == 200, result.text
        assert result.json()["totalItems"] == 1
    assert (
        client.get(f"{BASE}/washes", params={**query, "search": "%"}, headers=reader).json()[
            "totalItems"
        ]
        == 0
    )
    assert client.get(f"{BASE}/washes/{wash['id']}", headers=reader).status_code == 200
    assert client.get(f"{BASE}/washes/{uuid7()}", headers=reader).status_code == 404
    assert register(client, {**setup, "headers": reader}).status_code == 403
    assert (
        client.get(
            f"{BASE}/wash-options", params={**query, "kind": "customers"}, headers=reader
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"{BASE}/washes", params={"branchId": setup["otherBranchId"]}, headers=reader
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"{BASE}/washes", params={"branchId": setup["otherBranchId"]}, headers=setup["headers"]
        ).json()["totalItems"]
        == 0
    )
    assert register(client, setup, branchId=setup["otherBranchId"]).status_code == 404


@pytest.mark.parametrize(
    "changes,code",
    [
        ({"customerId": str(uuid7())}, 404),
        ({"washerId": str(uuid7())}, 404),
        ({"supervisorId": str(uuid7())}, 404),
        ({"paymentMethodId": str(uuid7())}, 404),
        ({"serviceIds": [str(uuid7())]}, 404),
        ({"serviceIds": []}, 400),
        ({"plate": "   "}, 400),
        ({"status": "completed"}, 400),
        ({"total": "1.00"}, 400),
    ],
)
def test_invalid_reception_never_persists(client, operation, changes, code):
    response = register(client, operation, **changes)
    assert response.status_code == code, response.text
    assert (
        client.get(
            f"{BASE}/washes",
            params={"branchId": operation["branchId"]},
            headers=operation["headers"],
        ).json()["totalItems"]
        == 0
    )


def test_disabled_services_and_atomic_failure(client, operation, monkeypatch):
    setup = operation
    config = setup["services"][0]
    disabled = client.patch(
        f"{BASE}/services/{config['id']}",
        headers=setup["headers"],
        json={"version": 1, "enabled": False, "washerRate": "20", "supervisorRate": "5"},
    )
    assert disabled.status_code == 200, disabled.text
    assert register(client, setup).status_code == 400
    assert register(client, setup, serviceIds=[setup["services"][1]["id"]] * 2).status_code == 400
    assert register(client, setup, plate="ß" * 32).status_code == 400

    def fail(*args, **kwargs):
        raise RuntimeError("Simulated audit failure")

    monkeypatch.setattr(CarwashOperationsService, "audit", fail)
    response = register(client, setup, serviceIds=[setup["services"][1]["id"]])
    assert response.status_code == 500

    def fail_integrity(*args, **kwargs):
        raise IntegrityError("INSERT audit", {}, RuntimeError("Simulated constraint conflict"))

    monkeypatch.setattr(CarwashOperationsService, "audit", fail_integrity)
    response = register(client, setup, serviceIds=[setup["services"][1]["id"]])
    assert response.status_code == 409
    with session_scope() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(CarwashWash)
                .where(CarwashWash.branch_id == UUID(setup["branchId"]))
            )
            == 0
        )
