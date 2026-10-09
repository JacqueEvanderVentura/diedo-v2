from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Branch,
    CarwashServiceConfig,
    Employee,
    EmployeeBranchAssignment,
    InventoryItemProfile,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    UnitOfMeasure,
)


@dataclass(frozen=True)
class CarwashCatalogRecord:
    item: Item
    category: ItemCategory
    assignment: ItemBranchAssignment
    unit: UnitOfMeasure
    profile: InventoryItemProfile | None

    @property
    def unavailable_reason(self) -> str | None:
        if self.item.item_type != "service" or self.item.status != "active":
            return "Servicio inactivo o archivado en el catálogo."
        if self.assignment.status != "active":
            return "Servicio no disponible en esta sucursal."
        if self.category.status != "active" or self.unit.status != "active":
            return "La categoría o unidad de medida no está activa."
        if self.profile is None or self.profile.sale_price is None:
            return "Configura el precio comercial en Inventarios."
        if self.profile.available_in_pos is False:
            return "Este servicio no está habilitado para venta."
        return None


@dataclass(frozen=True)
class CarwashServiceRecord:
    config: CarwashServiceConfig
    catalog: CarwashCatalogRecord


class CarwashRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def branch(self, workspace_id: UUID, branch_id: UUID) -> Branch | None:
        return self.session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
                Branch.status == "active",
            )
        )

    @staticmethod
    def _catalog(
        workspace_id: UUID, branch_id: UUID
    ) -> Select[
        tuple[Item, ItemCategory, ItemBranchAssignment, UnitOfMeasure, InventoryItemProfile]
    ]:
        return (
            select(Item, ItemCategory, ItemBranchAssignment, UnitOfMeasure, InventoryItemProfile)
            .join(
                ItemCategory,
                (Item.category_id == ItemCategory.id)
                & (Item.workspace_id == ItemCategory.workspace_id),
            )
            .join(
                UnitOfMeasure,
                (Item.unit_of_measure_id == UnitOfMeasure.id)
                & (Item.workspace_id == UnitOfMeasure.workspace_id),
            )
            .join(
                ItemBranchAssignment,
                (Item.id == ItemBranchAssignment.item_id)
                & (Item.workspace_id == ItemBranchAssignment.workspace_id),
            )
            .outerjoin(
                InventoryItemProfile,
                (Item.id == InventoryItemProfile.item_id)
                & (Item.workspace_id == InventoryItemProfile.workspace_id),
            )
            .where(Item.workspace_id == workspace_id, ItemBranchAssignment.branch_id == branch_id)
        )

    def catalog_service(
        self, workspace_id: UUID, branch_id: UUID, item_id: UUID, *, lock: bool = True
    ) -> CarwashCatalogRecord | None:
        query = self._catalog(workspace_id, branch_id).where(Item.id == item_id)
        if lock:
            query = query.with_for_update(of=[Item, ItemBranchAssignment])
        row = self.session.execute(query).first()
        return CarwashCatalogRecord(*row) if row else None

    def list_options(
        self, workspace_id: UUID, branch_id: UUID, search: str | None, page: int, page_size: int
    ) -> tuple[list[CarwashCatalogRecord], int]:
        configured = select(CarwashServiceConfig.item_id).where(
            CarwashServiceConfig.workspace_id == workspace_id,
            CarwashServiceConfig.branch_id == branch_id,
        )
        query = self._catalog(workspace_id, branch_id).where(
            Item.item_type == "service",
            Item.status == "active",
            ItemCategory.status == "active",
            UnitOfMeasure.status == "active",
            ItemBranchAssignment.status == "active",
            InventoryItemProfile.sale_price.is_not(None),
            InventoryItemProfile.available_in_pos.is_(True),
            Item.id.not_in(configured),
        )
        if search:
            query = query.where(
                func.lower(Item.name).contains(search.strip().lower(), autoescape=True)
            )
        count = self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = self.session.execute(
            query.order_by(func.lower(Item.name), Item.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return [CarwashCatalogRecord(*row) for row in rows], count

    def list_services(
        self,
        workspace_id: UUID,
        branch_id: UUID,
        search: str | None,
        enabled: bool | None,
        page: int,
        page_size: int,
    ) -> tuple[list[CarwashServiceRecord], int]:
        query = (
            self._catalog(workspace_id, branch_id)
            .add_columns(CarwashServiceConfig)
            .join(
                CarwashServiceConfig,
                (CarwashServiceConfig.workspace_id == Item.workspace_id)
                & (CarwashServiceConfig.item_id == Item.id)
                & (CarwashServiceConfig.branch_id == branch_id),
            )
        )
        if search:
            query = query.where(
                func.lower(Item.name).contains(search.strip().lower(), autoescape=True)
            )
        if enabled is not None:
            query = query.where(CarwashServiceConfig.enabled == enabled)
        count = self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = self.session.execute(
            query.order_by(func.lower(Item.name), Item.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return [CarwashServiceRecord(row[5], CarwashCatalogRecord(*row[:5])) for row in rows], count

    def get_service(
        self, workspace_id: UUID, config_id: UUID, *, lock: bool = False
    ) -> CarwashServiceRecord | None:
        config_query = select(CarwashServiceConfig).where(
            CarwashServiceConfig.workspace_id == workspace_id, CarwashServiceConfig.id == config_id
        )
        if lock:
            config_query = config_query.with_for_update()
        config = self.session.scalar(config_query)
        if config is None:
            return None
        row = self.session.execute(
            self._catalog(workspace_id, config.branch_id).where(Item.id == config.item_id)
        ).one()
        return CarwashServiceRecord(config, CarwashCatalogRecord(*row))

    def creation(self, workspace_id: UUID, key: str) -> list[CarwashServiceConfig]:
        return list(
            self.session.scalars(
                select(CarwashServiceConfig)
                .where(
                    CarwashServiceConfig.workspace_id == workspace_id,
                    CarwashServiceConfig.creation_key == key,
                )
                .order_by(CarwashServiceConfig.creation_position)
            )
        )

    def employee_count(self, workspace_id: UUID, branch_id: UUID) -> int:
        return (
            self.session.scalar(
                select(func.count())
                .select_from(Employee)
                .join(
                    EmployeeBranchAssignment,
                    (Employee.id == EmployeeBranchAssignment.employee_id)
                    & (Employee.workspace_id == EmployeeBranchAssignment.workspace_id),
                )
                .where(
                    Employee.workspace_id == workspace_id,
                    Employee.status == "active",
                    EmployeeBranchAssignment.branch_id == branch_id,
                    EmployeeBranchAssignment.status == "active",
                )
            )
            or 0
        )

    def categories(self, workspace_id: UUID) -> list[ItemCategory]:
        return list(
            self.session.scalars(
                select(ItemCategory)
                .where(ItemCategory.workspace_id == workspace_id, ItemCategory.status == "active")
                .order_by(ItemCategory.name)
            )
        )

    def units(self, workspace_id: UUID) -> list[UnitOfMeasure]:
        return list(
            self.session.scalars(
                select(UnitOfMeasure)
                .where(UnitOfMeasure.workspace_id == workspace_id, UnitOfMeasure.status == "active")
                .order_by(UnitOfMeasure.code)
            )
        )
