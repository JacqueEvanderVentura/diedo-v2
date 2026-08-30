from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import ColumnElement, exists, false, func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    AuditEntry,
    Branch,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    UnitOfMeasure,
)

_COMMERCIAL_ITEM_TYPES = ("product", "service", "membership", "other")


@dataclass(frozen=True)
class CategoryRecord:
    id: UUID
    name: str
    description: str | None
    status: str
    version: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class CategoryPage:
    items: tuple[CategoryRecord, ...]
    total_items: int


@dataclass(frozen=True)
class UnitOfMeasureRecord:
    id: UUID
    code: str
    name: str
    symbol: str


@dataclass(frozen=True)
class ProductCategoryRecord:
    id: UUID
    name: str


@dataclass(frozen=True)
class ProductBranchRecord:
    id: UUID
    code: str
    name: str


@dataclass(frozen=True)
class ProductRecord:
    id: UUID
    item_type: str
    name: str
    description: str | None
    sku: str | None
    category: ProductCategoryRecord
    unit_of_measure: UnitOfMeasureRecord
    branches: tuple[ProductBranchRecord, ...]
    status: str
    version: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class ProductPage:
    items: tuple[ProductRecord, ...]
    total_items: int


class CatalogRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_categories(
        self,
        *,
        workspace_id: UUID,
        search: str | None,
        status: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> CategoryPage:
        predicates: list[ColumnElement[bool]] = [ItemCategory.workspace_id == workspace_id]
        if search:
            predicates.append(ItemCategory.normalized_name.contains(search.casefold()))
        if status is not None:
            predicates.append(ItemCategory.status == status)
        else:
            predicates.append(ItemCategory.status != "archived")

        base = select(ItemCategory).where(*predicates)
        total_items = (
            self._session.scalar(select(func.count()).select_from(base.order_by(None).subquery()))
            or 0
        )
        order_fields = {
            "name": func.lower(ItemCategory.name),
            "status": ItemCategory.status,
            "createdAt": ItemCategory.created_at,
            "updatedAt": ItemCategory.updated_at,
        }
        order_field = order_fields[sort_by]
        order = order_field.desc() if sort_direction == "desc" else order_field.asc()
        categories = self._session.scalars(
            base.order_by(order, ItemCategory.id).offset((page - 1) * page_size).limit(page_size)
        ).all()
        return CategoryPage(
            items=tuple(self._category_record(category) for category in categories),
            total_items=total_items,
        )

    def get_category(self, workspace_id: UUID, category_id: UUID) -> ItemCategory | None:
        return self._session.scalar(
            select(ItemCategory).where(
                ItemCategory.workspace_id == workspace_id,
                ItemCategory.id == category_id,
            )
        )

    def get_category_for_update(self, workspace_id: UUID, category_id: UUID) -> ItemCategory | None:
        return self._session.scalar(
            select(ItemCategory)
            .where(
                ItemCategory.workspace_id == workspace_id,
                ItemCategory.id == category_id,
            )
            .with_for_update()
        )

    def category_name_exists(
        self,
        workspace_id: UUID,
        normalized_name: str,
        exclude_id: UUID | None = None,
    ) -> bool:
        statement = select(
            exists().where(
                ItemCategory.workspace_id == workspace_id,
                ItemCategory.normalized_name == normalized_name,
            )
        )
        if exclude_id is not None:
            statement = select(
                exists().where(
                    ItemCategory.workspace_id == workspace_id,
                    ItemCategory.normalized_name == normalized_name,
                    ItemCategory.id != exclude_id,
                )
            )
        return self._session.scalar(statement) is True

    def category_has_non_archived_items(self, workspace_id: UUID, category_id: UUID) -> bool:
        return (
            self._session.scalar(
                select(
                    exists().where(
                        Item.workspace_id == workspace_id,
                        Item.category_id == category_id,
                        Item.status != "archived",
                    )
                )
            )
            is True
        )

    def create_category(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        name: str,
        normalized_name: str,
        description: str | None,
        status: str,
        request_id: str,
    ) -> CategoryRecord:
        category = ItemCategory(
            workspace_id=workspace_id,
            name=name,
            normalized_name=normalized_name,
            description=description,
            status=status,
        )
        self._session.add(category)
        self._session.flush()
        self._add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="catalog.category.create",
            target_type="item_category",
            target_id=category.id,
            request_id=request_id,
            details={"status": status},
        )
        self._session.flush()
        return self._category_record(category)

    def update_category(
        self,
        *,
        category: ItemCategory,
        changes: dict[str, object],
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> CategoryRecord:
        if "name" in changes:
            category.name = cast(str, changes["name"])
            category.normalized_name = cast(str, changes["normalized_name"])
        if "description" in changes:
            category.description = cast(str | None, changes["description"])
        if "status" in changes:
            category.status = cast(str, changes["status"])
        category.version += 1
        self._add_audit(
            workspace_id=category.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="catalog.category.update",
            target_type="item_category",
            target_id=category.id,
            request_id=request_id,
            details={
                "changedFields": sorted(key for key in changes if key != "normalized_name"),
                "version": category.version,
            },
        )
        self._session.flush()
        return self._category_record(category)

    def list_units_of_measure(self, workspace_id: UUID) -> tuple[UnitOfMeasureRecord, ...]:
        units = self._session.scalars(
            select(UnitOfMeasure)
            .where(
                UnitOfMeasure.workspace_id == workspace_id,
                UnitOfMeasure.status == "active",
            )
            .order_by(UnitOfMeasure.name, UnitOfMeasure.id)
        ).all()
        return tuple(self._unit_record(unit) for unit in units)

    def get_unit_of_measure(
        self, workspace_id: UUID, unit_of_measure_id: UUID
    ) -> UnitOfMeasure | None:
        return self._session.scalar(
            select(UnitOfMeasure).where(
                UnitOfMeasure.workspace_id == workspace_id,
                UnitOfMeasure.id == unit_of_measure_id,
                UnitOfMeasure.status == "active",
            )
        )

    def get_active_branches(
        self, workspace_id: UUID, branch_ids: set[UUID]
    ) -> tuple[ProductBranchRecord, ...]:
        if not branch_ids:
            return ()
        rows = self._session.execute(
            select(Branch.id, Branch.code, Branch.name)
            .where(
                Branch.workspace_id == workspace_id,
                Branch.id.in_(branch_ids),
                Branch.status == "active",
            )
            .order_by(Branch.name, Branch.id)
        )
        return tuple(ProductBranchRecord(*row) for row in rows)

    def list_products(
        self,
        *,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
        search: str | None,
        status: str | None,
        category_id: UUID | None,
        branch_id: UUID | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> ProductPage:
        predicates: list[ColumnElement[bool]] = [
            Item.workspace_id == workspace_id,
            Item.item_type.in_(_COMMERCIAL_ITEM_TYPES),
            self._visibility_predicate(workspace_id, visible_branch_ids),
        ]
        if search:
            normalized_search = search.casefold()
            predicates.append(
                or_(
                    func.lower(Item.name).contains(normalized_search),
                    func.lower(Item.sku).contains(normalized_search),
                )
            )
        if status is not None:
            predicates.append(Item.status == status)
        else:
            predicates.append(Item.status != "archived")
        if category_id is not None:
            predicates.append(Item.category_id == category_id)
        if branch_id is not None:
            predicates.append(self._branch_assignment_predicate(workspace_id, branch_id))

        base = self._product_select().where(*predicates)
        total_items = (
            self._session.scalar(
                select(func.count()).select_from(
                    base.with_only_columns(Item.id).order_by(None).subquery()
                )
            )
            or 0
        )
        order_fields = {
            "name": func.lower(Item.name),
            "sku": Item.sku,
            "status": Item.status,
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
        branches_by_item = self._branches_by_item(
            workspace_id,
            [row[0] for row in rows],
            visible_branch_ids,
        )
        return ProductPage(
            items=tuple(
                self._product_record(row, branches_by_item.get(row[0], ())) for row in rows
            ),
            total_items=total_items,
        )

    def get_product(
        self,
        *,
        workspace_id: UUID,
        product_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
    ) -> ProductRecord | None:
        row = self._session.execute(
            self._product_select().where(
                Item.workspace_id == workspace_id,
                Item.id == product_id,
                Item.item_type.in_(_COMMERCIAL_ITEM_TYPES),
                self._visibility_predicate(workspace_id, visible_branch_ids),
            )
        ).one_or_none()
        if row is None:
            return None
        branches = self._branches_by_item(workspace_id, [product_id], visible_branch_ids).get(
            product_id, ()
        )
        return self._product_record(row, branches)

    def get_product_for_update(self, workspace_id: UUID, product_id: UUID) -> Item | None:
        return self._session.scalar(
            select(Item)
            .where(
                Item.workspace_id == workspace_id,
                Item.id == product_id,
                Item.item_type.in_(_COMMERCIAL_ITEM_TYPES),
            )
            .with_for_update()
        )

    def active_branch_ids(self, workspace_id: UUID, item_id: UUID) -> set[UUID]:
        return set(
            self._session.scalars(
                select(ItemBranchAssignment.branch_id).where(
                    ItemBranchAssignment.workspace_id == workspace_id,
                    ItemBranchAssignment.item_id == item_id,
                    ItemBranchAssignment.status == "active",
                )
            )
        )

    def sku_exists(
        self,
        workspace_id: UUID,
        sku: str,
        exclude_id: UUID | None = None,
    ) -> bool:
        predicates: list[ColumnElement[bool]] = [
            Item.workspace_id == workspace_id,
            Item.sku == sku,
        ]
        if exclude_id is not None:
            predicates.append(Item.id != exclude_id)
        return self._session.scalar(select(exists().where(*predicates))) is True

    def create_product(
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
        branch_ids: set[UUID],
        status: str,
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
        self._session.add_all(
            ItemBranchAssignment(
                workspace_id=workspace_id,
                item_id=item.id,
                branch_id=branch_id,
                status="active",
            )
            for branch_id in sorted(branch_ids)
        )
        self._add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="catalog.product.create",
            target_type="item",
            target_id=item.id,
            request_id=request_id,
            details={
                "categoryId": str(category_id),
                "itemType": item_type,
                "unitOfMeasureId": str(unit_of_measure_id),
                "branchIds": [str(branch_id) for branch_id in sorted(branch_ids)],
                "status": status,
            },
        )
        self._session.flush()
        return item.id

    def update_product(
        self,
        *,
        item: Item,
        changes: dict[str, object],
        branch_ids: set[UUID] | None,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> None:
        for field in (
            "item_type",
            "name",
            "description",
            "sku",
            "category_id",
            "unit_of_measure_id",
            "status",
        ):
            if field in changes:
                setattr(item, field, changes[field])
        if branch_ids is not None:
            assignments = self._session.scalars(
                select(ItemBranchAssignment).where(
                    ItemBranchAssignment.workspace_id == item.workspace_id,
                    ItemBranchAssignment.item_id == item.id,
                )
            ).all()
            assignments_by_branch = {assignment.branch_id: assignment for assignment in assignments}
            for assigned_branch_id, assignment in assignments_by_branch.items():
                assignment.status = "active" if assigned_branch_id in branch_ids else "inactive"
            self._session.add_all(
                ItemBranchAssignment(
                    workspace_id=item.workspace_id,
                    item_id=item.id,
                    branch_id=branch_id,
                    status="active",
                )
                for branch_id in sorted(branch_ids - assignments_by_branch.keys())
            )
        item.version += 1
        details: dict[str, object] = {
            "changedFields": sorted(
                changes.keys() | ({"branchIds"} if branch_ids is not None else set())
            ),
            "version": item.version,
        }
        if branch_ids is not None:
            details["branchIds"] = [str(branch_id) for branch_id in sorted(branch_ids)]
        self._add_audit(
            workspace_id=item.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="catalog.product.update",
            target_type="item",
            target_id=item.id,
            request_id=request_id,
            details=details,
        )
        self._session.flush()

    def _product_select(self) -> Any:
        return (
            select(
                Item.id,
                Item.name,
                Item.description,
                Item.sku,
                Item.status,
                Item.version,
                Item.created_at,
                Item.updated_at,
                ItemCategory.id,
                ItemCategory.name,
                UnitOfMeasure.id,
                UnitOfMeasure.code,
                UnitOfMeasure.name,
                UnitOfMeasure.symbol,
                Item.item_type,
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
        )

    def _visibility_predicate(
        self,
        workspace_id: UUID,
        visible_branch_ids: frozenset[UUID] | None,
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
        return exists(select(1).where(*predicates))

    def _branch_assignment_predicate(
        self, workspace_id: UUID, branch_id: UUID
    ) -> ColumnElement[bool]:
        return exists(
            select(1).where(
                ItemBranchAssignment.workspace_id == workspace_id,
                ItemBranchAssignment.item_id == Item.id,
                ItemBranchAssignment.branch_id == branch_id,
                ItemBranchAssignment.status == "active",
            )
        )

    def _branches_by_item(
        self,
        workspace_id: UUID,
        item_ids: list[UUID],
        visible_branch_ids: frozenset[UUID] | None,
    ) -> dict[UUID, tuple[ProductBranchRecord, ...]]:
        if not item_ids:
            return {}
        statement = (
            select(
                ItemBranchAssignment.item_id,
                Branch.id,
                Branch.code,
                Branch.name,
            )
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
        grouped: dict[UUID, list[ProductBranchRecord]] = {item_id: [] for item_id in item_ids}
        for row in self._session.execute(statement):
            grouped[row[0]].append(ProductBranchRecord(id=row[1], code=row[2], name=row[3]))
        return {item_id: tuple(branches) for item_id, branches in grouped.items()}

    @staticmethod
    def _category_record(category: ItemCategory) -> CategoryRecord:
        return CategoryRecord(
            id=category.id,
            name=category.name,
            description=category.description,
            status=category.status,
            version=category.version,
            created_at=category.created_at,
            updated_at=category.updated_at,
        )

    @staticmethod
    def _unit_record(unit: UnitOfMeasure) -> UnitOfMeasureRecord:
        return UnitOfMeasureRecord(
            id=unit.id,
            code=unit.code,
            name=unit.name,
            symbol=unit.symbol,
        )

    @staticmethod
    def _product_record(row: Any, branches: tuple[ProductBranchRecord, ...]) -> ProductRecord:
        return ProductRecord(
            id=row[0],
            item_type=row[14],
            name=row[1],
            description=row[2],
            sku=row[3],
            status=row[4],
            version=row[5],
            created_at=row[6],
            updated_at=row[7],
            category=ProductCategoryRecord(id=row[8], name=row[9]),
            unit_of_measure=UnitOfMeasureRecord(
                id=row[10], code=row[11], name=row[12], symbol=row[13]
            ),
            branches=branches,
        )

    def _add_audit(
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
