from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import and_, case, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models.administration import PaymentMethod
from app.db.models.agenda import Appointment
from app.db.models.audit import AuditEntry
from app.db.models.catalog import Item, ItemBranchAssignment, UnitOfMeasure
from app.db.models.foundation import Branch, Workspace
from app.db.models.inventory import (
    InventoryItemProfile,
    InventoryMovement,
    InventoryStockBalance,
    InventoryWarehouse,
)
from app.db.models.master_data import Customer, CustomerBranchAssignment
from app.db.models.pos import CashMovement, CashMovementLine, CashRegister
from app.db.models.sales import (
    CustomerPayment,
    CustomerReceivable,
    CustomerReceivableLine,
    PaymentProof,
    Sale,
    SaleLine,
    SalesDocumentCounter,
    SalesQuote,
    SalesQuoteLine,
)


@dataclass(frozen=True)
class PosCatalogRecord:
    item: Item
    unit: UnitOfMeasure
    profile: InventoryItemProfile
    warehouse_id: UUID | None
    stock_quantity: Decimal | None
    minimum_quantity: Decimal | None


@dataclass(frozen=True)
class CashMovementRecord:
    movement: CashMovement
    payment_method: PaymentMethod | None
    lines: tuple[CashMovementLine, ...]


@dataclass(frozen=True)
class RegisterPaymentMethodSummary:
    payment_method: PaymentMethod | None
    payment_method_id: UUID
    payment_method_code: str
    payment_method_name: str
    payment_channel: str
    settlement_policy: str
    affects_cash_drawer: bool
    requires_evidence: bool
    sales_total: Decimal
    sales_count: int


@dataclass(frozen=True)
class CashRegisterRecord:
    register: CashRegister
    branch: Branch
    movements: tuple[CashMovementRecord, ...]
    movements_count: int
    sales_total: Decimal
    sales_count: int
    voided_sales_count: int
    sales_by_payment_method: tuple[RegisterPaymentMethodSummary, ...]


@dataclass(frozen=True)
class QuoteRecord:
    quote: SalesQuote
    branch: Branch
    customer: Customer | None
    payment_method: PaymentMethod | None
    lines: tuple[SalesQuoteLine, ...]
    converted_sale_id: UUID | None


@dataclass(frozen=True)
class SaleRecord:
    sale: Sale
    branch: Branch
    customer: Customer | None
    payment_method: PaymentMethod
    lines: tuple[SaleLine, ...]


@dataclass(frozen=True)
class CustomerPaymentRecord:
    payment: CustomerPayment
    payment_method: PaymentMethod
    proofs: tuple[PaymentProof, ...]


@dataclass(frozen=True)
class ReceivableRecord:
    receivable: CustomerReceivable
    branch: Branch
    customer: Customer
    payment_method: PaymentMethod | None
    lines: tuple[CustomerReceivableLine, ...]
    payments: tuple[CustomerPaymentRecord, ...]
    proofs: tuple[PaymentProof, ...]


@dataclass(frozen=True)
class Page:
    items: tuple[Any, ...]
    total_items: int


class PosRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def workspace(self, workspace_id: UUID) -> Workspace | None:
        return self._session.scalar(
            select(Workspace).where(Workspace.id == workspace_id, Workspace.status == "active")
        )

    def branch(self, workspace_id: UUID, branch_id: UUID) -> Branch | None:
        return self._session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
                Branch.status == "active",
            )
        )

    def customer(self, workspace_id: UUID, branch_id: UUID, customer_id: UUID) -> Customer | None:
        return self._session.scalar(
            select(Customer)
            .join(
                CustomerBranchAssignment,
                (CustomerBranchAssignment.workspace_id == Customer.workspace_id)
                & (CustomerBranchAssignment.customer_id == Customer.id),
            )
            .where(
                Customer.workspace_id == workspace_id,
                Customer.id == customer_id,
                Customer.status == "active",
                CustomerBranchAssignment.branch_id == branch_id,
                CustomerBranchAssignment.status == "active",
            )
        )

    def payment_method(self, workspace_id: UUID, method_id: UUID) -> PaymentMethod | None:
        return self._session.scalar(
            select(PaymentMethod).where(
                PaymentMethod.workspace_id == workspace_id,
                PaymentMethod.id == method_id,
                PaymentMethod.status == "active",
            )
        )

    def historical_payment_method(
        self, workspace_id: UUID, method_id: UUID | None
    ) -> PaymentMethod | None:
        if method_id is None:
            return None
        return self._session.scalar(
            select(PaymentMethod).where(
                PaymentMethod.workspace_id == workspace_id,
                PaymentMethod.id == method_id,
            )
        )

    def cash_payment_method(self, workspace_id: UUID) -> PaymentMethod | None:
        return self._session.scalar(
            select(PaymentMethod)
            .where(
                PaymentMethod.workspace_id == workspace_id,
                PaymentMethod.status == "active",
                PaymentMethod.channel == "cash",
                PaymentMethod.affects_cash_drawer.is_(True),
            )
            .order_by(PaymentMethod.is_system.desc(), PaymentMethod.id)
            .limit(1)
        )

    def payment_methods(self, workspace_id: UUID) -> tuple[PaymentMethod, ...]:
        return tuple(
            self._session.scalars(
                select(PaymentMethod)
                .where(
                    PaymentMethod.workspace_id == workspace_id,
                    PaymentMethod.status == "active",
                )
                .order_by(PaymentMethod.name, PaymentMethod.id)
            )
        )

    def active_item_snapshot(
        self,
        workspace_id: UUID,
        branch_id: UUID,
        item_id: UUID,
    ) -> tuple[Item, UnitOfMeasure] | None:
        row = self._session.execute(
            select(Item, UnitOfMeasure)
            .join(
                ItemBranchAssignment,
                (ItemBranchAssignment.workspace_id == Item.workspace_id)
                & (ItemBranchAssignment.item_id == Item.id),
            )
            .join(
                UnitOfMeasure,
                (UnitOfMeasure.workspace_id == Item.workspace_id)
                & (UnitOfMeasure.id == Item.unit_of_measure_id),
            )
            .where(
                Item.workspace_id == workspace_id,
                Item.id == item_id,
                Item.status == "active",
                ItemBranchAssignment.branch_id == branch_id,
                ItemBranchAssignment.status == "active",
            )
        ).one_or_none()
        return (row[0], row[1]) if row is not None else None

    def default_warehouse(self, workspace_id: UUID, branch_id: UUID) -> InventoryWarehouse | None:
        return self._session.scalar(
            select(InventoryWarehouse).where(
                InventoryWarehouse.workspace_id == workspace_id,
                InventoryWarehouse.branch_id == branch_id,
                InventoryWarehouse.is_default.is_(True),
                InventoryWarehouse.status == "active",
            )
        )

    def inventory_movement(self, workspace_id: UUID, movement_id: UUID) -> InventoryMovement | None:
        return self._session.scalar(
            select(InventoryMovement).where(
                InventoryMovement.workspace_id == workspace_id,
                InventoryMovement.id == movement_id,
            )
        )

    def catalog(
        self,
        *,
        workspace_id: UUID,
        branch_id: UUID,
        item_ids: set[UUID] | None = None,
    ) -> tuple[PosCatalogRecord, ...]:
        default_warehouse = self.default_warehouse(workspace_id, branch_id)
        statement = (
            select(
                Item,
                UnitOfMeasure,
                InventoryItemProfile,
                InventoryStockBalance.quantity,
                InventoryStockBalance.minimum_quantity,
            )
            .join(
                ItemBranchAssignment,
                (ItemBranchAssignment.workspace_id == Item.workspace_id)
                & (ItemBranchAssignment.item_id == Item.id),
            )
            .join(
                UnitOfMeasure,
                (UnitOfMeasure.workspace_id == Item.workspace_id)
                & (UnitOfMeasure.id == Item.unit_of_measure_id),
            )
            .join(
                InventoryItemProfile,
                (InventoryItemProfile.workspace_id == Item.workspace_id)
                & (InventoryItemProfile.item_id == Item.id),
            )
            .outerjoin(
                InventoryStockBalance,
                (InventoryStockBalance.workspace_id == Item.workspace_id)
                & (InventoryStockBalance.item_id == Item.id)
                & (
                    InventoryStockBalance.warehouse_id
                    == (default_warehouse.id if default_warehouse is not None else None)
                ),
            )
            .where(
                Item.workspace_id == workspace_id,
                Item.status == "active",
                Item.item_type.in_(("product", "service", "membership")),
                ItemBranchAssignment.branch_id == branch_id,
                ItemBranchAssignment.status == "active",
                InventoryItemProfile.sale_price.is_not(None),
            )
        )
        if item_ids is not None:
            if not item_ids:
                return ()
            statement = statement.where(Item.id.in_(item_ids))
        rows = self._session.execute(statement.order_by(Item.name, Item.id))
        return tuple(
            PosCatalogRecord(
                item=row[0],
                unit=row[1],
                profile=row[2],
                warehouse_id=default_warehouse.id if default_warehouse is not None else None,
                stock_quantity=(Decimal(row[3]) if row[3] is not None else None),
                minimum_quantity=(Decimal(row[4]) if row[4] is not None else None),
            )
            for row in rows
        )

    def current_register(
        self, workspace_id: UUID, branch_id: UUID, *, lock: bool = False
    ) -> CashRegister | None:
        statement = select(CashRegister).where(
            CashRegister.workspace_id == workspace_id,
            CashRegister.branch_id == branch_id,
            CashRegister.status == "open",
        )
        if lock:
            statement = statement.with_for_update(of=CashRegister)
        return self._session.scalar(statement)

    def get_register(
        self,
        workspace_id: UUID,
        register_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        lock: bool = False,
    ) -> CashRegister | None:
        statement = select(CashRegister).where(
            CashRegister.workspace_id == workspace_id,
            CashRegister.id == register_id,
        )
        if allowed_branch_ids is not None:
            statement = statement.where(CashRegister.branch_id.in_(allowed_branch_ids))
        if lock:
            statement = statement.with_for_update(of=CashRegister)
        return self._session.scalar(statement)

    def register_by_open_key(self, workspace_id: UUID, idempotency_key: str) -> CashRegister | None:
        return self._session.scalar(
            select(CashRegister).where(
                CashRegister.workspace_id == workspace_id,
                CashRegister.open_idempotency_key == idempotency_key,
            )
        )

    def register_by_close_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> CashRegister | None:
        return self._session.scalar(
            select(CashRegister).where(
                CashRegister.workspace_id == workspace_id,
                CashRegister.close_idempotency_key == idempotency_key,
            )
        )

    def add_register(self, register: CashRegister) -> None:
        self._session.add(register)
        self._session.flush()

    def register_record(
        self,
        register: CashRegister,
        *,
        movement_limit: int = 100,
    ) -> CashRegisterRecord:
        return self._register_records(
            (register,),
            include_movements=True,
            movement_limit=movement_limit,
        )[0]

    def list_registers(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        page: int,
        page_size: int,
    ) -> Page:
        predicates = [CashRegister.workspace_id == workspace_id]
        if allowed_branch_ids is not None:
            predicates.append(CashRegister.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            predicates.append(CashRegister.branch_id == branch_id)
        total = int(self._session.scalar(select(func.count()).where(*predicates)) or 0)
        registers = self._session.scalars(
            select(CashRegister)
            .where(*predicates)
            .order_by(CashRegister.opened_at.desc(), CashRegister.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return Page(
            self._register_records(
                registers,
                include_movements=False,
                movement_limit=0,
            ),
            total,
        )

    def list_cash_movements(
        self,
        *,
        workspace_id: UUID,
        register_id: UUID,
        movement_type: str | None,
        page: int,
        page_size: int,
    ) -> Page:
        predicates = [
            CashMovement.workspace_id == workspace_id,
            CashMovement.cash_register_id == register_id,
        ]
        if movement_type is not None:
            predicates.append(CashMovement.movement_type == movement_type)
        total = int(
            self._session.scalar(select(func.count()).select_from(CashMovement).where(*predicates))
            or 0
        )
        movements = self._session.scalars(
            select(CashMovement)
            .where(*predicates)
            .order_by(CashMovement.created_at.desc(), CashMovement.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return Page(self._movement_records(movements), total)

    def movement_record(self, movement: CashMovement) -> CashMovementRecord:
        return self._movement_records((movement,))[0]

    def movement_by_key(self, workspace_id: UUID, idempotency_key: str) -> CashMovement | None:
        return self._session.scalar(
            select(CashMovement).where(
                CashMovement.workspace_id == workspace_id,
                CashMovement.idempotency_key == idempotency_key,
            )
        )

    def movement_for_sale(self, workspace_id: UUID, sale_id: UUID) -> CashMovement | None:
        return self._session.scalar(
            select(CashMovement).where(
                CashMovement.workspace_id == workspace_id,
                CashMovement.sale_id == sale_id,
            )
        )

    def movement_for_payment(self, workspace_id: UUID, payment_id: UUID) -> CashMovement | None:
        return self._session.scalar(
            select(CashMovement).where(
                CashMovement.workspace_id == workspace_id,
                CashMovement.customer_payment_id == payment_id,
            )
        )

    def add_movement(
        self,
        movement: CashMovement,
        lines: Sequence[CashMovementLine] = (),
    ) -> None:
        self._session.add(movement)
        self._session.flush()
        for line in lines:
            line.cash_movement_id = movement.id
            self._session.add(line)
        self._session.flush()

    def get_quote(
        self,
        workspace_id: UUID,
        quote_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        lock: bool = False,
    ) -> SalesQuote | None:
        statement = select(SalesQuote).where(
            SalesQuote.workspace_id == workspace_id,
            SalesQuote.id == quote_id,
        )
        if allowed_branch_ids is not None:
            statement = statement.where(SalesQuote.branch_id.in_(allowed_branch_ids))
        if lock:
            statement = statement.with_for_update(of=SalesQuote)
        return self._session.scalar(statement)

    def expire_due_quotes(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None = None,
        quote_id: UUID | None = None,
    ) -> tuple[UUID, ...]:
        predicates = [
            SalesQuote.workspace_id == workspace_id,
            SalesQuote.status == "open",
            SalesQuote.expires_at.is_not(None),
            SalesQuote.expires_at <= func.clock_timestamp(),
        ]
        if allowed_branch_ids is not None:
            predicates.append(SalesQuote.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            predicates.append(SalesQuote.branch_id == branch_id)
        if quote_id is not None:
            predicates.append(SalesQuote.id == quote_id)
        return tuple(
            self._session.scalars(
                update(SalesQuote)
                .where(*predicates)
                .values(
                    status="expired",
                    crm_status=case(
                        (SalesQuote.origin == "crm", "vencida"),
                        else_=SalesQuote.crm_status,
                    ),
                    closed_at=func.clock_timestamp(),
                    updated_at=func.clock_timestamp(),
                    version=SalesQuote.version + 1,
                )
                .returning(SalesQuote.id)
            )
        )

    def quote_deadline_has_elapsed(self, expires_at: datetime | None) -> bool:
        if expires_at is None:
            return False
        return bool(self._session.scalar(select(func.clock_timestamp() >= expires_at)))

    def quote_by_key(self, workspace_id: UUID, idempotency_key: str) -> SalesQuote | None:
        return self._session.scalar(
            select(SalesQuote).where(
                SalesQuote.workspace_id == workspace_id,
                SalesQuote.creation_idempotency_key == idempotency_key,
            )
        )

    def add_quote(self, quote: SalesQuote, lines: Sequence[SalesQuoteLine]) -> None:
        self._session.add(quote)
        self._session.flush()
        self.replace_quote_lines(quote, lines)

    def replace_quote_lines(self, quote: SalesQuote, lines: Sequence[SalesQuoteLine]) -> None:
        existing = self._session.scalars(
            select(SalesQuoteLine).where(
                SalesQuoteLine.workspace_id == quote.workspace_id,
                SalesQuoteLine.quote_id == quote.id,
            )
        ).all()
        for line in existing:
            self._session.delete(line)
        self._session.flush()
        for line in lines:
            line.quote_id = quote.id
            self._session.add(line)
        self._session.flush()

    def quote_record(self, quote: SalesQuote) -> QuoteRecord:
        return self._quote_records((quote,), include_details=True)[0]

    def list_quotes(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        customer_id: UUID | None,
        status: str | None,
        kind: str | None,
        origin: str | None = None,
        crm_status: str | None = None,
        page: int,
        page_size: int,
        include_details: bool = False,
    ) -> Page:
        predicates = [SalesQuote.workspace_id == workspace_id]
        if allowed_branch_ids is not None:
            predicates.append(SalesQuote.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            predicates.append(SalesQuote.branch_id == branch_id)
        if customer_id is not None:
            predicates.append(SalesQuote.customer_id == customer_id)
        if status is not None:
            predicates.append(SalesQuote.status == status)
        if kind is not None:
            predicates.append(SalesQuote.kind == kind)
        if origin is not None:
            predicates.append(SalesQuote.origin == origin)
        if crm_status is not None:
            predicates.append(SalesQuote.crm_status == crm_status)
        total = int(self._session.scalar(select(func.count()).where(*predicates)) or 0)
        quotes = self._session.scalars(
            select(SalesQuote)
            .where(*predicates)
            .order_by(SalesQuote.updated_at.desc(), SalesQuote.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return Page(self._quote_records(quotes, include_details=include_details), total)

    def quote_totals(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> tuple[int, int, int, Decimal, Decimal]:
        predicates = [SalesQuote.workspace_id == workspace_id]
        if allowed_branch_ids is not None:
            predicates.append(SalesQuote.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            predicates.append(SalesQuote.branch_id == branch_id)
        open_quote = (SalesQuote.status == "open") & (SalesQuote.kind == "quote")
        open_held = (SalesQuote.status == "open") & (SalesQuote.kind == "held")
        row = self._session.execute(
            select(
                func.count(SalesQuote.id).filter(open_quote),
                func.count(SalesQuote.id).filter(open_held),
                func.count(SalesQuote.id).filter(SalesQuote.status == "converted"),
                func.coalesce(func.sum(SalesQuote.total).filter(open_quote), Decimal("0")),
                func.coalesce(func.sum(SalesQuote.total).filter(open_held), Decimal("0")),
            ).where(*predicates)
        ).one()
        return (
            int(row[0] or 0),
            int(row[1] or 0),
            int(row[2] or 0),
            Decimal(row[3] or 0),
            Decimal(row[4] or 0),
        )

    def sale_by_key(self, workspace_id: UUID, idempotency_key: str) -> Sale | None:
        return self._session.scalar(
            select(Sale).where(
                Sale.workspace_id == workspace_id,
                Sale.creation_idempotency_key == idempotency_key,
            )
        )

    def sale_by_void_key(self, workspace_id: UUID, idempotency_key: str) -> Sale | None:
        return self._session.scalar(
            select(Sale).where(
                Sale.workspace_id == workspace_id,
                Sale.void_idempotency_key == idempotency_key,
            )
        )

    def get_sale(
        self,
        workspace_id: UUID,
        sale_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        lock: bool = False,
    ) -> Sale | None:
        statement = select(Sale).where(
            Sale.workspace_id == workspace_id,
            Sale.id == sale_id,
        )
        if allowed_branch_ids is not None:
            statement = statement.where(Sale.branch_id.in_(allowed_branch_ids))
        if lock:
            statement = statement.with_for_update(of=Sale)
        return self._session.scalar(statement)

    def add_sale(self, sale: Sale, lines: Sequence[SaleLine]) -> None:
        self._session.add(sale)
        self._session.flush()
        for line in lines:
            line.sale_id = sale.id
            self._session.add(line)
        self._session.flush()

    def sale_record(self, sale: Sale) -> SaleRecord:
        return self._sale_records((sale,), include_details=True)[0]

    def list_sales(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        register_id: UUID | None,
        customer_id: UUID | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
        include_details: bool = False,
    ) -> Page:
        predicates = [Sale.workspace_id == workspace_id]
        if allowed_branch_ids is not None:
            predicates.append(Sale.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            predicates.append(Sale.branch_id == branch_id)
        if register_id is not None:
            predicates.append(Sale.cash_register_id == register_id)
        if customer_id is not None:
            predicates.append(Sale.customer_id == customer_id)
        if status is not None:
            predicates.append(Sale.status == status)
        local_sale_date = func.date(func.timezone(Branch.timezone, Sale.completed_at))
        if date_from is not None:
            predicates.append(local_sale_date >= date_from)
        if date_to is not None:
            predicates.append(local_sale_date <= date_to)
        branch_join = (Branch.workspace_id == Sale.workspace_id) & (Branch.id == Sale.branch_id)
        total = int(
            self._session.scalar(
                select(func.count()).select_from(Sale).join(Branch, branch_join).where(*predicates)
            )
            or 0
        )
        sales = self._session.scalars(
            select(Sale)
            .join(Branch, branch_join)
            .where(*predicates)
            .order_by(Sale.completed_at.desc(), Sale.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return Page(self._sale_records(sales, include_details=include_details), total)

    def sales_totals(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        date_from: date | None,
        date_to: date | None,
    ) -> tuple[Decimal, Decimal, Decimal, Decimal, int, int]:
        predicates = [Sale.workspace_id == workspace_id]
        if allowed_branch_ids is not None:
            predicates.append(Sale.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            predicates.append(Sale.branch_id == branch_id)
        local_sale_date = func.date(func.timezone(Branch.timezone, Sale.completed_at))
        if date_from is not None:
            predicates.append(local_sale_date >= date_from)
        if date_to is not None:
            predicates.append(local_sale_date <= date_to)
        branch_join = (Branch.workspace_id == Sale.workspace_id) & (Branch.id == Sale.branch_id)
        row = self._session.execute(
            select(
                func.coalesce(
                    func.sum(Sale.subtotal).filter(Sale.status == "completed"),
                    Decimal("0"),
                ),
                func.coalesce(
                    func.sum(Sale.discount_amount).filter(Sale.status == "completed"),
                    Decimal("0"),
                ),
                func.coalesce(
                    func.sum(Sale.tax_amount).filter(Sale.status == "completed"),
                    Decimal("0"),
                ),
                func.coalesce(
                    func.sum(Sale.total).filter(Sale.status == "completed"),
                    Decimal("0"),
                ),
                func.count(Sale.id).filter(Sale.status == "completed"),
                func.count(Sale.id).filter(Sale.status == "voided"),
            )
            .join(Branch, branch_join)
            .where(*predicates)
        ).one()
        return (
            Decimal(row[0] or 0),
            Decimal(row[1] or 0),
            Decimal(row[2] or 0),
            Decimal(row[3] or 0),
            int(row[4] or 0),
            int(row[5] or 0),
        )

    def receivable_by_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> CustomerReceivable | None:
        return self._session.scalar(
            select(CustomerReceivable).where(
                CustomerReceivable.workspace_id == workspace_id,
                CustomerReceivable.creation_idempotency_key == idempotency_key,
            )
        )

    def receivable_for_sale(
        self, workspace_id: UUID, sale_id: UUID, *, lock: bool = False
    ) -> CustomerReceivable | None:
        statement = select(CustomerReceivable).where(
            CustomerReceivable.workspace_id == workspace_id,
            CustomerReceivable.sale_id == sale_id,
        )
        if lock:
            statement = statement.with_for_update(of=CustomerReceivable)
        return self._session.scalar(statement)

    def receivable_for_appointment(
        self, workspace_id: UUID, appointment_id: UUID, *, lock: bool = False
    ) -> CustomerReceivable | None:
        statement = select(CustomerReceivable).where(
            CustomerReceivable.workspace_id == workspace_id,
            CustomerReceivable.appointment_id == appointment_id,
        )
        if lock:
            statement = statement.with_for_update(of=CustomerReceivable)
        return self._session.scalar(statement)

    def get_receivable(
        self,
        workspace_id: UUID,
        receivable_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        lock: bool = False,
    ) -> CustomerReceivable | None:
        statement = select(CustomerReceivable).where(
            CustomerReceivable.workspace_id == workspace_id,
            CustomerReceivable.id == receivable_id,
        )
        if allowed_branch_ids is not None:
            statement = statement.where(CustomerReceivable.branch_id.in_(allowed_branch_ids))
        if lock:
            statement = statement.with_for_update(of=CustomerReceivable)
        return self._session.scalar(statement)

    def add_receivable(
        self,
        receivable: CustomerReceivable,
        lines: Sequence[CustomerReceivableLine],
    ) -> None:
        self._session.add(receivable)
        self._session.flush()
        for line in lines:
            line.receivable_id = receivable.id
            self._session.add(line)
        self._session.flush()

    def receivable_lines(
        self,
        workspace_id: UUID,
        receivable_id: UUID,
    ) -> tuple[CustomerReceivableLine, ...]:
        return tuple(
            self._session.scalars(
                select(CustomerReceivableLine)
                .where(
                    CustomerReceivableLine.workspace_id == workspace_id,
                    CustomerReceivableLine.receivable_id == receivable_id,
                )
                .order_by(CustomerReceivableLine.position)
            )
        )

    def receivable_record(self, receivable: CustomerReceivable) -> ReceivableRecord:
        return self._receivable_records((receivable,), include_details=True)[0]

    def list_receivables(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
        customer_id: UUID | None,
        status: str | None,
        overdue: bool | None,
        page: int,
        page_size: int,
        include_details: bool = False,
    ) -> Page:
        predicates = [CustomerReceivable.workspace_id == workspace_id]
        if allowed_branch_ids is not None:
            predicates.append(CustomerReceivable.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            predicates.append(CustomerReceivable.branch_id == branch_id)
        if customer_id is not None:
            predicates.append(CustomerReceivable.customer_id == customer_id)
        if status is not None:
            predicates.append(CustomerReceivable.status == status)
        local_today = func.date(func.timezone(Branch.timezone, func.now()))
        if overdue is True:
            predicates.extend(
                [
                    CustomerReceivable.due_date < local_today,
                    CustomerReceivable.status.in_(("pending", "partial")),
                ]
            )
        elif overdue is False:
            predicates.append(
                or_(
                    CustomerReceivable.due_date.is_(None),
                    CustomerReceivable.due_date >= local_today,
                    CustomerReceivable.status.not_in(("pending", "partial")),
                )
            )
        branch_join = (Branch.workspace_id == CustomerReceivable.workspace_id) & (
            Branch.id == CustomerReceivable.branch_id
        )
        total = int(
            self._session.scalar(
                select(func.count())
                .select_from(CustomerReceivable)
                .join(Branch, branch_join)
                .where(*predicates)
            )
            or 0
        )
        rows = self._session.scalars(
            select(CustomerReceivable)
            .join(Branch, branch_join)
            .where(*predicates)
            .order_by(
                CustomerReceivable.due_date.asc().nulls_last(),
                CustomerReceivable.created_at.desc(),
                CustomerReceivable.id,
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return Page(self._receivable_records(rows, include_details=include_details), total)

    def receivable_totals(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        branch_id: UUID | None,
    ) -> tuple[Decimal, Decimal, Decimal, Decimal, int, int, int]:
        predicates = [CustomerReceivable.workspace_id == workspace_id]
        if allowed_branch_ids is not None:
            predicates.append(CustomerReceivable.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            predicates.append(CustomerReceivable.branch_id == branch_id)
        active = CustomerReceivable.status != "cancelled"
        pending = CustomerReceivable.status.in_(("pending", "partial"))
        local_today = func.date(func.timezone(Branch.timezone, func.now()))
        overdue = pending & (CustomerReceivable.due_date < local_today)
        balance = CustomerReceivable.amount - CustomerReceivable.paid_amount
        branch_join = (Branch.workspace_id == CustomerReceivable.workspace_id) & (
            Branch.id == CustomerReceivable.branch_id
        )
        row = self._session.execute(
            select(
                func.coalesce(func.sum(CustomerReceivable.amount).filter(active), Decimal("0")),
                func.coalesce(
                    func.sum(CustomerReceivable.paid_amount).filter(active), Decimal("0")
                ),
                func.coalesce(func.sum(balance).filter(pending), Decimal("0")),
                func.coalesce(func.sum(balance).filter(overdue), Decimal("0")),
                func.count(CustomerReceivable.id).filter(pending),
                func.count(CustomerReceivable.id).filter(CustomerReceivable.status == "partial"),
                func.count(CustomerReceivable.id).filter(overdue),
            )
            .join(Branch, branch_join)
            .where(*predicates)
        ).one()
        return (
            Decimal(row[0] or 0),
            Decimal(row[1] or 0),
            Decimal(row[2] or 0),
            Decimal(row[3] or 0),
            int(row[4] or 0),
            int(row[5] or 0),
            int(row[6] or 0),
        )

    def payment_by_key(self, workspace_id: UUID, idempotency_key: str) -> CustomerPayment | None:
        return self._session.scalar(
            select(CustomerPayment).where(
                CustomerPayment.workspace_id == workspace_id,
                CustomerPayment.idempotency_key == idempotency_key,
            )
        )

    def payment_by_reversal_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> CustomerPayment | None:
        return self._session.scalar(
            select(CustomerPayment).where(
                CustomerPayment.workspace_id == workspace_id,
                CustomerPayment.reversal_idempotency_key == idempotency_key,
            )
        )

    def get_payment(
        self, workspace_id: UUID, payment_id: UUID, *, lock: bool = False
    ) -> CustomerPayment | None:
        statement = select(CustomerPayment).where(
            CustomerPayment.workspace_id == workspace_id,
            CustomerPayment.id == payment_id,
        )
        if lock:
            statement = statement.with_for_update(of=CustomerPayment)
        return self._session.scalar(statement)

    def add_payment(self, payment: CustomerPayment) -> None:
        self._session.add(payment)
        self._session.flush()

    def payment_record(self, payment: CustomerPayment) -> CustomerPaymentRecord:
        method = self._session.scalar(
            select(PaymentMethod).where(
                PaymentMethod.workspace_id == payment.workspace_id,
                PaymentMethod.id == payment.payment_method_id,
            )
        )
        if method is None:
            raise RuntimeError("Payment method disappeared.")
        proofs = tuple(
            self._session.scalars(
                select(PaymentProof)
                .where(
                    PaymentProof.workspace_id == payment.workspace_id,
                    PaymentProof.customer_payment_id == payment.id,
                )
                .order_by(PaymentProof.created_at, PaymentProof.id)
            )
        )
        return CustomerPaymentRecord(payment, method, proofs)

    def add_proof(self, proof: PaymentProof) -> None:
        self._session.add(proof)
        self._session.flush()

    def proof_by_receivable_checksum(
        self, workspace_id: UUID, receivable_id: UUID, checksum_sha256: str
    ) -> PaymentProof | None:
        return self._session.scalar(
            select(PaymentProof).where(
                PaymentProof.workspace_id == workspace_id,
                PaymentProof.receivable_id == receivable_id,
                PaymentProof.checksum_sha256 == checksum_sha256,
            )
        )

    def get_proof(
        self,
        *,
        workspace_id: UUID,
        proof_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> PaymentProof | None:
        statement = select(PaymentProof).where(
            PaymentProof.workspace_id == workspace_id,
            PaymentProof.id == proof_id,
        )
        if allowed_branch_ids is not None:
            statement = statement.where(PaymentProof.branch_id.in_(allowed_branch_ids))
        return self._session.scalar(statement)

    def appointment(
        self, workspace_id: UUID, appointment_id: UUID, *, lock: bool = False
    ) -> Appointment | None:
        statement = select(Appointment).where(
            Appointment.workspace_id == workspace_id,
            Appointment.id == appointment_id,
        )
        if lock:
            statement = statement.with_for_update(of=Appointment)
        return self._session.scalar(statement)

    def next_document_number(
        self,
        workspace_id: UUID,
        document: Literal["quote", "sale", "receivable"],
    ) -> str:
        self._session.execute(
            insert(SalesDocumentCounter)
            .values(workspace_id=workspace_id)
            .on_conflict_do_nothing(index_elements=[SalesDocumentCounter.workspace_id])
        )
        counter = self._session.scalar(
            select(SalesDocumentCounter)
            .where(SalesDocumentCounter.workspace_id == workspace_id)
            .with_for_update()
        )
        if counter is None:
            raise RuntimeError("Sales document counter could not be initialized.")
        field, prefix = {
            "quote": ("last_quote_value", "COT"),
            "sale": ("last_sale_value", "VTA"),
            "receivable": ("last_receivable_value", "CXC"),
        }[document]
        value = int(getattr(counter, field)) + 1
        setattr(counter, field, value)
        self._session.flush()
        return f"{prefix}-{value:08d}"

    def add_audit(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        action: str,
        target_type: str,
        target_id: UUID,
        request_id: str | None,
        details: dict[str, Any],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=request_id,
                details=details,
            )
        )
        self._session.flush()

    def _quote_records(
        self,
        quotes: Sequence[SalesQuote],
        *,
        include_details: bool,
    ) -> tuple[QuoteRecord, ...]:
        if not quotes:
            return ()
        workspace_id = quotes[0].workspace_id
        quote_ids = {quote.id for quote in quotes}
        branch_ids = {quote.branch_id for quote in quotes}
        customer_ids = {quote.customer_id for quote in quotes if quote.customer_id is not None}
        method_ids = {
            quote.payment_method_id for quote in quotes if quote.payment_method_id is not None
        }
        branches = {
            branch.id: branch
            for branch in self._session.scalars(
                select(Branch).where(
                    Branch.workspace_id == workspace_id,
                    Branch.id.in_(branch_ids),
                )
            )
        }
        customers = {
            customer.id: customer
            for customer in self._session.scalars(
                select(Customer).where(
                    Customer.workspace_id == workspace_id,
                    Customer.id.in_(customer_ids),
                )
            )
        }
        methods = {
            method.id: method
            for method in self._session.scalars(
                select(PaymentMethod).where(
                    PaymentMethod.workspace_id == workspace_id,
                    PaymentMethod.id.in_(method_ids),
                )
            )
        }
        lines: dict[UUID, list[SalesQuoteLine]] = defaultdict(list)
        converted_sales: dict[UUID, UUID] = {}
        if include_details:
            for line in self._session.scalars(
                select(SalesQuoteLine)
                .where(
                    SalesQuoteLine.workspace_id == workspace_id,
                    SalesQuoteLine.quote_id.in_(quote_ids),
                )
                .order_by(SalesQuoteLine.quote_id, SalesQuoteLine.position)
            ):
                lines[line.quote_id].append(line)
            converted_sales = {
                quote_id: sale_id
                for quote_id, sale_id in self._session.execute(
                    select(Sale.quote_id, Sale.id).where(
                        Sale.workspace_id == workspace_id,
                        Sale.quote_id.in_(quote_ids),
                    )
                )
                if quote_id is not None
            }
        records: list[QuoteRecord] = []
        for quote in quotes:
            branch = branches.get(quote.branch_id)
            if branch is None:
                raise RuntimeError("Quote branch disappeared.")
            records.append(
                QuoteRecord(
                    quote=quote,
                    branch=branch,
                    customer=(
                        customers.get(quote.customer_id) if quote.customer_id is not None else None
                    ),
                    payment_method=(
                        methods.get(quote.payment_method_id)
                        if quote.payment_method_id is not None
                        else None
                    ),
                    lines=tuple(lines.get(quote.id, ())),
                    converted_sale_id=converted_sales.get(quote.id),
                )
            )
        return tuple(records)

    def _sale_records(
        self,
        sales: Sequence[Sale],
        *,
        include_details: bool,
    ) -> tuple[SaleRecord, ...]:
        if not sales:
            return ()
        workspace_id = sales[0].workspace_id
        sale_ids = {sale.id for sale in sales}
        branch_ids = {sale.branch_id for sale in sales}
        customer_ids = {sale.customer_id for sale in sales if sale.customer_id is not None}
        method_ids = {sale.payment_method_id for sale in sales}
        branches = {
            branch.id: branch
            for branch in self._session.scalars(
                select(Branch).where(
                    Branch.workspace_id == workspace_id,
                    Branch.id.in_(branch_ids),
                )
            )
        }
        customers = {
            customer.id: customer
            for customer in self._session.scalars(
                select(Customer).where(
                    Customer.workspace_id == workspace_id,
                    Customer.id.in_(customer_ids),
                )
            )
        }
        methods = {
            method.id: method
            for method in self._session.scalars(
                select(PaymentMethod).where(
                    PaymentMethod.workspace_id == workspace_id,
                    PaymentMethod.id.in_(method_ids),
                )
            )
        }
        lines: dict[UUID, list[SaleLine]] = defaultdict(list)
        if include_details:
            for line in self._session.scalars(
                select(SaleLine)
                .where(
                    SaleLine.workspace_id == workspace_id,
                    SaleLine.sale_id.in_(sale_ids),
                )
                .order_by(SaleLine.sale_id, SaleLine.position)
            ):
                lines[line.sale_id].append(line)
        records: list[SaleRecord] = []
        for sale in sales:
            branch = branches.get(sale.branch_id)
            method = methods.get(sale.payment_method_id)
            if branch is None:
                raise RuntimeError("Sale branch disappeared.")
            if method is None:
                raise RuntimeError("Sale payment method disappeared.")
            records.append(
                SaleRecord(
                    sale=sale,
                    branch=branch,
                    customer=(
                        customers.get(sale.customer_id) if sale.customer_id is not None else None
                    ),
                    payment_method=method,
                    lines=tuple(lines.get(sale.id, ())),
                )
            )
        return tuple(records)

    def _receivable_records(
        self,
        receivables: Sequence[CustomerReceivable],
        *,
        include_details: bool,
    ) -> tuple[ReceivableRecord, ...]:
        if not receivables:
            return ()
        workspace_id = receivables[0].workspace_id
        receivable_ids = {receivable.id for receivable in receivables}
        branch_ids = {receivable.branch_id for receivable in receivables}
        customer_ids = {receivable.customer_id for receivable in receivables}
        method_ids = {
            receivable.payment_method_id
            for receivable in receivables
            if receivable.payment_method_id is not None
        }
        branches = {
            branch.id: branch
            for branch in self._session.scalars(
                select(Branch).where(
                    Branch.workspace_id == workspace_id,
                    Branch.id.in_(branch_ids),
                )
            )
        }
        customers = {
            customer.id: customer
            for customer in self._session.scalars(
                select(Customer).where(
                    Customer.workspace_id == workspace_id,
                    Customer.id.in_(customer_ids),
                )
            )
        }
        lines: dict[UUID, list[CustomerReceivableLine]] = defaultdict(list)
        payments_by_receivable: dict[UUID, list[CustomerPayment]] = defaultdict(list)
        proofs_by_receivable: dict[UUID, list[PaymentProof]] = defaultdict(list)
        proofs_by_payment: dict[UUID, list[PaymentProof]] = defaultdict(list)
        if include_details:
            for line in self._session.scalars(
                select(CustomerReceivableLine)
                .where(
                    CustomerReceivableLine.workspace_id == workspace_id,
                    CustomerReceivableLine.receivable_id.in_(receivable_ids),
                )
                .order_by(
                    CustomerReceivableLine.receivable_id,
                    CustomerReceivableLine.position,
                )
            ):
                lines[line.receivable_id].append(line)
            payments = self._session.scalars(
                select(CustomerPayment)
                .where(
                    CustomerPayment.workspace_id == workspace_id,
                    CustomerPayment.receivable_id.in_(receivable_ids),
                )
                .order_by(
                    CustomerPayment.receivable_id,
                    CustomerPayment.posted_at.desc(),
                    CustomerPayment.id.desc(),
                )
            ).all()
            payment_ids = {payment.id for payment in payments}
            method_ids.update(payment.payment_method_id for payment in payments)
            for payment in payments:
                payments_by_receivable[payment.receivable_id].append(payment)
            for proof in self._session.scalars(
                select(PaymentProof)
                .where(
                    PaymentProof.workspace_id == workspace_id,
                    or_(
                        PaymentProof.receivable_id.in_(receivable_ids),
                        PaymentProof.customer_payment_id.in_(payment_ids),
                    ),
                )
                .order_by(PaymentProof.created_at, PaymentProof.id)
            ):
                if proof.receivable_id is not None:
                    proofs_by_receivable[proof.receivable_id].append(proof)
                elif proof.customer_payment_id is not None:
                    proofs_by_payment[proof.customer_payment_id].append(proof)
        methods = {
            method.id: method
            for method in self._session.scalars(
                select(PaymentMethod).where(
                    PaymentMethod.workspace_id == workspace_id,
                    PaymentMethod.id.in_(method_ids),
                )
            )
        }
        records: list[ReceivableRecord] = []
        for receivable in receivables:
            branch = branches.get(receivable.branch_id)
            customer = customers.get(receivable.customer_id)
            if branch is None:
                raise RuntimeError("Receivable branch disappeared.")
            if customer is None:
                raise RuntimeError("Receivable customer disappeared.")
            payment_records: list[CustomerPaymentRecord] = []
            for payment in payments_by_receivable.get(receivable.id, ()):
                method = methods.get(payment.payment_method_id)
                if method is None:
                    raise RuntimeError("Payment method disappeared.")
                payment_records.append(
                    CustomerPaymentRecord(
                        payment=payment,
                        payment_method=method,
                        proofs=tuple(proofs_by_payment.get(payment.id, ())),
                    )
                )
            records.append(
                ReceivableRecord(
                    receivable=receivable,
                    branch=branch,
                    customer=customer,
                    payment_method=(
                        methods.get(receivable.payment_method_id)
                        if receivable.payment_method_id is not None
                        else None
                    ),
                    lines=tuple(lines.get(receivable.id, ())),
                    payments=tuple(payment_records),
                    proofs=tuple(proofs_by_receivable.get(receivable.id, ())),
                )
            )
        return tuple(records)

    def _register_records(
        self,
        registers: Sequence[CashRegister],
        *,
        include_movements: bool,
        movement_limit: int,
    ) -> tuple[CashRegisterRecord, ...]:
        if not registers:
            return ()
        workspace_id = registers[0].workspace_id
        register_ids = {register.id for register in registers}
        branch_ids = {register.branch_id for register in registers}

        branches = {
            branch.id: branch
            for branch in self._session.scalars(
                select(Branch).where(
                    Branch.workspace_id == workspace_id,
                    Branch.id.in_(branch_ids),
                )
            )
        }
        if len(branches) != len(branch_ids):
            raise RuntimeError("Cash register branch disappeared.")

        movement_counts = {
            register_id: int(count)
            for register_id, count in self._session.execute(
                select(CashMovement.cash_register_id, func.count(CashMovement.id))
                .where(
                    CashMovement.workspace_id == workspace_id,
                    CashMovement.cash_register_id.in_(register_ids),
                )
                .group_by(CashMovement.cash_register_id)
            )
        }
        movements_by_register: dict[UUID, tuple[CashMovementRecord, ...]] = {
            register_id: () for register_id in register_ids
        }
        if include_movements:
            if len(registers) != 1:
                raise RuntimeError("Detailed register records must be loaded one at a time.")
            register = registers[0]
            movements = self._session.scalars(
                select(CashMovement)
                .where(
                    CashMovement.workspace_id == workspace_id,
                    CashMovement.cash_register_id == register.id,
                )
                .order_by(CashMovement.created_at.desc(), CashMovement.id.desc())
                .limit(movement_limit)
            ).all()
            movements_by_register[register.id] = self._movement_records(movements)

        register_join = and_(
            CashRegister.workspace_id == Sale.workspace_id,
            CashRegister.id == Sale.cash_register_id,
        )
        active_at_cutoff = or_(
            Sale.status == "completed",
            and_(
                Sale.status == "voided",
                CashRegister.closed_at.is_not(None),
                Sale.voided_at > CashRegister.closed_at,
            ),
        )
        sales_rows = self._session.execute(
            select(
                Sale.cash_register_id,
                Sale.payment_method_id,
                Sale.payment_method_code,
                Sale.payment_method_name,
                Sale.payment_channel,
                Sale.settlement_policy,
                Sale.affects_cash_drawer,
                Sale.requires_evidence,
                func.coalesce(func.sum(Sale.total), Decimal("0")),
                func.count(Sale.id),
            )
            .join(CashRegister, register_join)
            .where(
                Sale.workspace_id == workspace_id,
                Sale.cash_register_id.in_(register_ids),
                active_at_cutoff,
            )
            .group_by(
                Sale.cash_register_id,
                Sale.payment_method_id,
                Sale.payment_method_code,
                Sale.payment_method_name,
                Sale.payment_channel,
                Sale.settlement_policy,
                Sale.affects_cash_drawer,
                Sale.requires_evidence,
            )
            .order_by(Sale.cash_register_id, Sale.payment_method_code)
        ).all()
        method_ids = {row[1] for row in sales_rows}
        payment_methods = {
            method.id: method
            for method in self._session.scalars(
                select(PaymentMethod).where(
                    PaymentMethod.workspace_id == workspace_id,
                    PaymentMethod.id.in_(method_ids),
                )
            )
        }
        sales_by_register: dict[UUID, list[RegisterPaymentMethodSummary]] = defaultdict(list)
        for row in sales_rows:
            sales_by_register[row[0]].append(
                RegisterPaymentMethodSummary(
                    payment_method=payment_methods.get(row[1]),
                    payment_method_id=row[1],
                    payment_method_code=row[2],
                    payment_method_name=row[3],
                    payment_channel=row[4],
                    settlement_policy=row[5],
                    affects_cash_drawer=row[6],
                    requires_evidence=row[7],
                    sales_total=Decimal(row[8] or 0),
                    sales_count=int(row[9] or 0),
                )
            )

        voided_at_cutoff = and_(
            Sale.status == "voided",
            or_(
                CashRegister.closed_at.is_(None),
                Sale.voided_at <= CashRegister.closed_at,
            ),
        )
        voided_counts = {
            register_id: int(count)
            for register_id, count in self._session.execute(
                select(Sale.cash_register_id, func.count(Sale.id))
                .join(CashRegister, register_join)
                .where(
                    Sale.workspace_id == workspace_id,
                    Sale.cash_register_id.in_(register_ids),
                    voided_at_cutoff,
                )
                .group_by(Sale.cash_register_id)
            )
        }

        records: list[CashRegisterRecord] = []
        for register in registers:
            breakdown = tuple(sales_by_register.get(register.id, ()))
            records.append(
                CashRegisterRecord(
                    register=register,
                    branch=branches[register.branch_id],
                    movements=movements_by_register[register.id],
                    movements_count=movement_counts.get(register.id, 0),
                    sales_total=sum(
                        (item.sales_total for item in breakdown),
                        start=Decimal("0"),
                    ),
                    sales_count=sum(item.sales_count for item in breakdown),
                    voided_sales_count=voided_counts.get(register.id, 0),
                    sales_by_payment_method=breakdown,
                )
            )
        return tuple(records)

    def _movement_records(
        self, movements: Sequence[CashMovement]
    ) -> tuple[CashMovementRecord, ...]:
        if not movements:
            return ()
        movement_ids = {item.id for item in movements}
        lines: dict[UUID, list[CashMovementLine]] = defaultdict(list)
        for line in self._session.scalars(
            select(CashMovementLine)
            .where(CashMovementLine.cash_movement_id.in_(movement_ids))
            .order_by(CashMovementLine.position)
        ):
            lines[line.cash_movement_id].append(line)
        method_ids = {item.payment_method_id for item in movements if item.payment_method_id}
        methods = {
            item.id: item
            for item in self._session.scalars(
                select(PaymentMethod).where(PaymentMethod.id.in_(method_ids))
            )
        }
        return tuple(
            CashMovementRecord(
                movement=item,
                payment_method=(
                    methods.get(item.payment_method_id)
                    if item.payment_method_id is not None
                    else None
                ),
                lines=tuple(lines.get(item.id, ())),
            )
            for item in movements
        )

    def _branch_or_raise(self, workspace_id: UUID, branch_id: UUID) -> Branch:
        branch = self._session.scalar(
            select(Branch).where(
                Branch.workspace_id == workspace_id,
                Branch.id == branch_id,
            )
        )
        if branch is None:
            raise RuntimeError("Branch disappeared.")
        return branch

    def _customer_snapshot(self, workspace_id: UUID, customer_id: UUID | None) -> Customer | None:
        if customer_id is None:
            return None
        return self._session.scalar(
            select(Customer).where(
                Customer.workspace_id == workspace_id,
                Customer.id == customer_id,
            )
        )
