from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from sqlalchemy import ColumnElement, exists, false, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.db.models import (
    Appointment,
    Asset,
    AssetCategory,
    AuditEntry,
    Branch,
    Employee,
    EmployeeBranchAssignment,
    InventoryItemProfile,
    InventoryMovement,
    InventoryMovementLine,
    InventoryStockBalance,
    InventoryWarehouse,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    PlatformUser,
    UnitOfMeasure,
)

_TRACKED_TYPES = ("product", "supply")
_INVENTORY_TYPES = ("product", "service", "supply")


@dataclass(frozen=True)
class InventorySummaryRecord:
    total_products: int
    total_supplies: int
    low_stock: int
    out_of_stock: int
    total_value: Decimal


@dataclass(frozen=True)
class BranchRecord:
    id: UUID
    code: str
    name: str


@dataclass(frozen=True)
class WarehouseRecord:
    warehouse: InventoryWarehouse
    branch: BranchRecord


@dataclass(frozen=True)
class StockLocationRecord:
    balance: InventoryStockBalance
    warehouse_name: str
    branch: BranchRecord


@dataclass(frozen=True)
class InventoryItemRecord:
    item: Item
    category: ItemCategory
    unit: UnitOfMeasure
    profile: InventoryItemProfile | None
    branches: tuple[BranchRecord, ...]
    stock_locations: tuple[StockLocationRecord, ...]
    stock_quantity: Decimal | None
    minimum_stock: Decimal | None


@dataclass(frozen=True)
class InventoryItemPage:
    items: tuple[InventoryItemRecord, ...]
    total_items: int


@dataclass(frozen=True)
class AssetRecord:
    asset: Asset
    category: AssetCategory
    branch: BranchRecord


@dataclass(frozen=True)
class AssetPage:
    items: tuple[AssetRecord, ...]
    total_items: int


@dataclass(frozen=True)
class AssetSummaryRecord:
    total_value: Decimal
    operational: int
    in_repair: int
    retired: int


@dataclass(frozen=True)
class MovementRecord:
    movement: InventoryMovement
    warehouse: InventoryWarehouse
    branch: BranchRecord
    employee_name: str | None
    appointment_label: str | None
    created_by_name: str
    lines: tuple[InventoryMovementLine, ...]


@dataclass(frozen=True)
class MovementPage:
    items: tuple[MovementRecord, ...]
    total_items: int


@dataclass(frozen=True)
class LockedStockRecord:
    balance: InventoryStockBalance
    item: Item
    unit: UnitOfMeasure
    profile: InventoryItemProfile | None


@dataclass(frozen=True)
class SupplyUsageRecord:
    employee_id: UUID
    employee_name: str
    supply_id: UUID
    supply_name: str
    quantity: Decimal
    appointments_count: int


class InventoryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def inventory_summary(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> InventorySummaryRecord:
        quantity = self._stock_sum_expression(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
            field=InventoryStockBalance.quantity,
        )
        minimum = self._stock_sum_expression(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
            field=InventoryStockBalance.minimum_quantity,
        )
        base = (
            select(
                Item.id.label("item_id"),
                Item.item_type.label("item_type"),
                quantity.label("quantity"),
                minimum.label("minimum_quantity"),
                func.coalesce(
                    InventoryItemProfile.unit_cost,
                    InventoryItemProfile.sale_price,
                    Decimal("0"),
                ).label("valuation_cost"),
            )
            .outerjoin(
                InventoryItemProfile,
                (InventoryItemProfile.workspace_id == Item.workspace_id)
                & (InventoryItemProfile.item_id == Item.id),
            )
            .where(
                Item.workspace_id == workspace_id,
                Item.item_type.in_(_TRACKED_TYPES),
                Item.status != "archived",
                self._item_visibility_predicate(workspace_id, visible_branch_ids, branch_id),
            )
            .subquery()
        )
        row = self._session.execute(
            select(
                func.count().filter(base.c.item_type == "product"),
                func.count().filter(base.c.item_type == "supply"),
                func.count().filter(
                    (base.c.quantity > 0) & (base.c.quantity <= base.c.minimum_quantity)
                ),
                func.count().filter(base.c.quantity == 0),
                func.coalesce(func.sum(base.c.quantity * base.c.valuation_cost), Decimal("0")),
            )
        ).one()
        return InventorySummaryRecord(
            total_products=int(row[0] or 0),
            total_supplies=int(row[1] or 0),
            low_stock=int(row[2] or 0),
            out_of_stock=int(row[3] or 0),
            total_value=Decimal(row[4] or 0),
        )

    def list_warehouses(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> tuple[WarehouseRecord, ...]:
        predicates: list[ColumnElement[bool]] = [
            InventoryWarehouse.workspace_id == workspace_id,
            InventoryWarehouse.status != "archived",
        ]
        if visible_branch_ids is not None:
            predicates.append(InventoryWarehouse.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(InventoryWarehouse.branch_id == branch_id)
        rows = self._session.execute(
            select(InventoryWarehouse, Branch.id, Branch.code, Branch.name)
            .join(
                Branch,
                (Branch.workspace_id == InventoryWarehouse.workspace_id)
                & (Branch.id == InventoryWarehouse.branch_id),
            )
            .where(*predicates)
            .order_by(Branch.name, InventoryWarehouse.name, InventoryWarehouse.id)
        )
        return tuple(
            WarehouseRecord(
                warehouse=row[0],
                branch=BranchRecord(id=row[1], code=row[2], name=row[3]),
            )
            for row in rows
        )

    def get_warehouse(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        warehouse_id: UUID | None,
    ) -> InventoryWarehouse | None:
        predicates = [
            InventoryWarehouse.workspace_id == workspace_id,
            InventoryWarehouse.branch_id == branch_id,
            InventoryWarehouse.status == "active",
        ]
        if warehouse_id is None:
            predicates.append(InventoryWarehouse.is_default.is_(True))
        else:
            predicates.append(InventoryWarehouse.id == warehouse_id)
        return self._session.scalar(select(InventoryWarehouse).where(*predicates))

    def list_items(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        item_type: str | None,
        category_id: UUID | None,
        status: str | None,
        stock_status: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> InventoryItemPage:
        quantity = self._stock_sum_expression(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
            field=InventoryStockBalance.quantity,
        )
        minimum = self._stock_sum_expression(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
            field=InventoryStockBalance.minimum_quantity,
        )
        predicates: list[ColumnElement[bool]] = [
            Item.workspace_id == workspace_id,
            Item.item_type.in_(_INVENTORY_TYPES),
            self._item_visibility_predicate(workspace_id, visible_branch_ids, branch_id),
        ]
        if search:
            predicates.append(
                or_(
                    func.lower(Item.name).contains(search.casefold()),
                    func.lower(Item.sku).contains(search.casefold()),
                )
            )
        if item_type is not None:
            predicates.append(Item.item_type == item_type)
        if category_id is not None:
            predicates.append(Item.category_id == category_id)
        if status is None:
            predicates.append(Item.status != "archived")
        else:
            predicates.append(Item.status == status)
        if stock_status == "out":
            predicates.extend((Item.item_type.in_(_TRACKED_TYPES), quantity == 0))
        elif stock_status == "low":
            predicates.extend(
                (Item.item_type.in_(_TRACKED_TYPES), quantity > 0, quantity <= minimum)
            )
        elif stock_status == "available":
            predicates.extend((Item.item_type.in_(_TRACKED_TYPES), quantity > minimum))

        base = (
            select(
                Item,
                ItemCategory,
                UnitOfMeasure,
                InventoryItemProfile,
                quantity.label("stock_quantity"),
                minimum.label("minimum_stock"),
            )
            .join(
                ItemCategory,
                (ItemCategory.workspace_id == Item.workspace_id)
                & (ItemCategory.id == Item.category_id),
            )
            .join(
                UnitOfMeasure,
                (UnitOfMeasure.workspace_id == Item.workspace_id)
                & (UnitOfMeasure.id == Item.unit_of_measure_id),
            )
            .outerjoin(
                InventoryItemProfile,
                (InventoryItemProfile.workspace_id == Item.workspace_id)
                & (InventoryItemProfile.item_id == Item.id),
            )
            .where(*predicates)
        )
        total_items = (
            self._session.scalar(
                select(func.count()).select_from(
                    base.with_only_columns(Item.id).order_by(None).subquery()
                )
            )
            or 0
        )
        order_fields: dict[str, Any] = {
            "name": func.lower(Item.name),
            "sku": Item.sku,
            "itemType": Item.item_type,
            "stock": quantity,
            "minimumStock": minimum,
            "createdAt": Item.created_at,
            "updatedAt": Item.updated_at,
        }
        order_field = order_fields[sort_by]
        order = (
            order_field.desc().nulls_last()
            if sort_direction == "desc"
            else order_field.asc().nulls_last()
        )
        rows = self._session.execute(
            base.order_by(order, Item.id).offset((page - 1) * page_size).limit(page_size)
        ).all()
        item_ids = [row[0].id for row in rows]
        branches = self._branches_by_item(workspace_id, item_ids, visible_branch_ids)
        locations = self._stock_locations_by_item(
            workspace_id,
            item_ids,
            visible_branch_ids,
            branch_id,
        )
        return InventoryItemPage(
            items=tuple(
                InventoryItemRecord(
                    item=row[0],
                    category=row[1],
                    unit=row[2],
                    profile=row[3],
                    branches=branches.get(row[0].id, ()),
                    stock_locations=locations.get(row[0].id, ()),
                    stock_quantity=(
                        Decimal(row[4] or 0) if row[0].item_type in _TRACKED_TYPES else None
                    ),
                    minimum_stock=(
                        Decimal(row[5] or 0) if row[0].item_type in _TRACKED_TYPES else None
                    ),
                )
                for row in rows
            ),
            total_items=int(total_items),
        )

    def get_item(
        self,
        *,
        workspace_id: UUID,
        item_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None = None,
    ) -> InventoryItemRecord | None:
        quantity = self._stock_sum_expression(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
            field=InventoryStockBalance.quantity,
        )
        minimum = self._stock_sum_expression(
            workspace_id=workspace_id,
            visible_branch_ids=visible_branch_ids,
            branch_id=branch_id,
            field=InventoryStockBalance.minimum_quantity,
        )
        row = self._session.execute(
            select(
                Item,
                ItemCategory,
                UnitOfMeasure,
                InventoryItemProfile,
                quantity,
                minimum,
            )
            .join(
                ItemCategory,
                (ItemCategory.workspace_id == Item.workspace_id)
                & (ItemCategory.id == Item.category_id),
            )
            .join(
                UnitOfMeasure,
                (UnitOfMeasure.workspace_id == Item.workspace_id)
                & (UnitOfMeasure.id == Item.unit_of_measure_id),
            )
            .outerjoin(
                InventoryItemProfile,
                (InventoryItemProfile.workspace_id == Item.workspace_id)
                & (InventoryItemProfile.item_id == Item.id),
            )
            .where(
                Item.workspace_id == workspace_id,
                Item.id == item_id,
                Item.item_type.in_(_INVENTORY_TYPES),
                self._item_visibility_predicate(workspace_id, visible_branch_ids, branch_id),
            )
        ).one_or_none()
        if row is None:
            return None
        branches = self._branches_by_item(workspace_id, [item_id], visible_branch_ids)
        locations = self._stock_locations_by_item(
            workspace_id, [item_id], visible_branch_ids, branch_id
        )
        return InventoryItemRecord(
            item=row[0],
            category=row[1],
            unit=row[2],
            profile=row[3],
            branches=branches.get(item_id, ()),
            stock_locations=locations.get(item_id, ()),
            stock_quantity=(Decimal(row[4] or 0) if row[0].item_type in _TRACKED_TYPES else None),
            minimum_stock=(Decimal(row[5] or 0) if row[0].item_type in _TRACKED_TYPES else None),
        )

    def item_by_creation_key(
        self,
        workspace_id: UUID,
        idempotency_key: str,
    ) -> tuple[UUID, str | None] | None:
        row = self._session.execute(
            select(InventoryItemProfile.item_id, InventoryItemProfile.request_fingerprint).where(
                InventoryItemProfile.workspace_id == workspace_id,
                InventoryItemProfile.creation_idempotency_key == idempotency_key,
            )
        ).one_or_none()
        return (row[0], row[1]) if row is not None else None

    def item_sku_exists(self, workspace_id: UUID, sku: str, exclude_id: UUID | None = None) -> bool:
        predicates: list[ColumnElement[bool]] = [
            Item.workspace_id == workspace_id,
            Item.sku == sku,
        ]
        if exclude_id is not None:
            predicates.append(Item.id != exclude_id)
        return self._session.scalar(select(exists().where(*predicates))) is True

    def get_active_category(self, workspace_id: UUID, category_id: UUID) -> ItemCategory | None:
        return self._session.scalar(
            select(ItemCategory).where(
                ItemCategory.workspace_id == workspace_id,
                ItemCategory.id == category_id,
                ItemCategory.status == "active",
            )
        )

    def get_active_unit(self, workspace_id: UUID, unit_id: UUID) -> UnitOfMeasure | None:
        return self._session.scalar(
            select(UnitOfMeasure).where(
                UnitOfMeasure.workspace_id == workspace_id,
                UnitOfMeasure.id == unit_id,
                UnitOfMeasure.status == "active",
            )
        )

    def get_active_branch(self, workspace_id: UUID, branch_id: UUID) -> Branch | None:
        return self._session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
                Branch.status == "active",
            )
        )

    def create_item(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        item_type: str,
        name: str,
        description: str | None,
        sku: str | None,
        category_id: UUID,
        unit_of_measure_id: UUID,
        branch_id: UUID,
        warehouse: InventoryWarehouse,
        sale_price: Decimal | None,
        unit_cost: Decimal | None,
        tax_rate: Decimal,
        stock: Decimal | None,
        minimum_stock: Decimal | None,
        status: str,
        idempotency_key: str,
        request_fingerprint: str,
        request_id: str,
    ) -> UUID:
        item = Item(
            workspace_id=workspace_id,
            category_id=category_id,
            unit_of_measure_id=unit_of_measure_id,
            item_type=item_type,
            name=name,
            description=description,
            sku=sku,
            status=status,
        )
        self._session.add(item)
        self._session.flush()
        self._session.add(
            ItemBranchAssignment(
                workspace_id=workspace_id,
                item_id=item.id,
                branch_id=branch_id,
                status="active",
            )
        )
        profile = InventoryItemProfile(
            workspace_id=workspace_id,
            item_id=item.id,
            sale_price=sale_price,
            unit_cost=unit_cost,
            tax_rate=tax_rate,
            creation_idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
        )
        self._session.add(profile)
        self._session.flush()
        if item_type in _TRACKED_TYPES:
            balance = InventoryStockBalance(
                workspace_id=workspace_id,
                branch_id=branch_id,
                warehouse_id=warehouse.id,
                item_id=item.id,
                quantity=stock or Decimal("0"),
                minimum_quantity=minimum_stock or Decimal("0"),
            )
            self._session.add(balance)
            self._session.flush()
            if balance.quantity > 0:
                movement = InventoryMovement(
                    workspace_id=workspace_id,
                    branch_id=branch_id,
                    warehouse_id=warehouse.id,
                    movement_type="opening",
                    employee_id=None,
                    appointment_id=None,
                    comment="Existencia inicial",
                    idempotency_key=f"opening:{item.id}",
                    request_fingerprint=request_fingerprint,
                    created_by_platform_user_id=actor_platform_user_id,
                )
                self._session.add(movement)
                self._session.flush()
                unit_symbol = self._session.scalar(
                    select(UnitOfMeasure.symbol).where(UnitOfMeasure.id == unit_of_measure_id)
                )
                self._session.add(
                    InventoryMovementLine(
                        workspace_id=workspace_id,
                        movement_id=movement.id,
                        item_id=item.id,
                        quantity_delta=balance.quantity,
                        quantity_before=Decimal("0"),
                        quantity_after=balance.quantity,
                        unit_cost_snapshot=unit_cost,
                        item_name=item.name,
                        item_sku=item.sku,
                        unit_symbol=unit_symbol or "ud",
                    )
                )
        self.add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action=f"inventory.{item_type}.create",
            target_type="item",
            target_id=item.id,
            request_id=request_id,
            details={
                "branchId": str(branch_id),
                "warehouseId": str(warehouse.id),
                "stock": str(stock) if stock is not None else None,
            },
        )
        self._session.flush()
        return item.id

    def get_item_for_update(self, workspace_id: UUID, item_id: UUID) -> Item | None:
        return self._session.scalar(
            select(Item)
            .where(
                Item.workspace_id == workspace_id,
                Item.id == item_id,
                Item.item_type.in_(_INVENTORY_TYPES),
            )
            .with_for_update()
        )

    def get_profile(self, workspace_id: UUID, item_id: UUID) -> InventoryItemProfile | None:
        return self._session.scalar(
            select(InventoryItemProfile).where(
                InventoryItemProfile.workspace_id == workspace_id,
                InventoryItemProfile.item_id == item_id,
            )
        )

    def ensure_profile(self, workspace_id: UUID, item_id: UUID) -> InventoryItemProfile:
        profile = self.get_profile(workspace_id, item_id)
        if profile is None:
            profile = InventoryItemProfile(
                workspace_id=workspace_id,
                item_id=item_id,
                sale_price=None,
                unit_cost=None,
                tax_rate=Decimal("0"),
            )
            self._session.add(profile)
            self._session.flush()
        return profile

    def get_balance_for_update(
        self,
        *,
        workspace_id: UUID,
        item_id: UUID,
        branch_id: UUID,
        warehouse_id: UUID,
    ) -> InventoryStockBalance | None:
        return self._session.scalar(
            select(InventoryStockBalance)
            .where(
                InventoryStockBalance.workspace_id == workspace_id,
                InventoryStockBalance.item_id == item_id,
                InventoryStockBalance.branch_id == branch_id,
                InventoryStockBalance.warehouse_id == warehouse_id,
            )
            .with_for_update()
        )

    def ensure_balance_for_update(
        self,
        *,
        workspace_id: UUID,
        item_id: UUID,
        branch_id: UUID,
        warehouse_id: UUID,
    ) -> InventoryStockBalance:
        balance = self.get_balance_for_update(
            workspace_id=workspace_id,
            item_id=item_id,
            branch_id=branch_id,
            warehouse_id=warehouse_id,
        )
        if balance is None:
            balance = InventoryStockBalance(
                workspace_id=workspace_id,
                item_id=item_id,
                branch_id=branch_id,
                warehouse_id=warehouse_id,
                quantity=Decimal("0"),
                minimum_quantity=Decimal("0"),
            )
            self._session.add(balance)
            self._session.flush()
        return balance

    def active_item_branch_ids(self, workspace_id: UUID, item_id: UUID) -> set[UUID]:
        return set(
            self._session.scalars(
                select(ItemBranchAssignment.branch_id).where(
                    ItemBranchAssignment.workspace_id == workspace_id,
                    ItemBranchAssignment.item_id == item_id,
                    ItemBranchAssignment.status == "active",
                )
            )
        )

    def update_item(
        self,
        *,
        item: Item,
        profile: InventoryItemProfile,
        balance: InventoryStockBalance | None,
        changes: dict[str, object],
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        for field in ("name", "description", "sku", "category_id", "unit_of_measure_id", "status"):
            if field in changes:
                setattr(item, field, changes[field])
        for field in ("sale_price", "unit_cost", "tax_rate"):
            if field in changes:
                setattr(profile, field, changes[field])
        if "minimum_stock" in changes and balance is not None:
            balance.minimum_quantity = cast(Decimal, changes["minimum_stock"])
            balance.version += 1
        item.version += 1
        self.add_audit(
            workspace_id=item.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="inventory.item.update",
            target_type="item",
            target_id=item.id,
            request_id=request_id,
            details={"changedFields": sorted(changes), "version": item.version},
        )
        self._session.flush()

    def list_asset_categories(self, workspace_id: UUID) -> tuple[AssetCategory, ...]:
        return tuple(
            self._session.scalars(
                select(AssetCategory)
                .where(
                    AssetCategory.workspace_id == workspace_id,
                    AssetCategory.status != "archived",
                )
                .order_by(AssetCategory.name, AssetCategory.id)
            )
        )

    def get_active_asset_category(
        self, workspace_id: UUID, category_id: UUID
    ) -> AssetCategory | None:
        return self._session.scalar(
            select(AssetCategory).where(
                AssetCategory.workspace_id == workspace_id,
                AssetCategory.id == category_id,
                AssetCategory.status == "active",
            )
        )

    def asset_category_exists(self, workspace_id: UUID, code: str, name_key: str) -> bool:
        return (
            self._session.scalar(
                select(
                    exists().where(
                        AssetCategory.workspace_id == workspace_id,
                        or_(
                            AssetCategory.code == code,
                            AssetCategory.normalized_name == name_key,
                        ),
                    )
                )
            )
            is True
        )

    def create_asset_category(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        code: str,
        name: str,
        normalized_name: str,
        request_id: str,
    ) -> AssetCategory:
        category = AssetCategory(
            workspace_id=workspace_id,
            code=code,
            name=name,
            normalized_name=normalized_name,
            status="active",
        )
        self._session.add(category)
        self._session.flush()
        self.add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="inventory.asset_category.create",
            target_type="asset_category",
            target_id=category.id,
            request_id=request_id,
            details={"code": code},
        )
        return category

    def asset_summary(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> AssetSummaryRecord:
        predicates: list[ColumnElement[bool]] = [Asset.workspace_id == workspace_id]
        if visible_branch_ids is not None:
            predicates.append(Asset.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(Asset.branch_id == branch_id)
        row = self._session.execute(
            select(
                func.coalesce(
                    func.sum(Asset.acquisition_value).filter(Asset.status != "baja"),
                    Decimal("0"),
                ),
                func.count().filter(Asset.status == "activo"),
                func.count().filter(Asset.status == "reparacion"),
                func.count().filter(Asset.status == "baja"),
            ).where(*predicates)
        ).one()
        return AssetSummaryRecord(
            total_value=Decimal(row[0] or 0),
            operational=int(row[1] or 0),
            in_repair=int(row[2] or 0),
            retired=int(row[3] or 0),
        )

    def list_assets(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        category_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> AssetPage:
        predicates: list[ColumnElement[bool]] = [Asset.workspace_id == workspace_id]
        if visible_branch_ids is not None:
            predicates.append(Asset.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(Asset.branch_id == branch_id)
        if search:
            predicates.append(
                or_(
                    func.lower(Asset.name).contains(search.casefold()),
                    func.lower(Asset.code).contains(search.casefold()),
                    func.lower(Asset.location).contains(search.casefold()),
                )
            )
        if category_id is not None:
            predicates.append(Asset.category_id == category_id)
        if status is not None:
            predicates.append(Asset.status == status)
        base = (
            select(Asset, AssetCategory, Branch.id, Branch.code, Branch.name)
            .join(
                AssetCategory,
                (AssetCategory.workspace_id == Asset.workspace_id)
                & (AssetCategory.id == Asset.category_id),
            )
            .join(
                Branch,
                (Branch.workspace_id == Asset.workspace_id) & (Branch.id == Asset.branch_id),
            )
            .where(*predicates)
        )
        total_items = (
            self._session.scalar(
                select(func.count()).select_from(
                    base.with_only_columns(Asset.id).order_by(None).subquery()
                )
            )
            or 0
        )
        order_fields: dict[str, Any] = {
            "name": func.lower(Asset.name),
            "code": Asset.code,
            "category": func.lower(AssetCategory.name),
            "status": Asset.status,
            "value": Asset.acquisition_value,
            "createdAt": Asset.created_at,
        }
        order_field = order_fields[sort_by]
        order = (
            order_field.desc().nulls_last()
            if sort_direction == "desc"
            else order_field.asc().nulls_last()
        )
        rows = self._session.execute(
            base.order_by(order, Asset.id).offset((page - 1) * page_size).limit(page_size)
        )
        return AssetPage(
            items=tuple(
                AssetRecord(
                    asset=row[0],
                    category=row[1],
                    branch=BranchRecord(id=row[2], code=row[3], name=row[4]),
                )
                for row in rows
            ),
            total_items=int(total_items),
        )

    def get_asset(
        self,
        *,
        workspace_id: UUID,
        asset_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> AssetRecord | None:
        predicates: list[ColumnElement[bool]] = [
            Asset.workspace_id == workspace_id,
            Asset.id == asset_id,
        ]
        if visible_branch_ids is not None:
            predicates.append(Asset.branch_id.in_(visible_branch_ids))
        row = self._session.execute(
            select(Asset, AssetCategory, Branch.id, Branch.code, Branch.name)
            .join(
                AssetCategory,
                (AssetCategory.workspace_id == Asset.workspace_id)
                & (AssetCategory.id == Asset.category_id),
            )
            .join(
                Branch,
                (Branch.workspace_id == Asset.workspace_id) & (Branch.id == Asset.branch_id),
            )
            .where(*predicates)
        ).one_or_none()
        if row is None:
            return None
        return AssetRecord(
            asset=row[0],
            category=row[1],
            branch=BranchRecord(id=row[2], code=row[3], name=row[4]),
        )

    def asset_by_creation_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> tuple[UUID, str | None] | None:
        row = self._session.execute(
            select(Asset.id, Asset.request_fingerprint).where(
                Asset.workspace_id == workspace_id,
                Asset.creation_idempotency_key == idempotency_key,
            )
        ).one_or_none()
        return (row[0], row[1]) if row is not None else None

    def asset_code_exists(
        self, workspace_id: UUID, code: str, exclude_id: UUID | None = None
    ) -> bool:
        predicates: list[ColumnElement[bool]] = [
            Asset.workspace_id == workspace_id,
            Asset.code == code,
        ]
        if exclude_id is not None:
            predicates.append(Asset.id != exclude_id)
        return self._session.scalar(select(exists().where(*predicates))) is True

    def create_asset(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        values: dict[str, object],
        idempotency_key: str,
        request_fingerprint: str,
        request_id: str,
    ) -> UUID:
        asset = Asset(
            workspace_id=workspace_id,
            created_by_platform_user_id=actor_platform_user_id,
            updated_by_platform_user_id=actor_platform_user_id,
            creation_idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            **values,
        )
        self._session.add(asset)
        self._session.flush()
        self.add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="inventory.asset.create",
            target_type="asset",
            target_id=asset.id,
            request_id=request_id,
            details={"branchId": str(asset.branch_id), "status": asset.status},
        )
        return asset.id

    def get_asset_for_update(self, workspace_id: UUID, asset_id: UUID) -> Asset | None:
        return self._session.scalar(
            select(Asset)
            .where(Asset.workspace_id == workspace_id, Asset.id == asset_id)
            .with_for_update()
        )

    def update_asset(
        self,
        *,
        asset: Asset,
        changes: dict[str, object],
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        for field, value in changes.items():
            setattr(asset, field, value)
        asset.updated_by_platform_user_id = actor_platform_user_id
        asset.version += 1
        self.add_audit(
            workspace_id=asset.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="inventory.asset.update",
            target_type="asset",
            target_id=asset.id,
            request_id=request_id,
            details={"changedFields": sorted(changes), "version": asset.version},
        )
        self._session.flush()

    def movement_by_idempotency_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> InventoryMovement | None:
        return self._session.scalar(
            select(InventoryMovement).where(
                InventoryMovement.workspace_id == workspace_id,
                InventoryMovement.idempotency_key == idempotency_key,
            )
        )

    def get_employee_name(
        self, *, workspace_id: UUID, branch_id: UUID, employee_id: UUID
    ) -> str | None:
        return self._session.scalar(
            select(func.concat(Employee.first_name, " ", Employee.last_name))
            .join(
                EmployeeBranchAssignment,
                (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                & (EmployeeBranchAssignment.employee_id == Employee.id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                Employee.id == employee_id,
                Employee.status == "active",
                EmployeeBranchAssignment.branch_id == branch_id,
                EmployeeBranchAssignment.status == "active",
            )
        )

    def get_appointment_label(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        appointment_id: UUID,
        employee_id: UUID,
    ) -> str | None:
        return self._session.scalar(
            select(func.concat(Appointment.customer_name, " · ", Appointment.service_name)).where(
                Appointment.workspace_id == workspace_id,
                Appointment.id == appointment_id,
                Appointment.branch_id == branch_id,
                Appointment.employee_id == employee_id,
            )
        )

    def lock_stock_records(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        warehouse_id: UUID,
        item_ids: set[UUID],
        require_active_items: bool = True,
    ) -> tuple[LockedStockRecord, ...]:
        statement = (
            select(
                InventoryStockBalance,
                Item,
                UnitOfMeasure,
                InventoryItemProfile,
            )
            .join(
                Item,
                (Item.workspace_id == InventoryStockBalance.workspace_id)
                & (Item.id == InventoryStockBalance.item_id),
            )
            .join(
                UnitOfMeasure,
                (UnitOfMeasure.workspace_id == Item.workspace_id)
                & (UnitOfMeasure.id == Item.unit_of_measure_id),
            )
            .outerjoin(
                InventoryItemProfile,
                (InventoryItemProfile.workspace_id == Item.workspace_id)
                & (InventoryItemProfile.item_id == Item.id),
            )
            .where(
                InventoryStockBalance.workspace_id == workspace_id,
                InventoryStockBalance.branch_id == branch_id,
                InventoryStockBalance.warehouse_id == warehouse_id,
                InventoryStockBalance.item_id.in_(item_ids),
                Item.item_type.in_(_TRACKED_TYPES),
            )
            .order_by(InventoryStockBalance.item_id)
            .with_for_update(of=InventoryStockBalance)
        )
        if require_active_items:
            statement = statement.where(Item.status == "active")
        rows = self._session.execute(statement)
        return tuple(
            LockedStockRecord(balance=row[0], item=row[1], unit=row[2], profile=row[3])
            for row in rows
        )

    def create_movement(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        warehouse_id: UUID,
        movement_type: str,
        employee_id: UUID | None,
        appointment_id: UUID | None,
        comment: str | None,
        idempotency_key: str,
        request_fingerprint: str,
        actor_platform_user_id: UUID,
        changes: list[tuple[LockedStockRecord, Decimal]],
        request_id: str,
    ) -> UUID:
        movement = InventoryMovement(
            workspace_id=workspace_id,
            branch_id=branch_id,
            warehouse_id=warehouse_id,
            movement_type=movement_type,
            employee_id=employee_id,
            appointment_id=appointment_id,
            comment=comment,
            idempotency_key=idempotency_key,
            request_fingerprint=request_fingerprint,
            created_by_platform_user_id=actor_platform_user_id,
        )
        self._session.add(movement)
        self._session.flush()
        for record, new_quantity in changes:
            before = Decimal(record.balance.quantity)
            delta = new_quantity - before
            record.balance.quantity = new_quantity
            record.balance.version += 1
            self._session.add(
                InventoryMovementLine(
                    workspace_id=workspace_id,
                    movement_id=movement.id,
                    item_id=record.item.id,
                    quantity_delta=delta,
                    quantity_before=before,
                    quantity_after=new_quantity,
                    unit_cost_snapshot=(record.profile.unit_cost if record.profile else None),
                    item_name=record.item.name,
                    item_sku=record.item.sku,
                    unit_symbol=record.unit.symbol,
                )
            )
        self.add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action=f"inventory.movement.{movement_type}",
            target_type="inventory_movement",
            target_id=movement.id,
            request_id=request_id,
            details={
                "branchId": str(branch_id),
                "warehouseId": str(warehouse_id),
                "lineCount": len(changes),
            },
        )
        self._session.flush()
        return movement.id

    def get_movement(
        self,
        *,
        workspace_id: UUID,
        movement_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> MovementRecord | None:
        employee = aliased(Employee)
        creator = aliased(PlatformUser)
        predicates: list[ColumnElement[bool]] = [
            InventoryMovement.workspace_id == workspace_id,
            InventoryMovement.id == movement_id,
        ]
        if visible_branch_ids is not None:
            predicates.append(InventoryMovement.branch_id.in_(visible_branch_ids))
        row = self._session.execute(
            select(
                InventoryMovement,
                InventoryWarehouse,
                Branch.id,
                Branch.code,
                Branch.name,
                func.concat(employee.first_name, " ", employee.last_name),
                func.concat(Appointment.customer_name, " · ", Appointment.service_name),
                creator.display_name,
            )
            .join(
                InventoryWarehouse,
                (InventoryWarehouse.workspace_id == InventoryMovement.workspace_id)
                & (InventoryWarehouse.id == InventoryMovement.warehouse_id),
            )
            .join(
                Branch,
                (Branch.workspace_id == InventoryMovement.workspace_id)
                & (Branch.id == InventoryMovement.branch_id),
            )
            .outerjoin(
                employee,
                (employee.workspace_id == InventoryMovement.workspace_id)
                & (employee.id == InventoryMovement.employee_id),
            )
            .outerjoin(
                Appointment,
                (Appointment.workspace_id == InventoryMovement.workspace_id)
                & (Appointment.id == InventoryMovement.appointment_id),
            )
            .join(creator, creator.id == InventoryMovement.created_by_platform_user_id)
            .where(*predicates)
        ).one_or_none()
        if row is None:
            return None
        lines = tuple(
            self._session.scalars(
                select(InventoryMovementLine)
                .where(
                    InventoryMovementLine.workspace_id == workspace_id,
                    InventoryMovementLine.movement_id == movement_id,
                )
                .order_by(InventoryMovementLine.item_name, InventoryMovementLine.id)
            )
        )
        return MovementRecord(
            movement=row[0],
            warehouse=row[1],
            branch=BranchRecord(id=row[2], code=row[3], name=row[4]),
            employee_name=row[5] if row[0].employee_id is not None else None,
            appointment_label=row[6] if row[0].appointment_id is not None else None,
            created_by_name=row[7],
            lines=lines,
        )

    def list_movements(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        search: str | None,
        movement_type: str | None,
        item_id: UUID | None,
        employee_id: UUID | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> MovementPage:
        employee = aliased(Employee)
        creator = aliased(PlatformUser)
        predicates: list[ColumnElement[bool]] = [InventoryMovement.workspace_id == workspace_id]
        if visible_branch_ids is not None:
            predicates.append(InventoryMovement.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(InventoryMovement.branch_id == branch_id)
        if movement_type is not None:
            predicates.append(InventoryMovement.movement_type == movement_type)
        if employee_id is not None:
            predicates.append(InventoryMovement.employee_id == employee_id)
        if date_from is not None:
            predicates.append(func.date(InventoryMovement.created_at) >= date_from)
        if date_to is not None:
            predicates.append(func.date(InventoryMovement.created_at) <= date_to)
        line_match = exists(
            select(1).where(
                InventoryMovementLine.workspace_id == InventoryMovement.workspace_id,
                InventoryMovementLine.movement_id == InventoryMovement.id,
                *((InventoryMovementLine.item_id == item_id,) if item_id is not None else ()),
            )
        )
        if item_id is not None:
            predicates.append(line_match)
        if search:
            normalized = search.casefold()
            predicates.append(
                or_(
                    func.lower(InventoryMovement.comment).contains(normalized),
                    func.lower(func.concat(employee.first_name, " ", employee.last_name)).contains(
                        normalized
                    ),
                    exists(
                        select(1).where(
                            InventoryMovementLine.workspace_id == InventoryMovement.workspace_id,
                            InventoryMovementLine.movement_id == InventoryMovement.id,
                            or_(
                                func.lower(InventoryMovementLine.item_name).contains(normalized),
                                func.lower(InventoryMovementLine.item_sku).contains(normalized),
                            ),
                        )
                    ),
                )
            )
        base = (
            select(
                InventoryMovement,
                InventoryWarehouse,
                Branch.id,
                Branch.code,
                Branch.name,
                func.concat(employee.first_name, " ", employee.last_name),
                func.concat(Appointment.customer_name, " · ", Appointment.service_name),
                creator.display_name,
            )
            .join(
                InventoryWarehouse,
                (InventoryWarehouse.workspace_id == InventoryMovement.workspace_id)
                & (InventoryWarehouse.id == InventoryMovement.warehouse_id),
            )
            .join(
                Branch,
                (Branch.workspace_id == InventoryMovement.workspace_id)
                & (Branch.id == InventoryMovement.branch_id),
            )
            .outerjoin(
                employee,
                (employee.workspace_id == InventoryMovement.workspace_id)
                & (employee.id == InventoryMovement.employee_id),
            )
            .outerjoin(
                Appointment,
                (Appointment.workspace_id == InventoryMovement.workspace_id)
                & (Appointment.id == InventoryMovement.appointment_id),
            )
            .join(creator, creator.id == InventoryMovement.created_by_platform_user_id)
            .where(*predicates)
        )
        total_items = (
            self._session.scalar(
                select(func.count()).select_from(
                    base.with_only_columns(InventoryMovement.id).order_by(None).subquery()
                )
            )
            or 0
        )
        order_fields: dict[str, Any] = {
            "createdAt": InventoryMovement.created_at,
            "type": InventoryMovement.movement_type,
            "employee": func.concat(employee.first_name, " ", employee.last_name),
        }
        order_field = order_fields[sort_by]
        order = (
            order_field.desc().nulls_last()
            if sort_direction == "desc"
            else order_field.asc().nulls_last()
        )
        rows = self._session.execute(
            base.order_by(order, InventoryMovement.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        movement_ids = [row[0].id for row in rows]
        lines_by_movement = self._lines_by_movement(workspace_id, movement_ids)
        return MovementPage(
            items=tuple(
                MovementRecord(
                    movement=row[0],
                    warehouse=row[1],
                    branch=BranchRecord(id=row[2], code=row[3], name=row[4]),
                    employee_name=row[5] if row[0].employee_id is not None else None,
                    appointment_label=row[6] if row[0].appointment_id is not None else None,
                    created_by_name=row[7],
                    lines=lines_by_movement.get(row[0].id, ()),
                )
                for row in rows
            ),
            total_items=int(total_items),
        )

    def supply_usage(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> tuple[SupplyUsageRecord, ...]:
        predicates: list[ColumnElement[bool]] = [
            InventoryMovement.workspace_id == workspace_id,
            InventoryMovement.movement_type == "outbound",
            InventoryMovement.employee_id.is_not(None),
            Item.item_type == "supply",
        ]
        appointment_predicates: list[ColumnElement[bool]] = [
            Appointment.workspace_id == workspace_id,
            Appointment.employee_id.is_not(None),
            Appointment.status.in_(("confirmed", "completed", "attended")),
        ]
        if visible_branch_ids is not None:
            predicates.append(InventoryMovement.branch_id.in_(visible_branch_ids))
            appointment_predicates.append(Appointment.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(InventoryMovement.branch_id == branch_id)
            appointment_predicates.append(Appointment.branch_id == branch_id)
        rows = self._session.execute(
            select(
                InventoryMovement.employee_id,
                func.concat(Employee.first_name, " ", Employee.last_name),
                Item.id,
                Item.name,
                func.sum(-InventoryMovementLine.quantity_delta),
            )
            .join(
                InventoryMovementLine,
                (InventoryMovementLine.workspace_id == InventoryMovement.workspace_id)
                & (InventoryMovementLine.movement_id == InventoryMovement.id),
            )
            .join(
                Item,
                (Item.workspace_id == InventoryMovementLine.workspace_id)
                & (Item.id == InventoryMovementLine.item_id),
            )
            .join(
                Employee,
                (Employee.workspace_id == InventoryMovement.workspace_id)
                & (Employee.id == InventoryMovement.employee_id),
            )
            .where(*predicates)
            .group_by(
                InventoryMovement.employee_id,
                Employee.first_name,
                Employee.last_name,
                Item.id,
                Item.name,
            )
            .order_by(func.sum(-InventoryMovementLine.quantity_delta).desc(), Item.name)
        ).all()
        employee_ids = {cast(UUID, row[0]) for row in rows}
        appointment_counts: dict[UUID, int] = {}
        if employee_ids:
            appointment_counts = {
                row[0]: int(row[1])
                for row in self._session.execute(
                    select(Appointment.employee_id, func.count())
                    .where(
                        *appointment_predicates,
                        Appointment.employee_id.in_(employee_ids),
                    )
                    .group_by(Appointment.employee_id)
                )
                if row[0] is not None
            }
        return tuple(
            SupplyUsageRecord(
                employee_id=cast(UUID, row[0]),
                employee_name=row[1],
                supply_id=row[2],
                supply_name=row[3],
                quantity=Decimal(row[4] or 0),
                appointments_count=appointment_counts.get(cast(UUID, row[0]), 0),
            )
            for row in rows
        )

    def _stock_sum_expression(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        field: Any,
    ) -> Any:
        predicates: list[ColumnElement[bool]] = [
            InventoryStockBalance.workspace_id == workspace_id,
            InventoryStockBalance.item_id == Item.id,
        ]
        if visible_branch_ids is not None:
            predicates.append(InventoryStockBalance.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(InventoryStockBalance.branch_id == branch_id)
        return (
            select(func.coalesce(func.sum(field), Decimal("0")))
            .where(*predicates)
            .correlate(Item)
            .scalar_subquery()
        )

    def _item_visibility_predicate(
        self,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> ColumnElement[bool]:
        if visible_branch_ids is not None and not visible_branch_ids:
            return false()
        predicates: list[ColumnElement[bool]] = [
            ItemBranchAssignment.workspace_id == workspace_id,
            ItemBranchAssignment.item_id == Item.id,
            ItemBranchAssignment.status == "active",
        ]
        if visible_branch_ids is not None:
            predicates.append(ItemBranchAssignment.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(ItemBranchAssignment.branch_id == branch_id)
        return exists(select(1).where(*predicates))

    def _branches_by_item(
        self,
        workspace_id: UUID,
        item_ids: list[UUID],
        visible_branch_ids: frozenset[UUID] | None,
    ) -> dict[UUID, tuple[BranchRecord, ...]]:
        if not item_ids:
            return {}
        statement = (
            select(ItemBranchAssignment.item_id, Branch.id, Branch.code, Branch.name)
            .join(
                Branch,
                (Branch.workspace_id == ItemBranchAssignment.workspace_id)
                & (Branch.id == ItemBranchAssignment.branch_id),
            )
            .where(
                ItemBranchAssignment.workspace_id == workspace_id,
                ItemBranchAssignment.item_id.in_(item_ids),
                ItemBranchAssignment.status == "active",
            )
            .order_by(Branch.name, Branch.id)
        )
        if visible_branch_ids is not None:
            statement = statement.where(ItemBranchAssignment.branch_id.in_(visible_branch_ids))
        grouped: dict[UUID, list[BranchRecord]] = {item_id: [] for item_id in item_ids}
        for row in self._session.execute(statement):
            grouped[row[0]].append(BranchRecord(id=row[1], code=row[2], name=row[3]))
        return {item_id: tuple(values) for item_id, values in grouped.items()}

    def _stock_locations_by_item(
        self,
        workspace_id: UUID,
        item_ids: list[UUID],
        visible_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> dict[UUID, tuple[StockLocationRecord, ...]]:
        if not item_ids:
            return {}
        predicates: list[ColumnElement[bool]] = [
            InventoryStockBalance.workspace_id == workspace_id,
            InventoryStockBalance.item_id.in_(item_ids),
        ]
        if visible_branch_ids is not None:
            predicates.append(InventoryStockBalance.branch_id.in_(visible_branch_ids))
        if branch_id is not None:
            predicates.append(InventoryStockBalance.branch_id == branch_id)
        rows = self._session.execute(
            select(
                InventoryStockBalance,
                InventoryWarehouse.name,
                Branch.id,
                Branch.code,
                Branch.name,
            )
            .join(
                InventoryWarehouse,
                (InventoryWarehouse.workspace_id == InventoryStockBalance.workspace_id)
                & (InventoryWarehouse.id == InventoryStockBalance.warehouse_id),
            )
            .join(
                Branch,
                (Branch.workspace_id == InventoryStockBalance.workspace_id)
                & (Branch.id == InventoryStockBalance.branch_id),
            )
            .where(*predicates)
            .order_by(Branch.name, InventoryWarehouse.name, InventoryStockBalance.id)
        )
        grouped: dict[UUID, list[StockLocationRecord]] = {item_id: [] for item_id in item_ids}
        for row in rows:
            grouped[row[0].item_id].append(
                StockLocationRecord(
                    balance=row[0],
                    warehouse_name=row[1],
                    branch=BranchRecord(id=row[2], code=row[3], name=row[4]),
                )
            )
        return {item_id: tuple(values) for item_id, values in grouped.items()}

    def _lines_by_movement(
        self, workspace_id: UUID, movement_ids: list[UUID]
    ) -> dict[UUID, tuple[InventoryMovementLine, ...]]:
        if not movement_ids:
            return {}
        grouped: dict[UUID, list[InventoryMovementLine]] = {
            movement_id: [] for movement_id in movement_ids
        }
        for line in self._session.scalars(
            select(InventoryMovementLine)
            .where(
                InventoryMovementLine.workspace_id == workspace_id,
                InventoryMovementLine.movement_id.in_(movement_ids),
            )
            .order_by(InventoryMovementLine.item_name, InventoryMovementLine.id)
        ):
            grouped[line.movement_id].append(line)
        return {movement_id: tuple(values) for movement_id, values in grouped.items()}

    def add_audit(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        action: str,
        target_type: str,
        target_id: UUID,
        request_id: str,
        details: dict[str, object],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=request_id or None,
                details=details,
            )
        )
