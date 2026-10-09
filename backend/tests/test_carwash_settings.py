from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from decimal import Decimal
from threading import Barrier
from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import (
    AccessScope,
    AuditEntry,
    Branch,
    CarwashServiceConfig,
    InventoryItemProfile,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    ModuleDefinition,
    ModuleEntitlement,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    UnitOfMeasure,
    WorkspaceMembership,
)
from app.db.session import session_scope
from app.services.carwash import CarwashService
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

pytestmark = pytest.mark.integration
PASSWORD = "carwash-settings-test-password"
BASE = "/api/v1/carwash"


def login(client: TestClient, email: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


@pytest.fixture
def setup(client: TestClient) -> Iterator[dict]:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(PASSWORD))
        definition = session.scalar(
            select(ModuleDefinition.id).where(ModuleDefinition.code == "carwash")
        )
        entitlement = session.scalar(
            select(ModuleEntitlement).where(
                ModuleEntitlement.workspace_id == summary.workspace_id,
                ModuleEntitlement.module_definition_id == definition,
            )
        )
        if entitlement is None:
            entitlement = ModuleEntitlement(
                workspace_id=summary.workspace_id,
                module_definition_id=definition,
                effective_from=datetime.now(UTC),
            )
            session.add(entitlement)
        entitlement.status = "enabled"
        branch = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=f"cw-{uuid7().hex[:24]}",
            name="Carwash testing branch",
            status="active",
            timezone="America/Santo_Domingo",
        )
        session.add(branch)
        session.flush()
        branch_id = str(branch.id)
    headers = login(client, "owner@erp.dev")
    options = client.get(f"{BASE}/form-options", params={"branchId": branch_id}, headers=headers)
    assert options.status_code == 200, options.text
    category = client.post(
        "/api/v1/catalog/categories", headers=headers, json={"name": f"Carwash {uuid7()}"}
    )
    assert category.status_code == 201, category.text
    try:
        yield {
            "headers": headers,
            "branchId": branch_id,
            "workspaceId": summary.workspace_id,
            "otherBranchId": str(summary.branch_id),
            "categoryId": category.json()["id"],
            "unitOfMeasureId": options.json()["units"][0]["id"],
        }
    finally:
        with session_scope() as session:
            entitlement = session.scalar(
                select(ModuleEntitlement).where(
                    ModuleEntitlement.workspace_id == summary.workspace_id,
                    ModuleEntitlement.module_definition_id == definition,
                )
            )
            if entitlement is not None:
                entitlement.status = "disabled"


def new_service(setup: dict, **changes: object) -> dict:
    return {
        "newService": {
            "name": f"Lavado {uuid7()}",
            "categoryId": setup["categoryId"],
            "unitOfMeasureId": setup["unitOfMeasureId"],
            "salePrice": "600.25",
            "taxRate": "18.00",
            **changes,
        }
    }


def create(client: TestClient, setup: dict, lines: list[dict], key: str | None = None):
    return client.post(
        f"{BASE}/services/batch",
        headers={**setup["headers"], "Idempotency-Key": key or str(uuid7())},
        json={"branchId": setup["branchId"], "services": lines},
    )


