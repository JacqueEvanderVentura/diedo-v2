from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from threading import Barrier
from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.session import get_session_factory, session_scope
from app.schemas.inventory import (
    CreateAdjustmentMovementRequest,
    CreateOutboundMovementRequest,
    UpdateInventoryItemRequest,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import ConflictError
from app.services.inventory import InventoryService
from app.services.local_bootstrap import BootstrapSummary, bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import ValidationError

_OWNER_EMAIL = "owner@erp.dev"
_OWNER_PASSWORD = "inventory-owner-password-not-a-secret"


def _bootstrap_and_login(
    client: TestClient,
) -> tuple[dict[str, str], dict[str, object], BootstrapSummary]:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(_OWNER_PASSWORD))
    login = client.post(
        "/api/v1/auth/login",
        json={"email": _OWNER_EMAIL, "password": _OWNER_PASSWORD},
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    assert "inventory" in me.json()["enabledModules"]
    return headers, me.json(), summary


def _create_category(client: TestClient, headers: dict[str, str], suffix: str) -> dict[str, object]:
    response = client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": f"Inventario {suffix}"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _unit_id(client: TestClient, headers: dict[str, str]) -> str:
    response = client.get("/api/v1/catalog/units-of-measure", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()[0]["id"]


def _create_employee(
    client: TestClient, headers: dict[str, str], branch_id: str, suffix: str
) -> dict[str, object]:
    response = client.post(
        "/api/v1/employees",
        headers=headers,
        json={
            "employeeNumber": f"INV-{suffix}",
            "firstName": "Responsable",
            "lastName": suffix,
            "position": "Inventario",
            "hireDate": date.today().isoformat(),
            "branchIds": [branch_id],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_inventory_schemas_reject_ambiguous_or_unsafe_mutations() -> None:
    item_id = uuid7()
    with pytest.raises(ValidationError, match="branchId"):
        UpdateInventoryItemRequest(version=1, minimumStock="2")
    with pytest.raises(ValidationError, match="No repitas"):
        CreateOutboundMovementRequest(
            branchId=uuid7(),
            employeeId=uuid7(),
            items=[
                {"itemId": item_id, "quantity": "1"},
                {"itemId": item_id, "quantity": "2"},
            ],
        )
    with pytest.raises(ValidationError, match="No repitas"):
        CreateAdjustmentMovementRequest(
            branchId=uuid7(),
            comment="Conteo físico",
            items=[
                {"itemId": item_id, "quantity": "1"},
                {"itemId": item_id, "quantity": "2"},
            ],
        )


@pytest.mark.integration
def test_inventory_complete_http_contract_and_idempotent_ledger(client: TestClient) -> None:
    headers, session_context, _summary = _bootstrap_and_login(client)
    branch_id = str(session_context["visibleBranches"][0]["id"])
    suffix = uuid7().hex[-10:]
    category = _create_category(client, headers, suffix)
    unit_id = _unit_id(client, headers)

    unauthorized = client.get("/api/v1/inventory/summary")
    assert unauthorized.status_code == 401

    warehouses = client.get(
        "/api/v1/inventory/warehouses",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert warehouses.status_code == 200, warehouses.text
    assert len(warehouses.json()) == 1
    assert warehouses.json()[0]["isDefault"] is True

    product_payload = {
        "name": f"Producto {suffix}",
        "sku": f"PRD-{suffix}",
        "categoryId": category["id"],
        "unitOfMeasureId": unit_id,
        "branchId": branch_id,
        "salePrice": "150.00",
        "unitCost": "70.00",
        "taxRate": "18.00",
        "stock": "5",
        "minimumStock": "2",
    }
    product_headers = {**headers, "Idempotency-Key": f"inventory-product-{suffix}"}
    product_response = client.post(
        "/api/v1/inventory/products",
        headers=product_headers,
        json=product_payload,
    )
    assert product_response.status_code == 201, product_response.text
    product = product_response.json()
    assert product["itemType"] == "product"
    assert Decimal(product["stockQuantity"]) == Decimal("5")

    repeated_product = client.post(
        "/api/v1/inventory/products",
        headers=product_headers,
        json=product_payload,
    )
    assert repeated_product.status_code == 201, repeated_product.text
    assert repeated_product.json()["id"] == product["id"]
    reused_product_key = client.post(
        "/api/v1/inventory/products",
        headers=product_headers,
        json={**product_payload, "name": f"Otro {suffix}"},
    )
    assert reused_product_key.status_code == 409
    assert reused_product_key.json()["parameter"] == "Idempotency-Key"

    supply_payload = {
        "name": f"Insumo {suffix}",
        "sku": f"INS-{suffix}",
        "categoryId": category["id"],
        "unitOfMeasureId": unit_id,
        "branchId": branch_id,
        "unitCost": "25.00",
        "stock": "4",
        "minimumStock": "3",
    }
    supply_response = client.post(
        "/api/v1/inventory/supplies",
        headers={**headers, "Idempotency-Key": f"inventory-supply-{suffix}"},
        json=supply_payload,
    )
    assert supply_response.status_code == 201, supply_response.text
    supply = supply_response.json()
    assert supply["itemType"] == "supply"

    service_response = client.post(
        "/api/v1/inventory/services",
        headers={**headers, "Idempotency-Key": f"inventory-service-{suffix}"},
        json={
            "name": f"Servicio {suffix}",
            "sku": f"SRV-{suffix}",
            "categoryId": category["id"],
            "unitOfMeasureId": unit_id,
            "branchId": branch_id,
            "salePrice": "900.00",
            "taxRate": "18.00",
        },
    )
    assert service_response.status_code == 201, service_response.text
    service = service_response.json()
    assert service["stockStatus"] == "not_tracked"

    inventory_list = client.get(
        "/api/v1/inventory/items",
        headers=headers,
        params={"branchId": branch_id, "search": suffix, "pageSize": 10},
    )
    assert inventory_list.status_code == 200, inventory_list.text
    assert {item["itemType"] for item in inventory_list.json()["items"]} == {
        "product",
        "service",
        "supply",
    }

    updated_product_response = client.patch(
        f"/api/v1/inventory/items/{product['id']}",
        headers=headers,
        json={
            "version": product["version"],
            "name": f"Producto actualizado {suffix}",
            "description": "Ficha actualizada",
            "sku": f"UPD-{suffix}",
            "categoryId": category["id"],
            "unitOfMeasureId": unit_id,
            "salePrice": "175.00",
            "unitCost": "75.00",
            "taxRate": "16.00",
            "branchId": branch_id,
            "minimumStock": "3",
            "status": "active",
        },
    )
    assert updated_product_response.status_code == 200, updated_product_response.text
    updated_product = updated_product_response.json()
    assert updated_product["version"] == product["version"] + 1
    assert updated_product["sku"] == f"UPD-{suffix}".upper()
    assert Decimal(updated_product["minimumStock"]) == Decimal("3")

    stale_product = client.patch(
        f"/api/v1/inventory/items/{product['id']}",
        headers=headers,
        json={"version": product["version"], "name": "Cambio obsoleto"},
    )
    assert stale_product.status_code == 409
    assert stale_product.json()["parameter"] == "version"

    invalid_service_update = client.patch(
        f"/api/v1/inventory/items/{service['id']}",
        headers=headers,
        json={"version": service["version"], "unitCost": "10.00"},
    )
    assert invalid_service_update.status_code == 400

    duplicate_sku = client.patch(
        f"/api/v1/inventory/items/{supply['id']}",
        headers=headers,
        json={"version": supply["version"], "sku": updated_product["sku"]},
    )
    assert duplicate_sku.status_code == 409
    assert duplicate_sku.json()["parameter"] == "sku"

    invalid_category = client.patch(
        f"/api/v1/inventory/items/{product['id']}",
        headers=headers,
        json={"version": updated_product["version"], "categoryId": str(uuid7())},
    )
    assert invalid_category.status_code == 404
    assert invalid_category.json()["parameter"] == "categoryId"

    invalid_unit = client.patch(
        f"/api/v1/inventory/items/{product['id']}",
        headers=headers,
        json={"version": updated_product["version"], "unitOfMeasureId": str(uuid7())},
    )
    assert invalid_unit.status_code == 404
    assert invalid_unit.json()["parameter"] == "unitOfMeasureId"

    unassigned_branch = client.patch(
        f"/api/v1/inventory/items/{product['id']}",
        headers=headers,
        json={
            "version": updated_product["version"],
            "branchId": str(uuid7()),
            "minimumStock": "4",
        },
    )
    assert unassigned_branch.status_code == 404
    assert unassigned_branch.json()["parameter"] == "branchId"

    invalid_warehouse = client.patch(
        f"/api/v1/inventory/items/{product['id']}",
        headers=headers,
        json={
            "version": updated_product["version"],
            "branchId": branch_id,
            "warehouseId": str(uuid7()),
            "minimumStock": "4",
        },
    )
    assert invalid_warehouse.status_code == 404
    assert invalid_warehouse.json()["parameter"] == "warehouseId"

    invalid_supply_update = client.patch(
        f"/api/v1/inventory/items/{supply['id']}",
        headers=headers,
        json={"version": supply["version"], "salePrice": "20.00"},
    )
    assert invalid_supply_update.status_code == 400

    missing_item = client.patch(
        f"/api/v1/inventory/items/{uuid7()}",
        headers=headers,
        json={"version": 1, "name": "No existe"},
    )
    assert missing_item.status_code == 404
    assert missing_item.json()["parameter"] == "itemId"
    missing_item_detail = client.get(
        f"/api/v1/inventory/items/{uuid7()}",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert missing_item_detail.status_code == 404
    assert missing_item_detail.json()["parameter"] == "itemId"

    inventory_summary = client.get(
        "/api/v1/inventory/summary",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert inventory_summary.status_code == 200, inventory_summary.text
    assert inventory_summary.headers["cache-control"] == "no-store"
    assert inventory_summary.json()["totalProducts"] >= 1
    assert inventory_summary.json()["totalSupplies"] >= 1
    assert Decimal(inventory_summary.json()["totalValue"]) >= Decimal("450")

    categories = client.get("/api/v1/inventory/asset-categories", headers=headers)
    assert categories.status_code == 200, categories.text
    asset_category = next(row for row in categories.json() if row["code"] == "equipos")
    duplicate_asset_category = client.post(
        "/api/v1/inventory/asset-categories",
        headers=headers,
        json={"code": "equipos", "name": f"Equipos duplicados {suffix}"},
    )
    assert duplicate_asset_category.status_code == 409
    asset_payload = {
        "name": f"Equipo {suffix}",
        "code": f"EQP-{suffix}",
        "categoryId": asset_category["id"],
        "branchId": branch_id,
        "acquisitionValue": "42000.00",
        "status": "reparacion",
        "location": "Sala 2",
        "purchaseDate": date.today().isoformat(),
        "notes": "Revisión preventiva",
    }
    asset_headers = {**headers, "Idempotency-Key": f"inventory-asset-{suffix}"}
    asset_response = client.post(
        "/api/v1/inventory/assets",
        headers=asset_headers,
        json=asset_payload,
    )
    assert asset_response.status_code == 201, asset_response.text
    asset = asset_response.json()
    assert asset["category"]["code"] == "equipos"

    repeated_asset = client.post(
        "/api/v1/inventory/assets",
        headers=asset_headers,
        json=asset_payload,
    )
    assert repeated_asset.status_code == 201, repeated_asset.text
    assert repeated_asset.json()["id"] == asset["id"]
    listed_assets = client.get(
        "/api/v1/inventory/assets",
        headers=headers,
        params={
            "branchId": branch_id,
            "search": suffix,
            "categoryId": asset_category["id"],
            "status": "reparacion",
            "page": 1,
            "pageSize": 10,
            "sortBy": "value",
            "sortDirection": "desc",
        },
    )
    assert listed_assets.status_code == 200, listed_assets.text
    assert listed_assets.headers["cache-control"] == "no-store"
    assert listed_assets.json()["totalItems"] == 1
    assert listed_assets.json()["items"][0]["id"] == asset["id"]
    fetched_asset = client.get(
        f"/api/v1/inventory/assets/{asset['id']}",
        headers=headers,
    )
    assert fetched_asset.status_code == 200, fetched_asset.text
    assert fetched_asset.json()["branch"]["id"] == branch_id
    assert Decimal(fetched_asset.json()["acquisitionValue"]) == Decimal("42000")
    asset_summary = client.get(
        "/api/v1/inventory/assets/summary",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert asset_summary.status_code == 200, asset_summary.text
    assert asset_summary.json()["inRepair"] >= 1
    assert Decimal(asset_summary.json()["totalValue"]) >= Decimal("42000")

    updated_asset = client.patch(
        f"/api/v1/inventory/assets/{asset['id']}",
        headers=headers,
        json={"version": asset["version"], "status": "activo"},
    )
    assert updated_asset.status_code == 200, updated_asset.text
    stale_asset = client.patch(
        f"/api/v1/inventory/assets/{asset['id']}",
        headers=headers,
        json={"version": asset["version"], "status": "baja"},
    )
    assert stale_asset.status_code == 409
    assert stale_asset.json()["parameter"] == "version"

    invalid_asset_branch = client.patch(
        f"/api/v1/inventory/assets/{asset['id']}",
        headers=headers,
        json={"version": updated_asset.json()["version"], "branchId": str(uuid7())},
    )
    assert invalid_asset_branch.status_code == 404
    assert invalid_asset_branch.json()["parameter"] == "branchId"

    invalid_asset_category = client.patch(
        f"/api/v1/inventory/assets/{asset['id']}",
        headers=headers,
        json={"version": updated_asset.json()["version"], "categoryId": str(uuid7())},
    )
    assert invalid_asset_category.status_code == 404
    assert invalid_asset_category.json()["parameter"] == "categoryId"

    missing_asset = client.patch(
        f"/api/v1/inventory/assets/{uuid7()}",
        headers=headers,
        json={"version": 1, "status": "activo"},
    )
    assert missing_asset.status_code == 404
    assert missing_asset.json()["parameter"] == "assetId"

    employee = _create_employee(client, headers, branch_id, suffix)
    outbound_payload = {
        "branchId": branch_id,
        "employeeId": employee["id"],
        "comment": "Uso en sesión",
        "items": [{"itemId": supply["id"], "quantity": "2"}],
    }
    outbound_headers = {**headers, "Idempotency-Key": f"inventory-outbound-{suffix}"}
    outbound_response = client.post(
        "/api/v1/inventory/movements/outbound",
        headers=outbound_headers,
        json=outbound_payload,
    )
    assert outbound_response.status_code == 201, outbound_response.text
    outbound = outbound_response.json()
    assert outbound["movementType"] == "outbound"
    assert Decimal(outbound["items"][0]["quantityAfter"]) == Decimal("2")

    repeated_outbound = client.post(
        "/api/v1/inventory/movements/outbound",
        headers=outbound_headers,
        json=outbound_payload,
    )
    assert repeated_outbound.status_code == 201, repeated_outbound.text
    assert repeated_outbound.json()["id"] == outbound["id"]
    supply_after_output = client.get(
        f"/api/v1/inventory/items/{supply['id']}",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert Decimal(supply_after_output.json()["stockQuantity"]) == Decimal("2")
    assert supply_after_output.json()["stockStatus"] == "low"

    adjustment_response = client.post(
        "/api/v1/inventory/movements/adjustments",
        headers={**headers, "Idempotency-Key": f"inventory-adjustment-{suffix}"},
        json={
            "branchId": branch_id,
            "comment": "Conteo físico validado",
            "items": [{"itemId": supply["id"], "quantity": "0"}],
        },
    )
    assert adjustment_response.status_code == 201, adjustment_response.text
    adjustment = adjustment_response.json()
    assert adjustment["movementType"] == "adjustment"
    assert Decimal(adjustment["items"][0]["quantityBefore"]) == Decimal("2")
    assert Decimal(adjustment["items"][0]["quantityAfter"]) == Decimal("0")
    assert Decimal(adjustment["items"][0]["quantityDelta"]) == Decimal("-2")

    movement_detail = client.get(
        f"/api/v1/inventory/movements/{adjustment['id']}",
        headers=headers,
    )
    assert movement_detail.status_code == 200, movement_detail.text
    assert movement_detail.headers["cache-control"] == "no-store"
    assert movement_detail.json()["comment"] == "Conteo físico validado"

    insufficient = client.post(
        "/api/v1/inventory/movements/outbound",
        headers={**headers, "Idempotency-Key": f"inventory-insufficient-{suffix}"},
        json={
            **outbound_payload,
            "items": [{"itemId": supply["id"], "quantity": "1"}],
        },
    )
    assert insufficient.status_code == 409, insufficient.text
    assert insufficient.json()["parameter"] == "items"

    movements = client.get(
        "/api/v1/inventory/movements",
        headers=headers,
        params={"branchId": branch_id, "itemId": supply["id"], "pageSize": 20},
    )
    assert movements.status_code == 200, movements.text
    movement_types = {movement["movementType"] for movement in movements.json()["items"]}
    assert {"opening", "outbound", "adjustment"} <= movement_types
    filtered_movements = client.get(
        "/api/v1/inventory/movements",
        headers=headers,
        params={
            "branchId": branch_id,
            "employeeId": employee["id"],
            "type": "outbound",
            "search": "Uso",
            "dateFrom": outbound["createdAt"][:10],
            "dateTo": outbound["createdAt"][:10],
            "sortBy": "employee",
            "sortDirection": "asc",
        },
    )
    assert filtered_movements.status_code == 200, filtered_movements.text
    assert filtered_movements.headers["cache-control"] == "no-store"
    assert filtered_movements.json()["totalItems"] == 1
    assert filtered_movements.json()["items"][0]["id"] == outbound["id"]

    reversed_dates = client.get(
        "/api/v1/inventory/movements",
        headers=headers,
        params={
            "dateFrom": date.today().isoformat(),
            "dateTo": (date.today() - timedelta(days=1)).isoformat(),
        },
    )
    assert reversed_dates.status_code == 400
    assert reversed_dates.json()["parameter"] == "dateTo"

    excessive_date_range = client.get(
        "/api/v1/inventory/movements",
        headers=headers,
        params={
            "dateFrom": (date.today() - timedelta(days=367)).isoformat(),
            "dateTo": date.today().isoformat(),
        },
    )
    assert excessive_date_range.status_code == 400
    assert excessive_date_range.json()["parameter"] == "dateTo"

    usage = client.get(
        "/api/v1/inventory/supply-usage",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert usage.status_code == 200, usage.text
    assert usage.headers["cache-control"] == "no-store"
    usage_row = next(row for row in usage.json() if row["supplyId"] == supply["id"])
    assert Decimal(usage_row["quantity"]) == Decimal("2")


@pytest.mark.integration
def test_concurrent_outbound_movements_do_not_create_negative_stock(
    client: TestClient,
) -> None:
    headers, session_context, bootstrap = _bootstrap_and_login(client)
    branch_id = str(session_context["visibleBranches"][0]["id"])
    suffix = uuid7().hex[-10:]
    category = _create_category(client, headers, suffix)
    unit_id = _unit_id(client, headers)
    supply_response = client.post(
        "/api/v1/inventory/supplies",
        headers={**headers, "Idempotency-Key": f"concurrent-supply-{suffix}"},
        json={
            "name": f"Concurrente {suffix}",
            "sku": f"CON-{suffix}",
            "categoryId": category["id"],
            "unitOfMeasureId": unit_id,
            "branchId": branch_id,
            "unitCost": "10.00",
            "stock": "1",
            "minimumStock": "0",
        },
    )
    assert supply_response.status_code == 201, supply_response.text
    supply_id = supply_response.json()["id"]
    employee = _create_employee(client, headers, branch_id, suffix)
    principal = AuthPrincipal(
        platform_user_id=bootstrap.platform_user_id,
        membership_id=bootstrap.membership_id,
        workspace_id=bootstrap.workspace_id,
        session_id=uuid7(),
        email=_OWNER_EMAIL,
        display_name="Local Owner",
    )
    grant = PermissionGrant(
        permission_code="inventory.move",
        workspace_id=bootstrap.workspace_id,
        membership_id=bootstrap.membership_id,
        allowed_legal_entity_ids=None,
        allowed_branch_ids=None,
    )
    values = {
        "branch_id": UUID(branch_id),
        "warehouse_id": None,
        "employee_id": UUID(str(employee["id"])),
        "appointment_id": None,
        "comment": "Consumo concurrente",
        "items": [{"item_id": UUID(supply_id), "quantity": Decimal("1")}],
    }
    barrier = Barrier(2)

    def attempt(index: int) -> str:
        factory = get_session_factory()
        with factory() as database:
            barrier.wait(timeout=10)
            try:
                InventoryService(database).create_outbound_movement(
                    principal=principal,
                    grant=grant,
                    values=values,
                    idempotency_key=f"concurrent-output-{suffix}-{index}",
                )
                return "created"
            except ConflictError:
                return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(attempt, (1, 2)))
    assert results.count("created") == 1
    assert results.count("conflict") == 1

    final_item = client.get(
        f"/api/v1/inventory/items/{supply_id}",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert final_item.status_code == 200, final_item.text
    assert Decimal(final_item.json()["stockQuantity"]) == Decimal("0")

    restore = client.post(
        "/api/v1/inventory/movements/adjustments",
        headers={**headers, "Idempotency-Key": f"concurrent-restore-{suffix}"},
        json={
            "branchId": branch_id,
            "comment": "Restaurar para probar replay concurrente",
            "items": [{"itemId": supply_id, "quantity": "1"}],
        },
    )
    assert restore.status_code == 201, restore.text

    replay_barrier = Barrier(2)

    def replay_same_request(_index: int) -> UUID:
        factory = get_session_factory()
        with factory() as database:
            replay_barrier.wait(timeout=10)
            movement = InventoryService(database).create_outbound_movement(
                principal=principal,
                grant=grant,
                values=values,
                idempotency_key=f"concurrent-replay-{suffix}",
            )
            return movement.movement.id

    with ThreadPoolExecutor(max_workers=2) as executor:
        replayed_ids = list(executor.map(replay_same_request, (1, 2)))
    assert len(set(replayed_ids)) == 1

    replayed_item = client.get(
        f"/api/v1/inventory/items/{supply_id}",
        headers=headers,
        params={"branchId": branch_id},
    )
    assert replayed_item.status_code == 200, replayed_item.text
    assert Decimal(replayed_item.json()["stockQuantity"]) == Decimal("0")
