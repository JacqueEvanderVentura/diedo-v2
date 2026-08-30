from datetime import UTC, datetime
from uuid import UUID, uuid7

import pytest
from app.core.security import hash_password
from app.db.models import (
    AccessScope,
    AuditEntry,
    Branch,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    LegalEntity,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    UnitOfMeasure,
    Workspace,
    WorkspaceMembership,
)
from app.db.session import get_engine, session_scope
from app.schemas.catalog import (
    CreateCategoryRequest,
    CreateProductRequest,
    UpdateCategoryRequest,
    UpdateProductRequest,
)
from app.services.catalog import (
    normalize_catalog_name,
    normalize_category_key,
    normalize_optional_text,
    normalize_sku,
)
from app.services.local_bootstrap import bootstrap_local_foundation
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

_PASSWORD = "catalog-test-password-not-a-secret"
_OWNER_EMAIL = "owner@erp.dev"


def _authorization(tokens: dict[str, object]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['accessToken']}"}


def _login(client: TestClient, email: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": _PASSWORD},
    )
    assert response.status_code == 200, response.text
    return _authorization(response.json())


def _seed_catalog_access() -> tuple[UUID, dict[str, UUID], UUID]:
    with session_scope() as session:
        summary = bootstrap_local_foundation(session, hash_password(_PASSWORD))
        suffix = str(uuid7()).replace("-", "")[:12]
        north = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=f"N{suffix}",
            name=f"North {suffix}",
            status="active",
            timezone="America/Santo_Domingo",
        )
        downtown = Branch(
            workspace_id=summary.workspace_id,
            legal_entity_id=summary.legal_entity_id,
            code=f"D{suffix}",
            name=f"Downtown {suffix}",
            status="active",
            timezone="America/Santo_Domingo",
        )
        session.add_all([north, downtown])
        session.flush()
        branches = {"HQ": summary.branch_id, "NORTH": north.id, "DOWNTOWN": downtown.id}
        unit_id = session.scalar(
            select(UnitOfMeasure.id).where(
                UnitOfMeasure.workspace_id == summary.workspace_id,
                UnitOfMeasure.code == "unit",
            )
        )
        assert unit_id is not None
        return summary.workspace_id, branches, unit_id


def _create_scoped_catalog_manager(workspace_id: UUID, branch_ids: set[UUID]) -> str:
    with session_scope() as session:
        now = datetime.now(UTC)
        unique = str(uuid7()).replace("-", "")
        email = f"catalog-manager-{unique}@example.com"
        user = PlatformUser(
            external_subject=f"catalog-test:{unique}",
            email=email,
            normalized_email=email,
            display_name="Catalog Manager",
            password_hash=hash_password(_PASSWORD),
            password_changed_at=now,
            status="active",
        )
        session.add(user)
        session.flush()
        membership = WorkspaceMembership(
            workspace_id=workspace_id,
            platform_user_id=user.id,
            status="active",
            activated_at=now,
            is_default=True,
        )
        role = Role(
            workspace_id=workspace_id,
            code=f"catalog_manager_{unique[:16]}",
            name="Catalog Manager Test",
            status="active",
            is_system=False,
        )
        session.add_all([membership, role])
        session.flush()
        permissions = session.scalars(
            select(Permission).where(Permission.code.in_({"catalog.read", "catalog.manage"}))
        ).all()
        assert len(permissions) == 2
        session.add_all(
            RolePermission(
                workspace_id=workspace_id,
                role_id=role.id,
                permission_id=permission.id,
            )
            for permission in permissions
        )
        branches = session.scalars(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id.in_(branch_ids),
            )
        ).all()
        assert len(branches) == len(branch_ids)
        for branch in branches:
            scope = session.scalar(
                select(AccessScope).where(
                    AccessScope.workspace_id == workspace_id,
                    AccessScope.scope_type == "branch",
                    AccessScope.branch_id == branch.id,
                )
            )
            if scope is None:
                scope = AccessScope(
                    workspace_id=workspace_id,
                    scope_type="branch",
                    legal_entity_id=branch.legal_entity_id,
                    branch_id=branch.id,
                )
                session.add(scope)
                session.flush()
            session.add(
                RoleAssignment(
                    workspace_id=workspace_id,
                    membership_id=membership.id,
                    role_id=role.id,
                    access_scope_id=scope.id,
                    status="active",
                    valid_from=now,
                )
            )
        return email