def scoped_user(client: TestClient, setup: dict, codes: set[str]) -> dict[str, str]:
    with session_scope() as session:
        now = datetime.now(UTC)
        unique = str(uuid7())
        email = f"carwash-{unique}@example.com"
        user = PlatformUser(
            external_subject=unique,
            email=email,
            normalized_email=email,
            display_name="Carwash manager",
            password_hash=hash_password(PASSWORD),
            password_changed_at=now,
            status="active",
        )
        session.add(user)
        session.flush()
        member = WorkspaceMembership(
            workspace_id=setup["workspaceId"],
            platform_user_id=user.id,
            status="active",
            activated_at=now,
            is_default=True,
        )
        role = Role(
            workspace_id=setup["workspaceId"], code=unique, name="Carwash test", status="active"
        )
        session.add_all([member, role])
        session.flush()
        for permission in session.scalars(select(Permission).where(Permission.code.in_(codes))):
            session.add(
                RolePermission(
                    workspace_id=setup["workspaceId"], role_id=role.id, permission_id=permission.id
                )
            )
        branch = session.get(Branch, UUID(setup["branchId"]))
        scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == setup["workspaceId"],
                AccessScope.branch_id == branch.id,
            )
        )
        if scope is None:
            scope = AccessScope(
                workspace_id=setup["workspaceId"],
                scope_type="branch",
                legal_entity_id=branch.legal_entity_id,
                branch_id=branch.id,
            )
            session.add(scope)
            session.flush()
        session.add(
            RoleAssignment(
                workspace_id=setup["workspaceId"],
                membership_id=member.id,
                role_id=role.id,
                access_scope_id=scope.id,
                status="active",
                valid_from=now,
            )
        )
    return login(client, email)


def test_batch_persists_canonical_services_idempotently_and_audits(client, setup):
    key = str(uuid7())
    lines = [new_service(setup), new_service(setup, salePrice="0.00", taxRate="0.00")]
    response = create(client, setup, lines, key)
    assert response.status_code == 201, response.text
    items = response.json()["items"]
    assert len(items) == 2
    assert items[0]["washerRate"] == "20.00"
    assert items[0]["supervisorRate"] == "5.00"
    assert items[1]["salePrice"] == "0.00"
    assert create(client, setup, lines, key).json() == response.json()
    assert create(client, setup, [new_service(setup)], key).status_code == 409
    with session_scope() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(CarwashServiceConfig)
                .where(CarwashServiceConfig.creation_key == key)
            )
            == 2
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEntry)
                .where(
                    AuditEntry.target_id.in_([UUID(item["id"]) for item in items]),
                    AuditEntry.action == "carwash.service.create",
                )
            )
            == 2
        )
        for item in items:
            profile = session.scalar(
                select(InventoryItemProfile).where(
                    InventoryItemProfile.item_id == UUID(item["itemId"])
                )
            )
            assert profile.sale_price == Decimal(item["salePrice"])
    assert (
        client.get(
            f"{BASE}/services",
            headers=setup["headers"],
            params={"branchId": setup["otherBranchId"], "search": lines[0]["newService"]["name"]},
        ).json()["totalItems"]
        == 0
    )


