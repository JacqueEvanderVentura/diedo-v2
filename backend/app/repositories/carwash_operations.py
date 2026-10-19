from collections import defaultdict
from typing import Any
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    CarwashServiceConfig,
    CarwashWash,
    CarwashWashLine,
    Customer,
    CustomerBranchAssignment,
    Employee,
    EmployeeBranchAssignment,
    InventoryItemProfile,
    Item,
    ItemBranchAssignment,
    ItemCategory,
    PaymentMethod,
    UnitOfMeasure,
)
from app.repositories.carwash import CarwashRepository
from app.schemas.carwash_operations import OptionKind


class CarwashOperationsRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, workspace_id: UUID, wash_id: UUID, *, lock: bool = False) -> CarwashWash | None:
        query = select(CarwashWash).where(
            CarwashWash.workspace_id == workspace_id, CarwashWash.id == wash_id
        )
        if lock:
            query = query.with_for_update()
        return self.session.scalar(query)

    def creation(self, workspace_id: UUID, key: str) -> CarwashWash | None:
        return self.session.scalar(
            select(CarwashWash).where(
                CarwashWash.workspace_id == workspace_id, CarwashWash.creation_key == key
            )
        )

    def lines(self, workspace_id: UUID, wash_ids: list[UUID]) -> dict[UUID, list[CarwashWashLine]]:
        result: dict[UUID, list[CarwashWashLine]] = defaultdict(list)
        if wash_ids:
            for line in self.session.scalars(
                select(CarwashWashLine)
                .where(
                    CarwashWashLine.workspace_id == workspace_id,
                    CarwashWashLine.wash_id.in_(wash_ids),
                )
                .order_by(CarwashWashLine.position, CarwashWashLine.id)
            ):
                result[line.wash_id].append(line)
        return result

    def list_washes(
        self,
        workspace_id: UUID,
        branch_id: UUID,
        search: str | None,
        status: str | None,
        employee_id: UUID | None,
        page: int,
        page_size: int,
    ) -> tuple[list[CarwashWash], int]:
        query = select(CarwashWash).where(
            CarwashWash.workspace_id == workspace_id, CarwashWash.branch_id == branch_id
        )
        if search and search.strip():
            term = search.strip().lower()
            service_match = select(CarwashWashLine.wash_id).where(
                CarwashWashLine.workspace_id == workspace_id,
                CarwashWashLine.branch_id == branch_id,
                func.lower(CarwashWashLine.name).contains(term, autoescape=True),
            )
            query = query.where(
                or_(
                    func.lower(CarwashWash.plate).contains(term, autoescape=True),
                    func.lower(CarwashWash.customer_name).contains(term, autoescape=True),
                    CarwashWash.id.in_(service_match),
                )
            )
        if status:
            query = query.where(CarwashWash.status == status)
        if employee_id:
            query = query.where(
                or_(CarwashWash.washer_id == employee_id, CarwashWash.supervisor_id == employee_id)
            )
        total = self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = self.session.scalars(
            query.order_by(CarwashWash.created_at.desc(), CarwashWash.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(rows), total

    def customer(self, workspace_id: UUID, branch_id: UUID, customer_id: UUID) -> Customer | None:
        return self.session.scalar(
            select(Customer)
            .join(
                CustomerBranchAssignment,
                (Customer.workspace_id == CustomerBranchAssignment.workspace_id)
                & (Customer.id == CustomerBranchAssignment.customer_id),
            )
            .where(
                Customer.workspace_id == workspace_id,
                Customer.id == customer_id,
                Customer.status == "active",
                CustomerBranchAssignment.branch_id == branch_id,
                CustomerBranchAssignment.status == "active",
            )
            .with_for_update(of=[Customer, CustomerBranchAssignment])
        )

    def employee(self, workspace_id: UUID, branch_id: UUID, employee_id: UUID) -> Employee | None:
        return self.session.scalar(
            select(Employee)
            .join(
                EmployeeBranchAssignment,
                (Employee.workspace_id == EmployeeBranchAssignment.workspace_id)
                & (Employee.id == EmployeeBranchAssignment.employee_id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                Employee.id == employee_id,
                Employee.status == "active",
                EmployeeBranchAssignment.branch_id == branch_id,
                EmployeeBranchAssignment.status == "active",
            )
            .with_for_update(of=[Employee, EmployeeBranchAssignment])
        )

    def payment(self, workspace_id: UUID, payment_id: UUID) -> PaymentMethod | None:
        return self.session.scalar(
            select(PaymentMethod)
            .where(
                PaymentMethod.workspace_id == workspace_id,
                PaymentMethod.id == payment_id,
                PaymentMethod.status == "active",
            )
            .with_for_update()
        )

    def options(
        self,
        workspace_id: UUID,
        branch_id: UUID,
        kind: OptionKind,
        search: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int]:
        query: Select[Any]
        if kind == "services":
            query = (
                CarwashRepository._catalog(workspace_id, branch_id)
                .with_only_columns(
                    CarwashServiceConfig.id.label("id"),
                    Item.name.label("name"),
                    InventoryItemProfile.sale_price,
                    InventoryItemProfile.tax_rate,
                    CarwashServiceConfig.washer_rate,
                    CarwashServiceConfig.supervisor_rate,
                    maintain_column_froms=True,
                )
                .join(
                    CarwashServiceConfig,
                    (CarwashServiceConfig.workspace_id == Item.workspace_id)
                    & (CarwashServiceConfig.item_id == Item.id)
                    & (CarwashServiceConfig.branch_id == branch_id),
                )
                .where(
                    CarwashServiceConfig.enabled.is_(True),
                    Item.item_type == "service",
                    Item.status == "active",
                    ItemBranchAssignment.status == "active",
                    ItemCategory.status == "active",
                    UnitOfMeasure.status == "active",
                    InventoryItemProfile.sale_price.is_not(None),
                    InventoryItemProfile.available_in_pos.is_(True),
                )
            )
        elif kind == "customers":
            query = (
                select(Customer.id.label("id"), Customer.display_name.label("name"))
                .join(
                    CustomerBranchAssignment,
                    (Customer.workspace_id == CustomerBranchAssignment.workspace_id)
                    & (Customer.id == CustomerBranchAssignment.customer_id),
                )
                .where(
                    Customer.workspace_id == workspace_id,
                    Customer.status == "active",
                    CustomerBranchAssignment.branch_id == branch_id,
                    CustomerBranchAssignment.status == "active",
                )
            )
        elif kind == "employees":
            query = (
                select(
                    Employee.id.label("id"),
                    (Employee.first_name + " " + Employee.last_name).label("name"),
                )
                .join(
                    EmployeeBranchAssignment,
                    (Employee.workspace_id == EmployeeBranchAssignment.workspace_id)
                    & (Employee.id == EmployeeBranchAssignment.employee_id),
                )
                .where(
                    Employee.workspace_id == workspace_id,
                    Employee.status == "active",
                    EmployeeBranchAssignment.branch_id == branch_id,
                    EmployeeBranchAssignment.status == "active",
                )
            )
        else:
            query = select(PaymentMethod.id.label("id"), PaymentMethod.name.label("name")).where(
                PaymentMethod.workspace_id == workspace_id, PaymentMethod.status == "active"
            )
        source = query.subquery()
        query = select(source)
        if search:
            query = query.where(
                func.lower(source.c.name).contains(search.strip().lower(), autoescape=True)
            )
        total = self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = (
            self.session.execute(
                query.order_by(func.lower(source.c.name), source.c.id)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            .mappings()
            .all()
        )
        return [dict(row) for row in rows], total
