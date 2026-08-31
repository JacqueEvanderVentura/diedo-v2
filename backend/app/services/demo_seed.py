from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    AccessScope,
    AppointmentResource,
    Asset,
    AssetCategory,
    Branch,
    Customer,
    CustomerBranchAssignment,
    DemoSeedRegistry,
    Employee,
    EmployeeBranchAssignment,
    EmployeeDebt,
    EmployeeDebtPayment,
    EmployeeHrProfile,
    EmployeeSchedule,
    EmployeeSupervisor,
    HrDocumentRecord,
    HrLeaveRequest,
    InventoryItemProfile,
    InventoryMovement,
    InventoryMovementLine,
    InventoryStockBalance,
    InventoryWarehouse,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    PaymentMethod,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    UnitOfMeasure,
    WorkspaceMembership,
)
from app.db.models.agenda import DEFAULT_APPOINTMENT_RESOURCES
from app.services.demo_manifest import (
    DemoBundle,
    DemoEmployeeFixture,
    DemoInventoryItemProfileFixture,
    load_demo_bundle,
)
from app.services.local_bootstrap import bootstrap_local_foundation

_DEMO_NAMESPACE = UUID("0b995e4e-d36a-5a4f-82b7-84a536c9fa59")


@dataclass(frozen=True)
class DemoSeedSummary:
    enabled: bool
    seed_version: str
    workspace_id: UUID | None
    branch_count: int
    demo_user_count: int
    payment_method_count: int
    customer_count: int = 0
    employee_count: int = 0
    leave_request_count: int = 0
    debt_count: int = 0
    document_count: int = 0
    catalog_category_count: int = 0
    catalog_item_count: int = 0
    catalog_assignment_count: int = 0
    inventory_warehouse_count: int = 0
    inventory_profile_count: int = 0
    inventory_stock_balance_count: int = 0
    inventory_asset_count: int = 0
    inventory_movement_count: int = 0