def test_edit_version_disable_filters_and_live_catalog_price(client, setup):
    item = create(client, setup, [new_service(setup)]).json()["items"][0]
    endpoint = f"{BASE}/services/{item['id']}"
    change = {
        "version": item["version"],
        "enabled": False,
        "washerRate": "75.25",
        "supervisorRate": "24.75",
    }
    updated = client.patch(endpoint, headers=setup["headers"], json=change)
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == item["version"] + 1
    assert client.patch(endpoint, headers=setup["headers"], json=change).status_code == 409
    result = client.get(
        f"{BASE}/services",
        headers=setup["headers"],
        params={
            "branchId": setup["branchId"],
            "enabled": False,
            "pageSize": 1,
            "search": item["name"],
        },
    ).json()
    assert result["totalItems"] == 1 and result["items"][0]["id"] == item["id"]
    changed_price = client.patch(
        f"/api/v1/inventory/items/{item['itemId']}",
        headers=setup["headers"],
        json={
            "version": item["catalogVersion"],
            "salePrice": "812.33",
            "taxRate": "10.50",
            "name": f"Renamed {uuid7()}",
        },
    )
    assert changed_price.status_code == 200, changed_price.text
    latest = client.get(endpoint, headers=setup["headers"]).json()
    assert latest["salePrice"] == "812.33" and latest["taxRate"] == "10.50"
    assert latest["washerRate"] == "75.25" and latest["name"].startswith("Renamed")
    assert latest["version"] == updated.json()["version"]
    assert (
        client.patch(
            endpoint,
            headers=setup["headers"],
            json={**change, "version": latest["version"], "enabled": True},
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "rates",
    [
        {"washerRate": "-1"},
        {"supervisorRate": "100.01"},
        {"washerRate": "95", "supervisorRate": "6"},
        {"washerRate": "20.001"},
    ],
)
def test_invalid_commissions_never_write(client, setup, rates):
    line = new_service(setup)
    assert create(client, setup, [{**line, **rates}]).status_code == 400
    with session_scope() as session:
        assert (
            session.scalar(select(Item.id).where(Item.name == line["newService"]["name"])) is None
        )


def test_batch_failure_rolls_back_catalog_and_configuration(client, setup):
    line = new_service(setup)
    response = create(client, setup, [line, {"itemId": str(uuid7())}])
    assert response.status_code == 404, response.text
    with session_scope() as session:
        assert (
            session.scalar(select(Item.id).where(Item.name == line["newService"]["name"])) is None
        )
    existing = create(client, setup, [new_service(setup)]).json()["items"][0]
    response = create(client, setup, [line, {"itemId": existing["itemId"]}])
    assert response.status_code == 409, response.text
    with session_scope() as session:
        assert (
            session.scalar(select(Item.id).where(Item.name == line["newService"]["name"])) is None
        )


def test_scoped_permissions_catalog_selection_and_source_availability(client, setup):
    commercial = new_service(setup)["newService"]
    response = client.post(
        "/api/v1/inventory/services",
        headers={
            **setup["headers"],
            "Idempotency-Key": str(uuid7()),
        },
        json={**commercial, "branchIds": [setup["branchId"], setup["otherBranchId"]]},
    )
    assert response.status_code == 201, response.text
    item = response.json()
    manager = scoped_user(client, setup, {"carwash.read", "carwash.settings.manage"})
    scoped = {**setup, "headers": manager}
    assert create(client, scoped, [new_service(setup)]).status_code == 403
    options = client.get(
        f"{BASE}/form-options", headers=manager, params={"branchId": setup["branchId"]}
    ).json()
    assert options["canCreateServices"] is False and options["employeeCount"] is None
    available = client.get(
        f"{BASE}/service-options",
        headers=manager,
        params={"branchId": setup["branchId"], "search": commercial["name"]},
    ).json()
    assert available["totalItems"] == 1
    assert available["items"][0]["itemId"] == item["id"]
    created = create(client, scoped, [{"itemId": item["id"]}])
    assert created.status_code == 201, created.text
    config = created.json()["items"][0]
    assert (
        create(
            client, {**scoped, "branchId": setup["otherBranchId"]}, [{"itemId": item["id"]}]
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"{BASE}/services", headers=manager, params={"branchId": setup["otherBranchId"]}
        ).status_code
        == 403
    )
    assert (
        client.get(
            f"{BASE}/service-options",
            headers=manager,
            params={"branchId": setup["branchId"], "search": commercial["name"]},
        ).json()["totalItems"]
        == 0
    )
    with session_scope() as session:
        assignment = session.scalar(
            select(ItemBranchAssignment).where(
                ItemBranchAssignment.item_id == UUID(item["id"]),
                ItemBranchAssignment.branch_id == UUID(setup["branchId"]),
            )
        )
        assignment.status = "inactive"
    endpoint = f"{BASE}/services/{config['id']}"
    latest = client.get(endpoint, headers=manager).json()
    assert latest["available"] is False
    change = {
        "version": config["version"],
        "enabled": True,
        "washerRate": "20",
        "supervisorRate": "5",
    }
    assert client.patch(endpoint, headers=manager, json=change).status_code == 400
    assert (
        client.patch(endpoint, headers=manager, json={**change, "enabled": False}).status_code
        == 200
    )
    reader = scoped_user(client, setup, {"carwash.read"})
    assert client.get(endpoint, headers=reader).status_code == 403
    assert client.get(endpoint).status_code == 401


def test_concurrent_retries_and_updates_commit_only_once(client, setup, monkeypatch):
    key = str(uuid7())
    lines = [new_service(setup), new_service(setup)]
    initial_reads = Barrier(2)
    original_replay = CarwashService._replay

    def replay_after_both_requests_read(service, principal, request_key, fingerprint):
        result = original_replay(service, principal, request_key, fingerprint)
        if result is None:
            initial_reads.wait(timeout=10)
        return result

    monkeypatch.setattr(CarwashService, "_replay", replay_after_both_requests_read)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(create, client, setup, lines, key) for _ in range(2)]
        responses = [future.result() for future in futures]
    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json() == responses[1].json()
    item = responses[0].json()["items"][0]
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(
                client.patch,
                f"{BASE}/services/{item['id']}",
                headers=setup["headers"],
                json={"version": 1, "enabled": True, "washerRate": rate, "supervisorRate": "5"},
            )
            for rate in ("25", "30")
        ]
        responses = [future.result() for future in futures]
    assert sorted(response.status_code for response in responses) == [200, 409]