def _create_category(
    client: TestClient,
    headers: dict[str, str],
    name: str,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/catalog/categories",
        headers=headers,
        json={"name": name, "description": "Categoría de prueba"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _create_product(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str,
    category_id: str,
    unit_id: UUID,
    branch_ids: list[UUID],
    sku: str | None,
    item_type: str = "product",
) -> dict[str, object]:
    response = client.post(
        "/api/v1/catalog/products",
        headers=headers,
        json={
            "itemType": item_type,
            "name": name,
            "description": "Producto de prueba",
            "sku": sku,
            "categoryId": category_id,
            "unitOfMeasureId": str(unit_id),
            "branchIds": [str(branch_id) for branch_id in branch_ids],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_catalog_schema_and_normalization_rules() -> None:
    branch_id = uuid7()
    category = CreateCategoryRequest(name="  Cuidado   Personal  ", description="  Texto  ")
    assert category.name == "Cuidado Personal"
    assert category.description == "Texto"

    product = CreateProductRequest(
        name="  Jabón líquido ",
        sku=" sku-01 ",
        category_id=uuid7(),
        unit_of_measure_id=uuid7(),
        branch_ids=[branch_id],
    )
    assert product.name == "Jabón líquido"
    assert product.sku == "SKU-01"
    assert product.item_type == "product"

    with pytest.raises(ValidationError):
        CreateProductRequest(
            name="Producto",
            category_id=uuid7(),
            unit_of_measure_id=uuid7(),
            branch_ids=[branch_id, branch_id],
        )
    with pytest.raises(ValidationError):
        UpdateCategoryRequest(version=1)
    with pytest.raises(ValidationError):
        UpdateCategoryRequest(version=1, name=None)
    with pytest.raises(ValidationError):
        UpdateCategoryRequest(version=1, status=None)
    with pytest.raises(ValidationError):
        CreateCategoryRequest(name=" x ")
    with pytest.raises(ValidationError):
        UpdateCategoryRequest(version=1, name=" x ")
    with pytest.raises(ValidationError):
        UpdateProductRequest(version=1, branch_ids=None)
    with pytest.raises(ValidationError):
        UpdateProductRequest(version=1, branch_ids=[branch_id, branch_id])
    with pytest.raises(ValidationError):
        CreateProductRequest(
            name=" x ",
            category_id=uuid7(),
            unit_of_measure_id=uuid7(),
            branch_ids=[branch_id],
        )
    with pytest.raises(ValidationError):
        UpdateProductRequest(version=1, name=" x ")

    assert normalize_catalog_name("  Uno   Dos ") == "Uno Dos"
    assert normalize_category_key("  ÁREA   VIP ") == "área vip"
    assert normalize_optional_text("   ") is None
    assert normalize_sku(" ab-10 ") == "AB-10"
    assert normalize_sku(None) is None


@pytest.mark.integration
def test_catalog_crud_filters_concurrency_and_audit(client: TestClient) -> None:
    workspace_id, branches, unit_id = _seed_catalog_access()
    admin_headers = _login(client, _OWNER_EMAIL)
    unique = str(uuid7()).replace("-", "")

    unauthenticated = client.get("/api/v1/catalog/categories")
    assert unauthenticated.status_code == 401

    units = client.get("/api/v1/catalog/units-of-measure", headers=admin_headers)
    assert units.status_code == 200
    assert {unit["code"] for unit in units.json()} == {
        "unit",
        "kg",
        "g",
        "lb",
        "l",
        "ml",
        "m",
        "cm",
    }

    category = _create_category(client, admin_headers, f"  Categoría   {unique}  ")
    secondary_category = _create_category(client, admin_headers, f"Secundaria {unique}")
    assert category["name"] == f"Categoría {unique}"
    assert category["version"] == 1

    duplicate_category = client.post(
        "/api/v1/catalog/categories",
        headers=admin_headers,
        json={"name": f"categoría {unique}"},
    )
    assert duplicate_category.status_code == 409
    assert duplicate_category.json()["parameter"] == "name"

    category_page = client.get(
        "/api/v1/catalog/categories",
        headers=admin_headers,
        params={
            "search": unique,
            "status": "active",
            "page": 1,
            "pageSize": 1,
            "sortBy": "createdAt",
            "sortDirection": "desc",
        },
    )
    assert category_page.status_code == 200
    assert category_page.json()["totalItems"] == 2
    assert category_page.json()["totalPages"] == 2

    category_detail = client.get(
        f"/api/v1/catalog/categories/{category['id']}", headers=admin_headers
    )
    assert category_detail.status_code == 200
    missing_category = client.get(f"/api/v1/catalog/categories/{uuid7()}", headers=admin_headers)
    assert missing_category.status_code == 404
    missing_category_update = client.patch(
        f"/api/v1/catalog/categories/{uuid7()}",
        headers=admin_headers,
        json={"version": 1, "name": "No existe"},
    )
    assert missing_category_update.status_code == 404

    empty_patch = client.patch(
        f"/api/v1/catalog/categories/{category['id']}",
        headers=admin_headers,
        json={"version": category["version"]},
    )
    assert empty_patch.status_code == 400

    category_update = client.patch(
        f"/api/v1/catalog/categories/{category['id']}",
        headers=admin_headers,
        json={
            "version": category["version"],
            "name": f"Categoría editada {unique}",
            "description": None,
        },
    )
    assert category_update.status_code == 200
    category = category_update.json()
    assert category["description"] is None
    assert category["version"] == 2

    stale_category = client.patch(
        f"/api/v1/catalog/categories/{category['id']}",
        headers=admin_headers,
        json={"version": 1, "status": "inactive"},
    )
    assert stale_category.status_code == 409
    assert stale_category.json()["parameter"] == "version"

    duplicate_category_update = client.patch(
        f"/api/v1/catalog/categories/{category['id']}",
        headers=admin_headers,
        json={"version": category["version"], "name": secondary_category["name"]},
    )
    assert duplicate_category_update.status_code == 409
    assert duplicate_category_update.json()["parameter"] == "name"

    product_template = {
        "name": f"Referencia inválida {unique}",
        "categoryId": category["id"],
        "unitOfMeasureId": str(unit_id),
        "branchIds": [str(branches["HQ"])],
    }
    invalid_category = client.post(
        "/api/v1/catalog/products",
        headers=admin_headers,
        json={**product_template, "categoryId": str(uuid7())},
    )
    assert invalid_category.status_code == 404
    assert invalid_category.json()["parameter"] == "categoryId"
    invalid_unit = client.post(
        "/api/v1/catalog/products",
        headers=admin_headers,
        json={**product_template, "unitOfMeasureId": str(uuid7())},
    )
    assert invalid_unit.status_code == 404
    assert invalid_unit.json()["parameter"] == "unitOfMeasureId"
    invalid_branch = client.post(
        "/api/v1/catalog/products",
        headers=admin_headers,
        json={**product_template, "branchIds": [str(uuid7())]},
    )
    assert invalid_branch.status_code == 404
    assert invalid_branch.json()["parameter"] == "branchIds"

    product = _create_product(
        client,
        admin_headers,
        name=f"Producto {unique}",
        category_id=str(category["id"]),
        unit_id=unit_id,
        branch_ids=[branches["HQ"], branches["NORTH"]],
        sku=f"sku-{unique}",
        item_type="service",
    )
    assert product["itemType"] == "service"
    assert product["sku"] == f"SKU-{unique.upper()}"
    assert {UUID(branch["id"]) for branch in product["branches"]} == {
        branches["HQ"],
        branches["NORTH"],
    }

    duplicate_sku = client.post(
        "/api/v1/catalog/products",
        headers=admin_headers,
        json={
            "name": f"Duplicado {unique}",
            "sku": f"SkU-{unique}",
            "categoryId": secondary_category["id"],
            "unitOfMeasureId": str(unit_id),
            "branchIds": [str(branches["HQ"])],
        },
    )
    assert duplicate_sku.status_code == 409
    assert duplicate_sku.json()["parameter"] == "sku"

    first_without_sku = _create_product(
        client,
        admin_headers,
        name=f"Sin SKU A {unique}",
        category_id=str(secondary_category["id"]),
        unit_id=unit_id,
        branch_ids=[branches["HQ"]],
        sku=None,
    )
    second_without_sku = _create_product(
        client,
        admin_headers,
        name=f"Sin SKU B {unique}",
        category_id=str(secondary_category["id"]),
        unit_id=unit_id,
        branch_ids=[branches["HQ"]],
        sku=None,
    )
    assert first_without_sku["sku"] is None
    assert second_without_sku["sku"] is None

    duplicate_sku_update = client.patch(
        f"/api/v1/catalog/products/{first_without_sku['id']}",
        headers=admin_headers,
        json={"version": first_without_sku["version"], "sku": product["sku"]},
    )
    assert duplicate_sku_update.status_code == 409
    assert duplicate_sku_update.json()["parameter"] == "sku"

    missing_product = client.get(f"/api/v1/catalog/products/{uuid7()}", headers=admin_headers)
    assert missing_product.status_code == 404
    missing_product_update = client.patch(
        f"/api/v1/catalog/products/{uuid7()}",
        headers=admin_headers,
        json={"version": 1, "name": "No existe"},
    )
    assert missing_product_update.status_code == 404

    product_page = client.get(
        "/api/v1/catalog/products",
        headers=admin_headers,
        params={
            "search": unique,
            "categoryId": secondary_category["id"],
            "branchId": str(branches["HQ"]),
            "page": 1,
            "pageSize": 1,
            "sortBy": "sku",
            "sortDirection": "desc",
        },
    )
    assert product_page.status_code == 200
    assert product_page.json()["totalItems"] == 2
    assert product_page.json()["totalPages"] == 2

    product_update = client.patch(
        f"/api/v1/catalog/products/{product['id']}",
        headers=admin_headers,
        json={
            "version": product["version"],
            "name": f"Producto editado {unique}",
            "description": None,
            "sku": f"edit-{unique}",
            "branchIds": [str(branches["HQ"])],
            "itemType": "product",
            "status": "inactive",
        },
    )
    assert product_update.status_code == 200
    product = product_update.json()
    assert product["description"] is None
    assert product["itemType"] == "product"
    assert product["status"] == "inactive"
    assert product["version"] == 2
    assert [UUID(branch["id"]) for branch in product["branches"]] == [branches["HQ"]]

    with session_scope() as session:
        removed_assignment = session.scalar(
            select(ItemBranchAssignment).where(
                ItemBranchAssignment.workspace_id == workspace_id,
                ItemBranchAssignment.item_id == UUID(str(product["id"])),
                ItemBranchAssignment.branch_id == branches["NORTH"],
            )
        )
        assert removed_assignment is not None
        assert removed_assignment.status == "inactive"

    category_in_use = client.patch(
        f"/api/v1/catalog/categories/{category['id']}",
        headers=admin_headers,
        json={"version": category["version"], "status": "archived"},
    )
    assert category_in_use.status_code == 409
    assert category_in_use.json()["parameter"] == "status"

    stale_product = client.patch(
        f"/api/v1/catalog/products/{product['id']}",
        headers=admin_headers,
        json={"version": 1, "name": "Versión vieja"},
    )
    assert stale_product.status_code == 409
    assert stale_product.json()["parameter"] == "version"

    archived_product = client.patch(
        f"/api/v1/catalog/products/{product['id']}",
        headers=admin_headers,
        json={"version": product["version"], "status": "archived"},
    )
    assert archived_product.status_code == 200
    product = archived_product.json()

    default_search = client.get(
        "/api/v1/catalog/products",
        headers=admin_headers,
        params={"search": product["sku"]},
    )
    assert default_search.status_code == 200
    assert default_search.json()["totalItems"] == 0
    archived_search = client.get(
        "/api/v1/catalog/products",
        headers=admin_headers,
        params={"search": product["sku"], "status": "archived"},
    )
    assert archived_search.status_code == 200
    assert archived_search.json()["totalItems"] == 1

    archived_category = client.patch(
        f"/api/v1/catalog/categories/{category['id']}",
        headers=admin_headers,
        json={"version": category["version"], "status": "archived"},
    )
    assert archived_category.status_code == 200
    assert archived_category.json()["status"] == "archived"

    with session_scope() as session:
        actions = set(
            session.scalars(
                select(AuditEntry.action).where(
                    AuditEntry.workspace_id == workspace_id,
                    AuditEntry.action.like("catalog.%"),
                )
            )
        )
    assert {
        "catalog.category.create",
        "catalog.category.update",
        "catalog.product.create",
        "catalog.product.update",
    } <= actions


@pytest.mark.integration
def test_catalog_branch_and_workspace_isolation(client: TestClient) -> None:
    workspace_id, branches, unit_id = _seed_catalog_access()
    admin_headers = _login(client, _OWNER_EMAIL)
    manager_email = _create_scoped_catalog_manager(
        workspace_id, {branches["HQ"], branches["NORTH"]}
    )
    manager_headers = _login(client, manager_email)
    unique = str(uuid7()).replace("-", "")
    category = _create_category(client, admin_headers, f"Alcance {unique}")

    shared_product = _create_product(
        client,
        admin_headers,
        name=f"Compartido {unique}",
        category_id=str(category["id"]),
        unit_id=unit_id,
        branch_ids=[branches["HQ"], branches["DOWNTOWN"]],
        sku=f"shared-{unique}",
    )

    manager_category_read = client.get(
        f"/api/v1/catalog/categories/{category['id']}", headers=manager_headers
    )
    assert manager_category_read.status_code == 200
    manager_category_write = client.post(
        "/api/v1/catalog/categories",
        headers=manager_headers,
        json={"name": f"Denegada {unique}"},
    )
    assert manager_category_write.status_code == 403

    visible_shared = client.get(
        f"/api/v1/catalog/products/{shared_product['id']}", headers=manager_headers
    )
    assert visible_shared.status_code == 200
    assert [UUID(branch["id"]) for branch in visible_shared.json()["branches"]] == [branches["HQ"]]

    denied_shared_update = client.patch(
        f"/api/v1/catalog/products/{shared_product['id']}",
        headers=manager_headers,
        json={"version": shared_product["version"], "name": f"Cambio {unique}"},
    )
    assert denied_shared_update.status_code == 403

    outside_filter = client.get(
        "/api/v1/catalog/products",
        headers=manager_headers,
        params={"branchId": str(branches["DOWNTOWN"])},
    )
    assert outside_filter.status_code == 403

    local_product = _create_product(
        client,
        manager_headers,
        name=f"Local {unique}",
        category_id=str(category["id"]),
        unit_id=unit_id,
        branch_ids=[branches["HQ"]],
        sku=f"local-{unique}",
    )
    local_update = client.patch(
        f"/api/v1/catalog/products/{local_product['id']}",
        headers=manager_headers,
        json={
            "version": local_product["version"],
            "branchIds": [str(branches["NORTH"])],
        },
    )
    assert local_update.status_code == 200
    assert [UUID(branch["id"]) for branch in local_update.json()["branches"]] == [branches["NORTH"]]

    outside_create = client.post(
        "/api/v1/catalog/products",
        headers=manager_headers,
        json={
            "name": f"Fuera {unique}",
            "categoryId": category["id"],
            "unitOfMeasureId": str(unit_id),
            "branchIds": [str(branches["DOWNTOWN"])],
        },
    )
    assert outside_create.status_code == 403

    with session_scope() as session:
        foreign_workspace = Workspace(
            slug=f"foreign-{unique[:20]}",
            name="Foreign catalog",
            status="active",
            default_currency="DOP",
            timezone="America/Santo_Domingo",
            locale="es-DO",
        )
        session.add(foreign_workspace)
        session.flush()
        foreign_entity = LegalEntity(
            workspace_id=foreign_workspace.id,
            code="MAIN",
            legal_name="Foreign Company",
            status="active",
        )
        session.add(foreign_entity)
        session.flush()
        foreign_branch = Branch(
            workspace_id=foreign_workspace.id,
            legal_entity_id=foreign_entity.id,
            code="HQ",
            name="Foreign branch",
            status="active",
            timezone="America/Santo_Domingo",
        )
        foreign_category = ItemCategory(
            workspace_id=foreign_workspace.id,
            name="Foreign category",
            normalized_name="foreign category",
            status="active",
        )
        foreign_unit = UnitOfMeasure(
            workspace_id=foreign_workspace.id,
            code="unit",
            name="Unidad",
            symbol="ud",
            status="active",
        )
        session.add_all([foreign_branch, foreign_category, foreign_unit])
        session.flush()
        foreign_item = Item(
            workspace_id=foreign_workspace.id,
            category_id=foreign_category.id,
            unit_of_measure_id=foreign_unit.id,
            item_type="product",
            name="Foreign product",
            status="active",
        )
        session.add(foreign_item)
        session.flush()
        session.add(
            ItemBranchAssignment(
                workspace_id=foreign_workspace.id,
                item_id=foreign_item.id,
                branch_id=foreign_branch.id,
                status="active",
            )
        )
        foreign_item_id = foreign_item.id

    hidden_foreign = client.get(
        f"/api/v1/catalog/products/{foreign_item_id}", headers=admin_headers
    )
    assert hidden_foreign.status_code == 404

    with session_scope() as session:
        workspace = session.get(Workspace, workspace_id)
        assert workspace is not None


@pytest.mark.integration
def test_catalog_database_rejects_cross_workspace_reference() -> None:
    workspace_id, _branches, unit_id = _seed_catalog_access()
    connection = get_engine().connect()
    transaction = connection.begin()
    try:
        with Session(bind=connection) as session:
            foreign_workspace = Workspace(
                slug=f"constraint-{str(uuid7()).replace('-', '')[:20]}",
                name="Constraint workspace",
                status="active",
                default_currency="DOP",
                timezone="America/Santo_Domingo",
                locale="es-DO",
            )
            session.add(foreign_workspace)
            session.flush()
            category = ItemCategory(
                workspace_id=workspace_id,
                name=f"Constraint {uuid7()}",
                normalized_name=str(uuid7()),
                status="active",
            )
            session.add(category)
            session.flush()

            with pytest.raises(IntegrityError):
                with session.begin_nested():
                    session.add(
                        Item(
                            workspace_id=foreign_workspace.id,
                            category_id=category.id,
                            unit_of_measure_id=unit_id,
                            item_type="product",
                            name="Invalid cross-workspace item",
                            status="active",
                        )
                    )
                    session.flush()
    finally:
        transaction.rollback()
        connection.close()