def seed_demo_data(
    session: Session,
    password_hash: str | None,
    *,
    enabled: bool | None = None,
) -> DemoSeedSummary:
    should_seed = settings.demo_seed_enabled if enabled is None else enabled
    bundle = load_demo_bundle()
    if not should_seed:
        return DemoSeedSummary(False, bundle.manifest.seed_version, None, 0, 0, 0, 0, 0, 0, 0, 0)
    if settings.app_env not in {"development", "test"}:
        raise RuntimeError("Demo seeding is disabled outside development and test.")
    if password_hash is None:
        raise RuntimeError("A local demo password is required when demo seeding is enabled.")

    foundation = bootstrap_local_foundation(session, password_hash)
    _seed_role_permissions(session, bundle, foundation.workspace_id)
    branches = _seed_branches(
        session,
        bundle,
        foundation.workspace_id,
        foundation.legal_entity_id,
    )
    _seed_users(session, bundle, foundation.workspace_id, branches, password_hash)
    _seed_payment_methods(session, bundle, foundation.workspace_id)
    catalog_assignment_count = _seed_catalog(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    inventory_counts = _seed_inventory(
        session,
        bundle,
        foundation.workspace_id,
        branches,
    )
    _seed_customers(session, bundle, foundation.workspace_id, branches)
    _seed_employees(session, bundle, foundation.workspace_id, branches)
    _seed_hr(session, bundle, foundation.workspace_id)
    return DemoSeedSummary(
        True,
        bundle.manifest.seed_version,
        foundation.workspace_id,
        len(branches),
        len(bundle.iam.users),
        len(bundle.configuration.payment_methods),
        len(bundle.customers.items),
        len(bundle.employees.items),
        len(bundle.hr.leave_requests),
        len(bundle.hr.debts),
        len(bundle.hr.documents),
        len(bundle.catalog.categories),
        len(bundle.catalog.items),
        catalog_assignment_count,
        *inventory_counts,
    )


def _seed_catalog(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> int:
    categories = _seed_catalog_categories(session, bundle, workspace_id)
    units = {
        unit.code: unit
        for unit in session.scalars(
            select(UnitOfMeasure).where(UnitOfMeasure.workspace_id == workspace_id)
        )
    }
    assignment_count = 0
    for fixture in bundle.catalog.items:
        category = categories.get(fixture.category_seed_key)
        if category is None:
            raise RuntimeError(
                f"Demo catalog category {fixture.category_seed_key!r} is not installed."
            )
        unit = units.get(fixture.unit_code)
        if unit is None:
            raise RuntimeError(f"Demo unit of measure {fixture.unit_code!r} is not installed.")
        unknown_branch_codes = set(fixture.branch_codes) - branches.keys()
        if unknown_branch_codes:
            unknown = ", ".join(sorted(unknown_branch_codes))
            raise RuntimeError(f"Demo catalog item references unknown branches: {unknown}.")

        payload = fixture.model_dump(mode="json")
        item_id = _stable_id(bundle.manifest.seed_version, "item", fixture.seed_key)
        item = _registered_entity(
            session,
            workspace_id,
            "item",
            fixture.seed_key,
            item_id,
            payload,
            Item,
        )
        sku = fixture.sku.strip().upper() if fixture.sku else None
        if item is None:
            item = Item(
                id=item_id,
                workspace_id=workspace_id,
                category_id=category.id,
                unit_of_measure_id=unit.id,
                item_type=fixture.item_type,
                name=_normalized_catalog_name(fixture.name),
                description=fixture.description,
                sku=sku,
                status=fixture.status,
            )
            session.add(item)
            session.flush()
            _register(
                session,
                workspace_id,
                "item",
                fixture.seed_key,
                item_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            item.category_id = category.id
            item.unit_of_measure_id = unit.id
            item.item_type = fixture.item_type
            item.name = _normalized_catalog_name(fixture.name)
            item.description = fixture.description
            item.sku = sku
            item.status = fixture.status

        selected_branch_codes = set(fixture.branch_codes)
        for branch_code, branch in branches.items():
            assignment_key = f"{fixture.seed_key}:{branch_code}"
            assignment_id = _stable_id(
                bundle.manifest.seed_version,
                "item_branch_assignment",
                assignment_key,
            )
            assignment = session.get(ItemBranchAssignment, assignment_id)
            if branch_code not in selected_branch_codes:
                if assignment is not None:
                    assignment.status = "inactive"
                continue

            assignment_payload = {
                "itemSeedKey": fixture.seed_key,
                "branchCode": branch_code,
            }
            assignment = _registered_entity(
                session,
                workspace_id,
                "item_branch_assignment",
                assignment_key,
                assignment_id,
                assignment_payload,
                ItemBranchAssignment,
            )
            if assignment is None:
                assignment = ItemBranchAssignment(
                    id=assignment_id,
                    workspace_id=workspace_id,
                    item_id=item.id,
                    branch_id=branch.id,
                    status="active",
                )
                session.add(assignment)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "item_branch_assignment",
                    assignment_key,
                    assignment_id,
                    bundle.manifest.seed_version,
                    assignment_payload,
                )
            else:
                assignment.item_id = item.id
                assignment.branch_id = branch.id
                assignment.status = "active"
            assignment_count += 1
    session.flush()
    return assignment_count


def _seed_catalog_categories(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
) -> dict[str, ItemCategory]:
    categories: dict[str, ItemCategory] = {}
    for fixture in bundle.catalog.categories:
        payload = fixture.model_dump(mode="json")
        category_id = _stable_id(
            bundle.manifest.seed_version,
            "item_category",
            fixture.seed_key,
        )
        category = _registered_entity(
            session,
            workspace_id,
            "item_category",
            fixture.seed_key,
            category_id,
            payload,
            ItemCategory,
        )
        name = _normalized_catalog_name(fixture.name)
        if category is None:
            category = ItemCategory(
                id=category_id,
                workspace_id=workspace_id,
                name=name,
                normalized_name=name.casefold(),
                description=fixture.description,
                status=fixture.status,
            )
            session.add(category)
            session.flush()
            _register(
                session,
                workspace_id,
                "item_category",
                fixture.seed_key,
                category_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            category.name = name
            category.normalized_name = name.casefold()
            category.description = fixture.description
            category.status = fixture.status
        categories[fixture.seed_key] = category
    session.flush()
    return categories


def _normalized_catalog_name(value: str) -> str:
    return " ".join(value.split())


def _seed_inventory(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> tuple[int, int, int, int, int]:
    inventory_branch_codes = {
        branch_code
        for fixture in bundle.inventory.item_profiles
        for branch_code in fixture.stock_by_branch
    } | {fixture.branch_code for fixture in bundle.inventory.assets}
    unknown_branch_codes = inventory_branch_codes - branches.keys()
    if unknown_branch_codes:
        unknown = ", ".join(sorted(unknown_branch_codes))
        raise RuntimeError(f"Demo inventory references unknown branches: {unknown}.")
    inventory_branches = {
        branch_code: branches[branch_code] for branch_code in inventory_branch_codes
    }
    warehouses = _ensure_demo_warehouses(
        session,
        bundle.manifest.seed_version,
        workspace_id,
        inventory_branches,
    )
    items = {
        fixture.seed_key: session.get(
            Item,
            _stable_id(bundle.manifest.seed_version, "item", fixture.seed_key),
        )
        for fixture in bundle.catalog.items
    }
    stock_balance_count = 0
    movement_count = 0
    for fixture in bundle.inventory.item_profiles:
        item = items.get(fixture.item_seed_key)
        if item is None:
            raise RuntimeError(
                f"Demo inventory profile references unknown item {fixture.item_seed_key!r}."
            )
        _validate_demo_inventory_profile(fixture, item.item_type, inventory_branches)
        profile_payload = fixture.model_dump(mode="json")
        profile_key = fixture.item_seed_key
        profile = session.scalar(
            select(InventoryItemProfile).where(
                InventoryItemProfile.workspace_id == workspace_id,
                InventoryItemProfile.item_id == item.id,
            )
        )
        profile_registry_id = session.scalar(
            select(DemoSeedRegistry.entity_id).where(
                DemoSeedRegistry.workspace_id == workspace_id,
                DemoSeedRegistry.entity_type == "inventory_item_profile",
                DemoSeedRegistry.seed_key == profile_key,
            )
        )
        profile_id = (
            profile_registry_id
            or (profile.id if profile is not None else None)
            or _stable_id(bundle.manifest.seed_version, "inventory_item_profile", profile_key)
        )
        if profile_registry_id is None and profile is not None:
            _register(
                session,
                workspace_id,
                "inventory_item_profile",
                profile_key,
                profile.id,
                bundle.manifest.seed_version,
                profile_payload,
            )
        else:
            profile = _registered_entity(
                session,
                workspace_id,
                "inventory_item_profile",
                profile_key,
                profile_id,
                profile_payload,
                InventoryItemProfile,
            )
        if profile is None:
            profile = InventoryItemProfile(
                id=profile_id,
                workspace_id=workspace_id,
                item_id=item.id,
            )
            session.add(profile)
            session.flush()
            _register(
                session,
                workspace_id,
                "inventory_item_profile",
                profile_key,
                profile.id,
                bundle.manifest.seed_version,
                profile_payload,
            )
        profile.sale_price = fixture.sale_price
        profile.unit_cost = fixture.unit_cost
        profile.tax_rate = fixture.tax_rate
        profile.request_fingerprint = _checksum(profile_payload)

        for branch_code, quantity in fixture.stock_by_branch.items():
            branch = branches[branch_code]
            assignment = session.scalar(
                select(ItemBranchAssignment).where(
                    ItemBranchAssignment.workspace_id == workspace_id,
                    ItemBranchAssignment.item_id == item.id,
                    ItemBranchAssignment.branch_id == branch.id,
                    ItemBranchAssignment.status == "active",
                )
            )
            if assignment is None:
                raise RuntimeError(
                    f"Demo stock item {fixture.item_seed_key!r} is not assigned to "
                    f"branch {branch_code!r}."
                )
            warehouse = warehouses[branch_code]
            balance_key = f"{fixture.item_seed_key}:{branch_code}"
            balance_payload = {
                "itemSeedKey": fixture.item_seed_key,
                "branchCode": branch_code,
                "quantity": str(quantity),
                "minimumStock": str(fixture.minimum_stock),
            }
            balance = session.scalar(
                select(InventoryStockBalance).where(
                    InventoryStockBalance.workspace_id == workspace_id,
                    InventoryStockBalance.warehouse_id == warehouse.id,
                    InventoryStockBalance.item_id == item.id,
                )
            )
            balance_registry_id = session.scalar(
                select(DemoSeedRegistry.entity_id).where(
                    DemoSeedRegistry.workspace_id == workspace_id,
                    DemoSeedRegistry.entity_type == "inventory_stock_balance",
                    DemoSeedRegistry.seed_key == balance_key,
                )
            )
            balance_id = (
                balance_registry_id
                or (balance.id if balance is not None else None)
                or _stable_id(
                    bundle.manifest.seed_version,
                    "inventory_stock_balance",
                    balance_key,
                )
            )
            if balance_registry_id is None and balance is not None:
                _register(
                    session,
                    workspace_id,
                    "inventory_stock_balance",
                    balance_key,
                    balance.id,
                    bundle.manifest.seed_version,
                    balance_payload,
                )
            else:
                balance = _registered_entity(
                    session,
                    workspace_id,
                    "inventory_stock_balance",
                    balance_key,
                    balance_id,
                    balance_payload,
                    InventoryStockBalance,
                )
            if balance is None:
                balance = InventoryStockBalance(
                    id=balance_id,
                    workspace_id=workspace_id,
                    branch_id=branch.id,
                    warehouse_id=warehouse.id,
                    item_id=item.id,
                )
                session.add(balance)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "inventory_stock_balance",
                    balance_key,
                    balance.id,
                    bundle.manifest.seed_version,
                    balance_payload,
                )
            balance.branch_id = branch.id
            balance.warehouse_id = warehouse.id
            balance.item_id = item.id
            balance.quantity = quantity
            balance.minimum_quantity = fixture.minimum_stock
            stock_balance_count += 1
            if quantity > 0:
                _seed_opening_movement(
                    session=session,
                    bundle=bundle,
                    workspace_id=workspace_id,
                    branch=branch,
                    warehouse=warehouse,
                    item=item,
                    profile=profile,
                    item_seed_key=fixture.item_seed_key,
                    quantity=quantity,
                )
                movement_count += 1

    asset_count = _seed_demo_assets(session, bundle, workspace_id, branches)
    session.flush()
    return (
        len(warehouses),
        len(bundle.inventory.item_profiles),
        stock_balance_count,
        asset_count,
        movement_count,
    )


def _validate_demo_inventory_profile(
    fixture: DemoInventoryItemProfileFixture,
    item_type: str,
    branches: dict[str, Branch],
) -> None:
    unknown_branches = set(fixture.stock_by_branch) - branches.keys()
    if unknown_branches:
        unknown = ", ".join(sorted(unknown_branches))
        raise RuntimeError(f"Demo inventory profile references unknown branches: {unknown}.")
    if item_type == "service":
        if fixture.sale_price is None or fixture.unit_cost is not None or fixture.stock_by_branch:
            raise RuntimeError("Demo services require a sale price and cannot control stock.")
    elif item_type == "product":
        if fixture.sale_price is None or fixture.unit_cost is None:
            raise RuntimeError("Demo products require sale price and unit cost.")
    elif item_type == "supply":
        if fixture.sale_price is not None or fixture.unit_cost is None or fixture.tax_rate != 0:
            raise RuntimeError("Demo supplies require only unit cost and zero tax.")
    else:
        raise RuntimeError(f"Item type {item_type!r} cannot have an inventory profile.")


def _ensure_demo_warehouses(
    session: Session,
    seed_version: str,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> dict[str, InventoryWarehouse]:
    warehouses: dict[str, InventoryWarehouse] = {}
    for branch_code, branch in branches.items():
        warehouse = session.scalar(
            select(InventoryWarehouse).where(
                InventoryWarehouse.workspace_id == workspace_id,
                InventoryWarehouse.branch_id == branch.id,
                InventoryWarehouse.code == "main",
            )
        )
        if warehouse is None:
            warehouse = InventoryWarehouse(
                id=_stable_id(seed_version, "inventory_warehouse", branch_code),
                workspace_id=workspace_id,
                branch_id=branch.id,
                code="main",
                name="Almacén principal",
                is_default=True,
                status="active",
            )
            session.add(warehouse)
            session.flush()
        else:
            warehouse.name = "Almacén principal"
            warehouse.is_default = True
            warehouse.status = "active"
        warehouses[branch_code] = warehouse
    return warehouses


def _seed_opening_movement(
    *,
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branch: Branch,
    warehouse: InventoryWarehouse,
    item: Item,
    profile: InventoryItemProfile,
    item_seed_key: str,
    quantity: Decimal,
) -> None:
    movement_key = f"{item_seed_key}:{branch.code}"
    movement_payload = {
        "itemSeedKey": item_seed_key,
        "branchCode": branch.code,
        "quantity": str(quantity),
    }
    movement_id = _stable_id(
        bundle.manifest.seed_version,
        "inventory_opening_movement",
        movement_key,
    )
    movement = _registered_entity(
        session,
        workspace_id,
        "inventory_opening_movement",
        movement_key,
        movement_id,
        movement_payload,
        InventoryMovement,
    )
    if movement is None:
        movement = InventoryMovement(
            id=movement_id,
            workspace_id=workspace_id,
            branch_id=branch.id,
            warehouse_id=warehouse.id,
            movement_type="opening",
            employee_id=None,
            appointment_id=None,
            comment="Existencia inicial demo",
            idempotency_key=(
                f"demo:{bundle.manifest.seed_version}:opening:{item_seed_key}:{branch.code}"
            ),
            request_fingerprint=_checksum(movement_payload),
            created_by_platform_user_id=_stable_id(
                bundle.manifest.seed_version, "platform_user", "admin"
            ),
            created_at=datetime(2026, 8, 1, 9, tzinfo=UTC),
        )
        session.add(movement)
        session.flush()
        _register(
            session,
            workspace_id,
            "inventory_opening_movement",
            movement_key,
            movement.id,
            bundle.manifest.seed_version,
            movement_payload,
        )
    else:
        movement.branch_id = branch.id
        movement.warehouse_id = warehouse.id
        movement.movement_type = "opening"
        movement.comment = "Existencia inicial demo"
        movement.request_fingerprint = _checksum(movement_payload)

    line_key = movement_key
    line_payload = {**movement_payload, "unitCost": str(profile.unit_cost or 0)}
    line_id = _stable_id(
        bundle.manifest.seed_version,
        "inventory_opening_line",
        line_key,
    )
    line = _registered_entity(
        session,
        workspace_id,
        "inventory_opening_line",
        line_key,
        line_id,
        line_payload,
        InventoryMovementLine,
    )
    unit = session.get(UnitOfMeasure, item.unit_of_measure_id)
    if unit is None:
        raise RuntimeError("Demo inventory item unit of measure is missing.")
    if line is None:
        line = InventoryMovementLine(
            id=line_id,
            workspace_id=workspace_id,
            movement_id=movement.id,
            item_id=item.id,
            quantity_delta=quantity,
            quantity_before=Decimal("0"),
            quantity_after=quantity,
            unit_cost_snapshot=profile.unit_cost,
            item_name=item.name,
            item_sku=item.sku,
            unit_symbol=unit.symbol,
        )
        session.add(line)
        session.flush()
        _register(
            session,
            workspace_id,
            "inventory_opening_line",
            line_key,
            line.id,
            bundle.manifest.seed_version,
            line_payload,
        )
    else:
        line.movement_id = movement.id
        line.item_id = item.id
        line.quantity_delta = quantity
        line.quantity_before = Decimal("0")
        line.quantity_after = quantity
        line.unit_cost_snapshot = profile.unit_cost
        line.item_name = item.name
        line.item_sku = item.sku
        line.unit_symbol = unit.symbol


def _seed_demo_assets(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> int:
    categories = {
        category.code: category
        for category in session.scalars(
            select(AssetCategory).where(
                AssetCategory.workspace_id == workspace_id,
                AssetCategory.status == "active",
            )
        )
    }
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    for fixture in bundle.inventory.assets:
        branch = branches.get(fixture.branch_code)
        if branch is None:
            raise RuntimeError(
                f"Demo asset references unknown branch {fixture.branch_code!r}."
            )
        category = categories.get(fixture.category_code)
        if category is None:
            raise RuntimeError(
                f"Demo asset references unknown category {fixture.category_code!r}."
            )
        payload = fixture.model_dump(mode="json")
        asset_id = _stable_id(bundle.manifest.seed_version, "asset", fixture.seed_key)
        asset = _registered_entity(
            session,
            workspace_id,
            "asset",
            fixture.seed_key,
            asset_id,
            payload,
            Asset,
        )
        if asset is None:
            asset = Asset(
                id=asset_id,
                workspace_id=workspace_id,
                category_id=category.id,
                branch_id=branch.id,
                name=fixture.name,
                code=fixture.code.strip().upper(),
                acquisition_value=fixture.acquisition_value,
                status=fixture.status,
                location=fixture.location,
                purchase_date=fixture.purchase_date,
                notes=fixture.notes,
                creation_idempotency_key=(
                    f"demo:{bundle.manifest.seed_version}:asset:{fixture.seed_key}"
                ),
                request_fingerprint=_checksum(payload),
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            session.add(asset)
            session.flush()
            _register(
                session,
                workspace_id,
                "asset",
                fixture.seed_key,
                asset.id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            asset.category_id = category.id
            asset.branch_id = branch.id
            asset.name = fixture.name
            asset.code = fixture.code.strip().upper()
            asset.acquisition_value = fixture.acquisition_value
            asset.status = fixture.status
            asset.location = fixture.location
            asset.purchase_date = fixture.purchase_date
            asset.notes = fixture.notes
            asset.request_fingerprint = _checksum(payload)
            asset.updated_by_platform_user_id = actor_id
    session.flush()
    return len(bundle.inventory.assets)


def _seed_customers(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> None:
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    for fixture in bundle.customers.items:
        payload = fixture.model_dump(mode="json")
        customer_id = _stable_id(bundle.manifest.seed_version, "customer", fixture.seed_key)
        customer = _registered_entity(
            session,
            workspace_id,
            "customer",
            fixture.seed_key,
            customer_id,
            payload,
            Customer,
        )
        normalized_email = str(fixture.email).casefold() if fixture.email else None
        normalized_phone = (
            "".join(character for character in fixture.phone if character.isdigit())
            if fixture.phone
            else None
        )
        if customer is None:
            customer = Customer(
                id=customer_id,
                workspace_id=workspace_id,
                customer_type=fixture.customer_type,
                display_name=fixture.display_name,
                normalized_name=fixture.display_name.casefold(),
                first_name=fixture.first_name,
                last_name=fixture.last_name,
                business_name=fixture.business_name,
                email=str(fixture.email) if fixture.email else None,
                normalized_email=normalized_email,
                phone=fixture.phone,
                normalized_phone=normalized_phone,
                status=fixture.status,
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            session.add(customer)
            session.flush()
            _register(
                session,
                workspace_id,
                "customer",
                fixture.seed_key,
                customer_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            customer.customer_type = fixture.customer_type
            customer.display_name = fixture.display_name
            customer.normalized_name = fixture.display_name.casefold()
            customer.first_name = fixture.first_name
            customer.last_name = fixture.last_name
            customer.business_name = fixture.business_name
            customer.email = str(fixture.email) if fixture.email else None
            customer.normalized_email = normalized_email
            customer.phone = fixture.phone
            customer.normalized_phone = normalized_phone
            customer.status = fixture.status
            customer.updated_by_platform_user_id = actor_id
        _sync_customer_branches(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            customer,
            branches,
            fixture.branch_codes,
        )
    session.flush()


def _sync_customer_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    customer_seed_key: str,
    customer: Customer,
    branches: dict[str, Branch],
    branch_codes: list[str],
) -> None:
    existing = {
        row.branch_id: row
        for row in session.scalars(
            select(CustomerBranchAssignment).where(
                CustomerBranchAssignment.workspace_id == workspace_id,
                CustomerBranchAssignment.customer_id == customer.id,
            )
        )
    }
    selected_ids = {branches[code].id for code in branch_codes}
    for branch_id, assignment in existing.items():
        assignment.status = "active" if branch_id in selected_ids else "inactive"
    for code in branch_codes:
        branch = branches[code]
        if branch.id in existing:
            continue
        seed_key = f"{customer_seed_key}:{code}"
        payload = {"customerSeedKey": customer_seed_key, "branchCode": code}
        entity_id = _stable_id(bundle.manifest.seed_version, "customer_branch", seed_key)
        registered_assignment = _registered_entity(
            session,
            workspace_id,
            "customer_branch",
            seed_key,
            entity_id,
            payload,
            CustomerBranchAssignment,
        )
        if registered_assignment is None:
            session.add(
                CustomerBranchAssignment(
                    id=entity_id,
                    workspace_id=workspace_id,
                    customer_id=customer.id,
                    branch_id=branch.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "customer_branch",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _seed_employees(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> None:
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    employees: dict[str, Employee] = {}
    for fixture in bundle.employees.items:
        payload = fixture.model_dump(mode="json")
        employee_id = _stable_id(bundle.manifest.seed_version, "employee", fixture.seed_key)
        employee = _registered_entity(
            session,
            workspace_id,
            "employee",
            fixture.seed_key,
            employee_id,
            payload,
            Employee,
        )
        platform_user_id = (
            _stable_id(bundle.manifest.seed_version, "platform_user", fixture.user_seed_key)
            if fixture.user_seed_key
            else None
        )
        normalized_email = str(fixture.email).casefold() if fixture.email else None
        normalized_phone = (
            "".join(character for character in fixture.phone if character.isdigit())
            if fixture.phone
            else None
        )
        if employee is None:
            employee = Employee(
                id=employee_id,
                workspace_id=workspace_id,
                employee_number=fixture.employee_number,
                first_name=fixture.first_name,
                last_name=fixture.last_name,
                normalized_name=f"{fixture.first_name} {fixture.last_name}".casefold(),
                email=str(fixture.email) if fixture.email else None,
                normalized_email=normalized_email,
                phone=fixture.phone,
                normalized_phone=normalized_phone,
                position=fixture.position,
                department=fixture.department,
                contract_type=fixture.contract_type,
                hire_date=fixture.hire_date,
                platform_user_id=platform_user_id,
                status=fixture.status,
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            session.add(employee)
            session.flush()
            _register(
                session,
                workspace_id,
                "employee",
                fixture.seed_key,
                employee_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            employee.employee_number = fixture.employee_number
            employee.first_name = fixture.first_name
            employee.last_name = fixture.last_name
            employee.normalized_name = f"{fixture.first_name} {fixture.last_name}".casefold()
            employee.email = str(fixture.email) if fixture.email else None
            employee.normalized_email = normalized_email
            employee.phone = fixture.phone
            employee.normalized_phone = normalized_phone
            employee.position = fixture.position
            employee.department = fixture.department
            employee.contract_type = fixture.contract_type
            employee.hire_date = fixture.hire_date
            employee.platform_user_id = platform_user_id
            employee.status = fixture.status
            employee.updated_by_platform_user_id = actor_id
        employees[fixture.seed_key] = employee
        _sync_employee_branches(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            employee,
            branches,
            fixture.branch_codes,
        )
        _sync_employee_schedule(session, bundle, workspace_id, fixture, employee, actor_id)
        _sync_employee_hr_profile(session, bundle, workspace_id, fixture, employee, actor_id)

    for fixture in bundle.employees.items:
        _sync_employee_supervisors(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            employees[fixture.seed_key],
            employees,
            fixture.supervisor_seed_keys,
        )
    session.flush()


def _sync_employee_hr_profile(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    fixture: DemoEmployeeFixture,
    employee: Employee,
    actor_id: UUID,
) -> None:
    payload = fixture.future_hr
    entity_id = _stable_id(bundle.manifest.seed_version, "employee_hr_profile", fixture.seed_key)
    profile = _registered_entity(
        session,
        workspace_id,
        "employee_hr_profile",
        fixture.seed_key,
        entity_id,
        payload,
        EmployeeHrProfile,
    )
    values = {
        "initial_salary": Decimal(str(payload.get("initialSalary", 0))),
        "current_salary": Decimal(str(payload.get("salary", 0))),
        "vacation_days": int(payload.get("vacationDays", 0)),
        "bank_name": payload.get("bankName"),
        "bank_account_type": payload.get("bankAccountType"),
        "bank_account_number": payload.get("bankAccountNumber"),
        "bank_document": payload.get("bankDocument"),
    }
    if profile is None:
        profile = session.scalar(
            select(EmployeeHrProfile).where(
                EmployeeHrProfile.workspace_id == workspace_id,
                EmployeeHrProfile.employee_id == employee.id,
            )
        )
        if profile is None:
            profile = EmployeeHrProfile(
                id=entity_id,
                workspace_id=workspace_id,
                employee_id=employee.id,
                updated_by_platform_user_id=actor_id,
                **values,
            )
            session.add(profile)
        else:
            profile.id = entity_id
            for field, value in values.items():
                setattr(profile, field, value)
            profile.updated_by_platform_user_id = actor_id
        session.flush()
        _register(
            session,
            workspace_id,
            "employee_hr_profile",
            fixture.seed_key,
            entity_id,
            bundle.manifest.seed_version,
            payload,
        )
    else:
        for field, value in values.items():
            setattr(profile, field, value)
        profile.updated_by_platform_user_id = actor_id


def _seed_hr(session: Session, bundle: DemoBundle, workspace_id: UUID) -> None:
    for leave_fixture in bundle.hr.leave_requests:
        payload = leave_fixture.model_dump(mode="json")
        entity_id = _stable_id(
            bundle.manifest.seed_version, "hr_leave_request", leave_fixture.seed_key
        )
        record = _registered_entity(
            session,
            workspace_id,
            "hr_leave_request",
            leave_fixture.seed_key,
            entity_id,
            payload,
            HrLeaveRequest,
        )
        employee_id = _stable_id(
            bundle.manifest.seed_version, "employee", leave_fixture.employee_seed_key
        )
        requester_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            leave_fixture.requested_by_user_seed_key,
        )
        reviewer_id = (
            _stable_id(
                bundle.manifest.seed_version,
                "platform_user",
                leave_fixture.reviewed_by_user_seed_key,
            )
            if leave_fixture.reviewed_by_user_seed_key
            else None
        )
        if record is None:
            record = HrLeaveRequest(
                id=entity_id,
                workspace_id=workspace_id,
                employee_id=employee_id,
                start_date=leave_fixture.start_date,
                end_date=leave_fixture.end_date,
                reason=leave_fixture.reason,
                status=leave_fixture.status,
                requested_by_platform_user_id=requester_id,
                reviewed_by_platform_user_id=reviewer_id,
                reviewed_at=leave_fixture.reviewed_at,
            )
            session.add(record)
            session.flush()
            _register(
                session,
                workspace_id,
                "hr_leave_request",
                leave_fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            record.employee_id = employee_id
            record.start_date = leave_fixture.start_date
            record.end_date = leave_fixture.end_date
            record.reason = leave_fixture.reason
            record.status = leave_fixture.status
            record.requested_by_platform_user_id = requester_id
            record.reviewed_by_platform_user_id = reviewer_id
            record.reviewed_at = leave_fixture.reviewed_at

    for debt_fixture in bundle.hr.debts:
        payload = debt_fixture.model_dump(mode="json")
        debt_id = _stable_id(bundle.manifest.seed_version, "employee_debt", debt_fixture.seed_key)
        debt = _registered_entity(
            session,
            workspace_id,
            "employee_debt",
            debt_fixture.seed_key,
            debt_id,
            payload,
            EmployeeDebt,
        )
        employee_id = _stable_id(
            bundle.manifest.seed_version, "employee", debt_fixture.employee_seed_key
        )
        actor_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            debt_fixture.created_by_user_seed_key,
        )
        if debt is None:
            debt = EmployeeDebt(
                id=debt_id,
                workspace_id=workspace_id,
                employee_id=employee_id,
                concept=debt_fixture.concept,
                client_name=debt_fixture.client_name,
                amount=debt_fixture.amount,
                idempotency_key=(
                    f"demo:{bundle.manifest.seed_version}:debt:{debt_fixture.seed_key}"
                ),
                created_by_platform_user_id=actor_id,
            )
            session.add(debt)
            session.flush()
            _register(
                session,
                workspace_id,
                "employee_debt",
                debt_fixture.seed_key,
                debt_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            debt.employee_id = employee_id
            debt.concept = debt_fixture.concept
            debt.client_name = debt_fixture.client_name
            debt.amount = debt_fixture.amount
            debt.created_by_platform_user_id = actor_id

        for payment_fixture in debt_fixture.payments:
            payment_payload = payment_fixture.model_dump(mode="json")
            payment_id = _stable_id(
                bundle.manifest.seed_version,
                "employee_debt_payment",
                payment_fixture.seed_key,
            )
            payment = _registered_entity(
                session,
                workspace_id,
                "employee_debt_payment",
                payment_fixture.seed_key,
                payment_id,
                payment_payload,
                EmployeeDebtPayment,
            )
            received_by_id = _stable_id(
                bundle.manifest.seed_version,
                "platform_user",
                payment_fixture.received_by_user_seed_key,
            )
            if payment is None:
                payment = EmployeeDebtPayment(
                    id=payment_id,
                    workspace_id=workspace_id,
                    debt_id=debt.id,
                    amount=payment_fixture.amount,
                    paid_on=payment_fixture.paid_on,
                    idempotency_key=(
                        f"demo:{bundle.manifest.seed_version}:payment:{payment_fixture.seed_key}"
                    ),
                    received_by_platform_user_id=received_by_id,
                )
                session.add(payment)
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "employee_debt_payment",
                    payment_fixture.seed_key,
                    payment_id,
                    bundle.manifest.seed_version,
                    payment_payload,
                )
            else:
                payment.debt_id = debt.id
                payment.amount = payment_fixture.amount
                payment.paid_on = payment_fixture.paid_on
                payment.received_by_platform_user_id = received_by_id

    for document_fixture in bundle.hr.documents:
        payload = document_fixture.model_dump(mode="json")
        document_id = _stable_id(
            bundle.manifest.seed_version, "hr_document", document_fixture.seed_key
        )
        document = _registered_entity(
            session,
            workspace_id,
            "hr_document",
            document_fixture.seed_key,
            document_id,
            payload,
            HrDocumentRecord,
        )
        employee_id = _stable_id(
            bundle.manifest.seed_version, "employee", document_fixture.employee_seed_key
        )
        actor_id = _stable_id(
            bundle.manifest.seed_version,
            "platform_user",
            document_fixture.created_by_user_seed_key,
        )
        snapshot = {"employeeSeedKey": document_fixture.employee_seed_key}
        if document is None:
            document = HrDocumentRecord(
                id=document_id,
                workspace_id=workspace_id,
                employee_id=employee_id,
                template_id=document_fixture.template_id,
                issue_date=document_fixture.issue_date,
                include_salary=document_fixture.include_salary,
                reference_code=(
                    f"DEMO-{document_fixture.issue_date.year}-{document_fixture.seed_key.upper()}"
                ),
                snapshot=snapshot,
                idempotency_key=(
                    f"demo:{bundle.manifest.seed_version}:document:{document_fixture.seed_key}"
                ),
                created_by_platform_user_id=actor_id,
            )
            session.add(document)
            session.flush()
            _register(
                session,
                workspace_id,
                "hr_document",
                document_fixture.seed_key,
                document_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            document.employee_id = employee_id
            document.template_id = document_fixture.template_id
            document.issue_date = document_fixture.issue_date
            document.include_salary = document_fixture.include_salary
            document.snapshot = snapshot
            document.created_by_platform_user_id = actor_id
    session.flush()


def _sync_employee_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    employee_seed_key: str,
    employee: Employee,
    branches: dict[str, Branch],
    branch_codes: list[str],
) -> None:
    existing = {
        row.branch_id: row
        for row in session.scalars(
            select(EmployeeBranchAssignment).where(
                EmployeeBranchAssignment.workspace_id == workspace_id,
                EmployeeBranchAssignment.employee_id == employee.id,
            )
        )
    }
    selected_ids = {branches[code].id for code in branch_codes}
    for branch_id, assignment in existing.items():
        assignment.status = "active" if branch_id in selected_ids else "inactive"
    for code in branch_codes:
        branch = branches[code]
        if branch.id in existing:
            continue
        seed_key = f"{employee_seed_key}:{code}"
        payload = {"employeeSeedKey": employee_seed_key, "branchCode": code}
        entity_id = _stable_id(bundle.manifest.seed_version, "employee_branch", seed_key)
        if (
            _registered_entity(
                session,
                workspace_id,
                "employee_branch",
                seed_key,
                entity_id,
                payload,
                EmployeeBranchAssignment,
            )
            is None
        ):
            session.add(
                EmployeeBranchAssignment(
                    id=entity_id,
                    workspace_id=workspace_id,
                    employee_id=employee.id,
                    branch_id=branch.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "employee_branch",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _sync_employee_schedule(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    fixture: DemoEmployeeFixture,
    employee: Employee,
    actor_id: UUID,
) -> None:
    payload = {"timezone": fixture.timezone, "workSchedule": fixture.work_schedule}
    entity_id = _stable_id(bundle.manifest.seed_version, "employee_schedule", fixture.seed_key)
    schedule = _registered_entity(
        session,
        workspace_id,
        "employee_schedule",
        fixture.seed_key,
        entity_id,
        payload,
        EmployeeSchedule,
    )
    if schedule is None:
        schedule = EmployeeSchedule(
            id=entity_id,
            workspace_id=workspace_id,
            employee_id=employee.id,
            timezone=fixture.timezone,
            weekly_schedule=fixture.work_schedule,
            updated_by_platform_user_id=actor_id,
        )
        session.add(schedule)
        session.flush()
        _register(
            session,
            workspace_id,
            "employee_schedule",
            fixture.seed_key,
            entity_id,
            bundle.manifest.seed_version,
            payload,
        )
    else:
        schedule.timezone = fixture.timezone
        schedule.weekly_schedule = fixture.work_schedule
        schedule.updated_by_platform_user_id = actor_id


def _sync_employee_supervisors(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    employee_seed_key: str,
    employee: Employee,
    employees: dict[str, Employee],
    supervisor_seed_keys: list[str],
) -> None:
    existing = {
        row.supervisor_employee_id: row
        for row in session.scalars(
            select(EmployeeSupervisor).where(
                EmployeeSupervisor.workspace_id == workspace_id,
                EmployeeSupervisor.employee_id == employee.id,
            )
        )
    }
    selected_ids = {employees[key].id for key in supervisor_seed_keys}
    for supervisor_id, assignment in existing.items():
        assignment.status = "active" if supervisor_id in selected_ids else "inactive"
    for supervisor_seed_key in supervisor_seed_keys:
        supervisor = employees[supervisor_seed_key]
        if supervisor.id in existing:
            continue
        seed_key = f"{employee_seed_key}:{supervisor_seed_key}"
        payload = {"employeeSeedKey": employee_seed_key, "supervisorSeedKey": supervisor_seed_key}
        entity_id = _stable_id(bundle.manifest.seed_version, "employee_supervisor", seed_key)
        if (
            _registered_entity(
                session,
                workspace_id,
                "employee_supervisor",
                seed_key,
                entity_id,
                payload,
                EmployeeSupervisor,
            )
            is None
        ):
            session.add(
                EmployeeSupervisor(
                    id=entity_id,
                    workspace_id=workspace_id,
                    employee_id=employee.id,
                    supervisor_employee_id=supervisor.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "employee_supervisor",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _seed_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    legal_entity_id: UUID,
) -> dict[str, Branch]:
    branches = {
        branch.code: branch
        for branch in session.scalars(select(Branch).where(Branch.workspace_id == workspace_id))
    }
    for fixture in bundle.foundation.branches:
        payload = fixture.model_dump(mode="json")
        existing_branch = branches.get(fixture.code)
        registered_entity_id = session.scalar(
            select(DemoSeedRegistry.entity_id).where(
                DemoSeedRegistry.workspace_id == workspace_id,
                DemoSeedRegistry.entity_type == "branch",
                DemoSeedRegistry.seed_key == fixture.seed_key,
            )
        )
        entity_id = (
            registered_entity_id
            or (existing_branch.id if existing_branch is not None else None)
            or _stable_id(bundle.manifest.seed_version, "branch", fixture.seed_key)
        )
        branch: Branch | None
        if registered_entity_id is None and existing_branch is not None:
            branch = existing_branch
            _register(
                session,
                workspace_id,
                "branch",
                fixture.seed_key,
                branch.id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            branch = _registered_entity(
                session, workspace_id, "branch", fixture.seed_key, entity_id, payload, Branch
            )
        if branch is None:
            branch = Branch(
                id=entity_id,
                workspace_id=workspace_id,
                legal_entity_id=legal_entity_id,
                code=fixture.code,
                name=fixture.name,
                status="active",
                timezone=fixture.timezone,
                configuration={},
            )
            session.add(branch)
            session.flush()
            _register(
                session,
                workspace_id,
                "branch",
                fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            branch.code = fixture.code
            branch.name = fixture.name
            branch.timezone = fixture.timezone
            branch.status = "active"
        branches[branch.code] = branch

    for branch in branches.values():
        scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == workspace_id,
                AccessScope.scope_type == "branch",
                AccessScope.branch_id == branch.id,
            )
        )
        if scope is None:
            session.add(
                AccessScope(
                    workspace_id=workspace_id,
                    scope_type="branch",
                    legal_entity_id=branch.legal_entity_id,
                    branch_id=branch.id,
                )
            )
        _seed_appointment_resources(session, bundle, workspace_id, branch)
    session.flush()
    return branches


def _seed_appointment_resources(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branch: Branch,
) -> None:
    for code, name in DEFAULT_APPOINTMENT_RESOURCES:
        resource = session.scalar(
            select(AppointmentResource).where(
                AppointmentResource.workspace_id == workspace_id,
                AppointmentResource.branch_id == branch.id,
                AppointmentResource.code == code,
            )
        )
        if resource is None:
            resource = AppointmentResource(
                id=_stable_id(
                    bundle.manifest.seed_version,
                    "appointment_resource",
                    f"{branch.code}:{code}",
                ),
                workspace_id=workspace_id,
                branch_id=branch.id,
                code=code,
                name=name,
                resource_type="room",
                status="active",
            )
            session.add(resource)
        else:
            resource.name = name
            resource.resource_type = "room"
            resource.status = "active"


def _seed_role_permissions(session: Session, bundle: DemoBundle, workspace_id: UUID) -> None:
    roles = {
        role.code: role
        for role in session.scalars(select(Role).where(Role.workspace_id == workspace_id))
    }
    permissions = {
        permission.code: permission
        for permission in session.scalars(
            select(Permission).where(Permission.is_platform_only.is_(False))
        )
    }
    for role_code, permission_codes in bundle.iam.role_permissions.items():
        role = roles.get(role_code)
        if role is None:
            raise RuntimeError(f"Demo role {role_code!r} is not installed.")
        for permission_code in permission_codes:
            permission = permissions.get(permission_code)
            if permission is None:
                raise RuntimeError(f"Demo permission {permission_code!r} is not installed.")
            if (
                session.scalar(
                    select(RolePermission.id).where(
                        RolePermission.workspace_id == workspace_id,
                        RolePermission.role_id == role.id,
                        RolePermission.permission_id == permission.id,
                    )
                )
                is None
            ):
                session.add(
                    RolePermission(
                        workspace_id=workspace_id,
                        role_id=role.id,
                        permission_id=permission.id,
                    )
                )
    session.flush()


def _seed_users(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
    password_hash: str,
) -> None:
    now = datetime.now(UTC)
    roles = {
        role.code: role
        for role in session.scalars(select(Role).where(Role.workspace_id == workspace_id))
    }
    workspace_scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == "workspace",
        )
    )
    if workspace_scope is None:
        raise RuntimeError("The demo workspace scope is missing.")

    for fixture in bundle.iam.users:
        payload = fixture.model_dump(mode="json")
        user_id = _stable_id(bundle.manifest.seed_version, "platform_user", fixture.seed_key)
        user = _registered_entity(
            session,
            workspace_id,
            "platform_user",
            fixture.seed_key,
            user_id,
            payload,
            PlatformUser,
        )
        email = str(fixture.email).casefold()
        if user is None:
            user = PlatformUser(
                id=user_id,
                external_subject=f"demo:{bundle.manifest.seed_version}:{fixture.seed_key}",
                email=email,
                normalized_email=email,
                display_name=fixture.display_name,
                password_hash=password_hash,
                password_changed_at=now,
                status="active",
            )
            session.add(user)
            session.flush()
            _register(
                session,
                workspace_id,
                "platform_user",
                fixture.seed_key,
                user_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            user.email = email
            user.normalized_email = email
            user.display_name = fixture.display_name
            user.password_hash = password_hash
            user.password_changed_at = now
            user.status = "active"

        membership_id = _stable_id(bundle.manifest.seed_version, "membership", fixture.seed_key)
        membership = _registered_entity(
            session,
            workspace_id,
            "membership",
            fixture.seed_key,
            membership_id,
            payload,
            WorkspaceMembership,
        )
        if membership is None:
            membership = WorkspaceMembership(
                id=membership_id,
                workspace_id=workspace_id,
                platform_user_id=user.id,
                status=fixture.status,
                invited_at=now,
                activated_at=now if fixture.status == "active" else None,
                is_default=True,
            )
            session.add(membership)
            session.flush()
            _register(
                session,
                workspace_id,
                "membership",
                fixture.seed_key,
                membership_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            membership.status = fixture.status
            membership.is_default = True

        role = roles.get(fixture.role_code)
        if role is None:
            raise RuntimeError(f"Demo role {fixture.role_code!r} is not installed.")
        scopes = (
            [workspace_scope]
            if fixture.workspace_wide
            else [
                _branch_scope(session, workspace_id, branches[code].id)
                for code in fixture.branch_codes
            ]
        )
        for scope in scopes:
            assignment_key = f"{fixture.seed_key}:{scope.id}"
            assignment_payload = {"roleCode": role.code, "scopeId": str(scope.id)}
            assignment_id = _stable_id(
                bundle.manifest.seed_version,
                "role_assignment",
                assignment_key,
            )
            assignment = _registered_entity(
                session,
                workspace_id,
                "role_assignment",
                assignment_key,
                assignment_id,
                assignment_payload,
                RoleAssignment,
            )
            if assignment is None:
                session.add(
                    RoleAssignment(
                        id=assignment_id,
                        workspace_id=workspace_id,
                        membership_id=membership.id,
                        role_id=role.id,
                        access_scope_id=scope.id,
                        status="active",
                        valid_from=now,
                    )
                )
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "role_assignment",
                    assignment_key,
                    assignment_id,
                    bundle.manifest.seed_version,
                    assignment_payload,
                )
    session.flush()


def _seed_payment_methods(session: Session, bundle: DemoBundle, workspace_id: UUID) -> None:
    for fixture in bundle.configuration.payment_methods:
        payload = fixture.model_dump(mode="json")
        entity_id = _stable_id(bundle.manifest.seed_version, "payment_method", fixture.seed_key)
        method = _registered_entity(
            session,
            workspace_id,
            "payment_method",
            fixture.seed_key,
            entity_id,
            payload,
            PaymentMethod,
        )
        if method is None:
            method = PaymentMethod(
                id=entity_id,
                workspace_id=workspace_id,
                code=fixture.code,
                name=fixture.name,
                icon=fixture.icon,
                status="active" if fixture.enabled else "inactive",
                is_system=fixture.system,
            )
            session.add(method)
            session.flush()
            _register(
                session,
                workspace_id,
                "payment_method",
                fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            method.code = fixture.code
            method.name = fixture.name
            method.icon = fixture.icon
            method.status = "active" if fixture.enabled else "inactive"
            method.is_system = fixture.system
    session.flush()


def _branch_scope(session: Session, workspace_id: UUID, branch_id: UUID) -> AccessScope:
    scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == "branch",
            AccessScope.branch_id == branch_id,
        )
    )
    if scope is None:
        raise RuntimeError("The demo branch scope is missing.")
    return scope


def _registered_entity[ModelT](
    session: Session,
    workspace_id: UUID,
    entity_type: str,
    seed_key: str,
    entity_id: UUID,
    payload: Mapping[str, object],
    model: type[ModelT],
) -> ModelT | None:
    registry = session.scalar(
        select(DemoSeedRegistry).where(
            DemoSeedRegistry.workspace_id == workspace_id,
            DemoSeedRegistry.entity_type == entity_type,
            DemoSeedRegistry.seed_key == seed_key,
        )
    )
    if registry is None:
        if session.get(model, entity_id) is not None:
            raise RuntimeError("A demo UUID exists without a seed registry claim.")
        return None
    if registry.entity_id != entity_id:
        raise RuntimeError("The registered demo UUID does not match the manifest identity.")
    checksum = _checksum(payload)
    if registry.checksum != checksum:
        registry.checksum = checksum
        registry.version += 1
    entity = session.get(model, entity_id)
    if entity is None:
        raise RuntimeError("A registered demo entity is missing.")
    return entity


def _register(
    session: Session,
    workspace_id: UUID,
    entity_type: str,
    seed_key: str,
    entity_id: UUID,
    seed_version: str,
    payload: Mapping[str, object],
) -> None:
    session.add(
        DemoSeedRegistry(
            workspace_id=workspace_id,
            entity_type=entity_type,
            seed_key=seed_key,
            entity_id=entity_id,
            seed_version=seed_version,
            checksum=_checksum(payload),
        )
    )
    session.flush()


def _stable_id(seed_version: str, entity_type: str, seed_key: str) -> UUID:
    return uuid5(_DEMO_NAMESPACE, f"{seed_version}:{entity_type}:{seed_key}")


def _checksum(payload: Mapping[str, object]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