def test_batch_rejects_ambiguous_sources_duplicates_and_missing_idempotency(client, setup):
    existing_id = str(uuid7())
    for lines in (
        [{}],
        [{**new_service(setup), "itemId": existing_id}],
        [{"itemId": existing_id}, {"itemId": existing_id}],
        [new_service(setup, name="  ")],
        [],
        [new_service(setup)] * 21,
    ):
        assert create(client, setup, lines).status_code == 400
    response = client.post(
        f"{BASE}/services/batch",
        headers=setup["headers"],
        json={"branchId": setup["branchId"], "services": [new_service(setup)]},
    )
    assert response.status_code == 400
    assert (
        client.get(
            f"{BASE}/services", headers=setup["headers"], params={"branchId": setup["branchId"]}
        ).json()["totalItems"]
        == 0
    )


@pytest.mark.parametrize("unavailable", ["item", "category", "unit", "price"])
def test_unavailable_catalog_sources_cannot_be_enabled(client, setup, unavailable):
    commercial = new_service(setup)["newService"]
    response = client.post(
        "/api/v1/inventory/services",
        headers={
            **setup["headers"],
            "Idempotency-Key": str(uuid7()),
        },
        json={**commercial, "branchIds": [setup["branchId"]]},
    )
    assert response.status_code == 201, response.text
    item_id = UUID(response.json()["id"])
    with session_scope() as session:
        if unavailable == "item":
            session.get(Item, item_id).status = "inactive"
        elif unavailable == "category":
            session.get(ItemCategory, UUID(setup["categoryId"])).status = "inactive"
        elif unavailable == "unit":
            session.get(UnitOfMeasure, UUID(setup["unitOfMeasureId"])).status = "inactive"
        else:
            session.scalar(
                select(InventoryItemProfile).where(InventoryItemProfile.item_id == item_id)
            ).sale_price = None
    try:
        available = client.get(
            f"{BASE}/service-options",
            headers=setup["headers"],
            params={"branchId": setup["branchId"], "search": commercial["name"]},
        )
        assert available.status_code == 200, available.text
        assert available.json()["totalItems"] == 0
        assert create(client, setup, [{"itemId": str(item_id)}]).status_code == 400
    finally:
        if unavailable == "unit":
            with session_scope() as session:
                session.get(UnitOfMeasure, UUID(setup["unitOfMeasureId"])).status = "active"


def test_database_rejects_invalid_rates_and_cross_workspace_assignment(client, setup):
    item = create(client, setup, [new_service(setup)]).json()["items"][0]
    with session_scope() as session:
        config = session.get(CarwashServiceConfig, UUID(item["id"]))
        config.washer_rate = Decimal("99")
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()
    with session_scope() as session:
        config = session.get(CarwashServiceConfig, UUID(item["id"]))
        config.workspace_id = uuid7()
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()
    assert client.get(f"{BASE}/services/{uuid7()}", headers=setup["headers"]).status_code == 404
    assert (
        client.get(
            f"{BASE}/services", headers=setup["headers"], params={"branchId": str(uuid7())}
        ).status_code
        == 404
    )
