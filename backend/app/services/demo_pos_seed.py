from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Branch,
    CashMovement,
    CashRegister,
    Customer,
    CustomerPayment,
    CustomerReceivable,
    CustomerReceivableLine,
    DemoSeedRegistry,
    InventoryItemProfile,
    InventoryMovement,
    InventoryMovementLine,
    InventoryStockBalance,
    InventoryWarehouse,
    Item,
    ItemBranchAssignment,
    PaymentMethod,
    PlatformUser,
    Sale,
    SaleLine,
    SalesDocumentCounter,
    SalesQuote,
    SalesQuoteLine,
    UnitOfMeasure,
    WorkspaceMembership,
)
from app.services.demo_manifest import (
    DemoBundle,
    DemoPosLineFixture,
    DemoPosReceivablePaymentFixture,
    DemoPosSaleFixture,
)
from app.services.demo_seed_registry import (
    checksum_payload,
    register_entity,
    registered_entity,
    stable_demo_id,
)
from app.services.pos_money import PricedDocument, PricingInput, money, price_document, quantity


@dataclass(frozen=True)
class PosSeedCounts:
    registers: int
    quotes: int
    sales: int
    receivables: int
    payments: int
    cash_movements: int
    inventory_movements: int


@dataclass(frozen=True)
class _Actor:
    user: PlatformUser
    membership: WorkspaceMembership


@dataclass(frozen=True)
class _CatalogEntry:
    item: Item
    profile: InventoryItemProfile
    unit: UnitOfMeasure


@dataclass(frozen=True)
class _PricedEntry:
    fixture: DemoPosLineFixture
    catalog: _CatalogEntry
    quantity: Decimal
    list_price: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    line_total: Decimal


class _SeedContext:
    def __init__(
        self,
        session: Session,
        bundle: DemoBundle,
        workspace_id: UUID,
        branches: dict[str, Branch],
    ) -> None:
        self.session = session
        self.bundle = bundle
        self.workspace_id = workspace_id
        self.branches = branches
        self.seed_version = bundle.manifest.seed_version
        self.actors = self._load_actors()
        self.methods = self._load_payment_methods()
        self.customers = self._load_customers()
        self.catalog = self._load_catalog()
        self.registers: dict[str, CashRegister] = {}
        self.quotes: dict[str, SalesQuote] = {}
        self.cash_movement_count = 0
        self.inventory_movement_count = 0

    def _load_actors(self) -> dict[str, _Actor]:
        result: dict[str, _Actor] = {}
        for fixture in self.bundle.iam.users:
            user = self.session.get(
                PlatformUser,
                stable_demo_id(self.seed_version, "platform_user", fixture.seed_key),
            )
            membership = self.session.get(
                WorkspaceMembership,
                stable_demo_id(self.seed_version, "membership", fixture.seed_key),
            )
            if user is None or membership is None:
                raise RuntimeError(f"Demo POS actor {fixture.seed_key!r} is missing.")
            result[fixture.seed_key] = _Actor(user, membership)
        return result

    def _load_payment_methods(self) -> dict[str, PaymentMethod]:
        result: dict[str, PaymentMethod] = {}
        for fixture in self.bundle.configuration.payment_methods:
            entity_id = self.session.scalar(
                select(DemoSeedRegistry.entity_id).where(
                    DemoSeedRegistry.workspace_id == self.workspace_id,
                    DemoSeedRegistry.entity_type == "payment_method",
                    DemoSeedRegistry.seed_key == fixture.seed_key,
                )
            )
            method = self.session.get(PaymentMethod, entity_id) if entity_id else None
            if method is None:
                raise RuntimeError(f"Demo POS payment method {fixture.seed_key!r} is missing.")
            result[fixture.seed_key] = method
        return result

    def _load_customers(self) -> dict[str, Customer]:
        result: dict[str, Customer] = {}
        for fixture in self.bundle.customers.items:
            customer = self.session.get(
                Customer,
                stable_demo_id(self.seed_version, "customer", fixture.seed_key),
            )
            if customer is None:
                raise RuntimeError(f"Demo POS customer {fixture.seed_key!r} is missing.")
            result[fixture.seed_key] = customer
        return result

    def _load_catalog(self) -> dict[str, _CatalogEntry]:
        result: dict[str, _CatalogEntry] = {}
        for fixture in self.bundle.catalog.items:
            item = self.session.get(
                Item,
                stable_demo_id(self.seed_version, "item", fixture.seed_key),
            )
            if item is None:
                raise RuntimeError(f"Demo POS item {fixture.seed_key!r} is missing.")
            profile = self.session.scalar(
                select(InventoryItemProfile).where(
                    InventoryItemProfile.workspace_id == self.workspace_id,
                    InventoryItemProfile.item_id == item.id,
                )
            )
            unit = self.session.get(UnitOfMeasure, item.unit_of_measure_id)
            if profile is None or unit is None or profile.sale_price is None:
                continue
            result[fixture.seed_key] = _CatalogEntry(item, profile, unit)
        return result


def seed_pos_demo_data(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> PosSeedCounts:
    context = _SeedContext(session, bundle, workspace_id, branches)
    _seed_registers(context)
    _seed_quotes(context)
    receivable_count, payment_count = _seed_sales(context)
    _seed_cash_adjustments(context)
    _finalize_registers(context)
    _update_document_counter(context)
    session.flush()
    return PosSeedCounts(
        registers=len(bundle.pos.registers),
        quotes=len(bundle.pos.quotes),
        sales=len(bundle.pos.sales),
        receivables=receivable_count,
        payments=payment_count,
        cash_movements=context.cash_movement_count,
        inventory_movements=context.inventory_movement_count,
    )


def _seed_registers(context: _SeedContext) -> None:
    for fixture in context.bundle.pos.registers:
        branch = _branch(context, fixture.branch_code)
        opener = _actor(context, fixture.opened_by_user_seed_key)
        closer = (
            _actor(context, fixture.closed_by_user_seed_key)
            if fixture.closed_by_user_seed_key
            else None
        )
        payload = fixture.model_dump(mode="json")
        registry = context.session.scalar(
            select(DemoSeedRegistry).where(
                DemoSeedRegistry.workspace_id == context.workspace_id,
                DemoSeedRegistry.entity_type == "cash_register",
                DemoSeedRegistry.seed_key == fixture.seed_key,
            )
        )
        adopted = None
        if registry is None and fixture.status == "open":
            adopted = context.session.scalar(
                select(CashRegister).where(
                    CashRegister.workspace_id == context.workspace_id,
                    CashRegister.branch_id == branch.id,
                    CashRegister.status == "open",
                )
            )
        entity_id = (
            registry.entity_id
            if registry is not None
            else adopted.id
            if adopted is not None
            else stable_demo_id(context.seed_version, "cash_register", fixture.seed_key)
        )
        register = (
            registered_entity(
                context.session,
                context.workspace_id,
                "cash_register",
                fixture.seed_key,
                entity_id,
                payload,
                CashRegister,
            )
            if registry is not None
            else adopted
        )
        interim_expected = money(fixture.opening_cash) if fixture.status == "closed" else None
        interim_difference = (
            money(fixture.closing_difference or Decimal("0"))
            if fixture.status == "closed"
            else None
        )
        values: dict[str, Any] = {
            "workspace_id": context.workspace_id,
            "branch_id": branch.id,
            "status": fixture.status,
            "currency_code": "DOP",
            "opening_cash": money(fixture.opening_cash),
            "cash_sales_amount": Decimal("0.00"),
            "receivable_payments_amount": Decimal("0.00"),
            "cash_income_amount": Decimal("0.00"),
            "cash_expense_amount": Decimal("0.00"),
            "expected_cash": interim_expected,
            "actual_cash": (
                money(interim_expected + interim_difference)
                if interim_expected is not None and interim_difference is not None
                else None
            ),
            "difference": interim_difference,
            "notes": fixture.notes,
            "opened_by_membership_id": opener.membership.id,
            "opened_by_platform_user_id": opener.user.id,
            "opened_by_name": opener.user.display_name,
            "opened_at": fixture.opened_at,
            "closed_by_membership_id": closer.membership.id if closer else None,
            "closed_by_platform_user_id": closer.user.id if closer else None,
            "closed_by_name": closer.user.display_name if closer else None,
            "closed_at": fixture.closed_at,
            "open_idempotency_key": f"demo:{context.seed_version}:register:{fixture.seed_key}",
            "open_request_fingerprint": checksum_payload(payload),
            "close_idempotency_key": (
                f"demo:{context.seed_version}:register-close:{fixture.seed_key}" if closer else None
            ),
            "close_request_fingerprint": checksum_payload({"close": payload}) if closer else None,
            "created_at": fixture.opened_at,
            "updated_at": fixture.closed_at or fixture.opened_at,
        }
        if register is None:
            register = CashRegister(id=entity_id, **values)
            context.session.add(register)
            context.session.flush()
        else:
            _assign(register, values)
        if registry is None:
            register_entity(
                context.session,
                context.workspace_id,
                "cash_register",
                fixture.seed_key,
                register.id,
                context.seed_version,
                payload,
            )
        context.registers[fixture.seed_key] = register
    context.session.flush()


def _seed_quotes(context: _SeedContext) -> None:
    for fixture in context.bundle.pos.quotes:
        branch = _branch(context, fixture.branch_code)
        actor = _actor(context, fixture.created_by_user_seed_key)
        customer = _customer(context, fixture.customer_seed_key)
        method = _method(context, fixture.payment_method_seed_key)
        priced, lines = _price_lines(
            context, branch, fixture.lines, fixture.discount_type, fixture.discount_value
        )
        payload = fixture.model_dump(mode="json")
        entity_id = stable_demo_id(context.seed_version, "sales_quote", fixture.seed_key)
        quote = registered_entity(
            context.session,
            context.workspace_id,
            "sales_quote",
            fixture.seed_key,
            entity_id,
            payload,
            SalesQuote,
        )
        values = {
            "workspace_id": context.workspace_id,
            "branch_id": branch.id,
            "customer_id": customer.id if customer else None,
            "document_number": fixture.document_number,
            "kind": fixture.kind,
            "origin": "pos",
            "status": fixture.status,
            "currency_code": "DOP",
            "customer_name": customer.display_name if customer else None,
            "customer_phone": customer.phone if customer else None,
            **_document_values(priced, fixture.discount_type, fixture.discount_value),
            **_payment_snapshot(method),
            "payment_reference": fixture.payment_reference,
            "notes": fixture.notes,
            "expires_at": fixture.expires_at,
            "closed_at": fixture.closed_at,
            "creation_idempotency_key": f"demo:{context.seed_version}:quote:{fixture.seed_key}",
            "request_fingerprint": checksum_payload(payload),
            "created_by_platform_user_id": actor.user.id,
            "updated_by_platform_user_id": actor.user.id,
            "created_at": fixture.created_at,
            "updated_at": fixture.updated_at,
        }
        if quote is None:
            quote = SalesQuote(id=entity_id, **values)
            context.session.add(quote)
            context.session.flush()
            register_entity(
                context.session,
                context.workspace_id,
                "sales_quote",
                fixture.seed_key,
                quote.id,
                context.seed_version,
                payload,
            )
        else:
            _assign(quote, values)
        _seed_quote_lines(context, fixture.seed_key, quote, lines)
        context.quotes[fixture.seed_key] = quote
    context.session.flush()


def _seed_quote_lines(
    context: _SeedContext,
    quote_seed_key: str,
    quote: SalesQuote,
    lines: tuple[_PricedEntry, ...],
) -> None:
    for position, line in enumerate(lines, start=1):
        seed_key = f"{quote_seed_key}:{position}"
        payload = _line_payload(line, position)
        entity_id = stable_demo_id(context.seed_version, "sales_quote_line", seed_key)
        record = registered_entity(
            context.session,
            context.workspace_id,
            "sales_quote_line",
            seed_key,
            entity_id,
            payload,
            SalesQuoteLine,
        )
        values = {
            "workspace_id": context.workspace_id,
            "quote_id": quote.id,
            "position": position,
            **_commercial_line_values(line),
        }
        if record is None:
            record = SalesQuoteLine(id=entity_id, **values)
            context.session.add(record)
            context.session.flush()
            register_entity(
                context.session,
                context.workspace_id,
                "sales_quote_line",
                seed_key,
                record.id,
                context.seed_version,
                payload,
            )
        else:
            _assign(record, values)


def _seed_sales(context: _SeedContext) -> tuple[int, int]:
    receivable_index = 0
    payment_count = 0
    for fixture in context.bundle.pos.sales:
        branch = _branch(context, fixture.branch_code)
        register = _register(context, fixture.register_seed_key)
        if register.branch_id != branch.id:
            raise RuntimeError(
                f"Demo sale {fixture.seed_key!r} uses a register from another branch."
            )
        actor = _actor(context, fixture.sold_by_user_seed_key)
        customer = _customer(context, fixture.customer_seed_key)
        method = _required_method(context, fixture.payment_method_seed_key)
        if method.settlement_policy != "immediate" and customer is None:
            raise RuntimeError(f"Deferred demo sale {fixture.seed_key!r} requires a customer.")
        priced, lines = _price_lines(
            context, branch, fixture.lines, fixture.discount_type, fixture.discount_value
        )
        inventory_movement_id = _seed_sale_inventory(context, fixture, branch, actor, lines)
        payload = fixture.model_dump(mode="json")
        entity_id = stable_demo_id(context.seed_version, "sale", fixture.seed_key)
        sale = registered_entity(
            context.session,
            context.workspace_id,
            "sale",
            fixture.seed_key,
            entity_id,
            payload,
            Sale,
        )
        void_actor = (
            _actor(context, fixture.voided_by_user_seed_key)
            if fixture.voided_by_user_seed_key
            else None
        )
        quote = context.quotes.get(fixture.quote_seed_key) if fixture.quote_seed_key else None
        if fixture.quote_seed_key and quote is None:
            raise RuntimeError(f"Demo sale {fixture.seed_key!r} references an unknown quote.")
        values = {
            "workspace_id": context.workspace_id,
            "branch_id": branch.id,
            "customer_id": customer.id if customer else None,
            "cash_register_id": register.id,
            "quote_id": quote.id if quote else None,
            "inventory_movement_id": inventory_movement_id,
            "sale_number": fixture.sale_number,
            "status": fixture.status,
            "currency_code": "DOP",
            "customer_name": customer.display_name if customer else None,
            "customer_phone": customer.phone if customer else None,
            **_document_values(priced, fixture.discount_type, fixture.discount_value),
            **_payment_snapshot(method),
            "payment_reference": fixture.payment_reference,
            "notes": fixture.notes,
            "sold_by_membership_id": actor.membership.id,
            "sold_by_platform_user_id": actor.user.id,
            "sold_by_name": actor.user.display_name,
            "completed_at": fixture.completed_at,
            "voided_at": fixture.voided_at,
            "voided_by_platform_user_id": void_actor.user.id if void_actor else None,
            "void_reason": fixture.void_reason,
            "creation_idempotency_key": f"demo:{context.seed_version}:sale:{fixture.seed_key}",
            "request_fingerprint": checksum_payload(payload),
            "void_idempotency_key": (
                f"demo:{context.seed_version}:sale-void:{fixture.seed_key}" if void_actor else None
            ),
            "void_request_fingerprint": checksum_payload({"void": payload}) if void_actor else None,
            "created_at": fixture.completed_at,
            "updated_at": fixture.voided_at or fixture.completed_at,
        }
        if sale is None:
            sale = Sale(id=entity_id, **values)
            context.session.add(sale)
            context.session.flush()
            register_entity(
                context.session,
                context.workspace_id,
                "sale",
                fixture.seed_key,
                sale.id,
                context.seed_version,
                payload,
            )
        else:
            _assign(sale, values)
        sale_lines = _seed_sale_lines(context, fixture.seed_key, sale, lines)
        if method.settlement_policy != "immediate" and priced.total > 0:
            receivable_index += 1
            payment_count += _seed_receivable(
                context,
                fixture,
                sale,
                sale_lines,
                customer,
                method,
                priced.total,
                receivable_index,
            )
        if method.settlement_policy == "immediate" and method.affects_cash_drawer:
            original = _seed_sale_cash_movement(
                context,
                fixture,
                sale,
                register,
                actor,
                method,
                inventory_movement_id,
            )
            if fixture.status == "voided":
                if void_actor is None or fixture.voided_at is None:
                    raise RuntimeError("Demo sale void state validation was bypassed.")
                _seed_reversal_movement(
                    context,
                    seed_key=f"sale:{fixture.seed_key}:reversal",
                    register=register,
                    actor=void_actor,
                    original=original,
                    created_at=fixture.voided_at,
                    concept=f"Anulación {sale.sale_number}",
                    reference=sale.payment_reference,
                    notes=fixture.void_reason,
                )
    context.session.flush()
    return receivable_index, payment_count


def _seed_sale_lines(
    context: _SeedContext,
    sale_seed_key: str,
    sale: Sale,
    lines: tuple[_PricedEntry, ...],
) -> tuple[SaleLine, ...]:
    records: list[SaleLine] = []
    for position, line in enumerate(lines, start=1):
        seed_key = f"{sale_seed_key}:{position}"
        payload = _line_payload(line, position)
        entity_id = stable_demo_id(context.seed_version, "sale_line", seed_key)
        record = registered_entity(
            context.session,
            context.workspace_id,
            "sale_line",
            seed_key,
            entity_id,
            payload,
            SaleLine,
        )
        values = {
            "workspace_id": context.workspace_id,
            "sale_id": sale.id,
            "position": position,
            **_commercial_line_values(line),
            "unit_cost_snapshot": line.catalog.profile.unit_cost,
        }
        if record is None:
            record = SaleLine(id=entity_id, **values)
            context.session.add(record)
            context.session.flush()
            register_entity(
                context.session,
                context.workspace_id,
                "sale_line",
                seed_key,
                record.id,
                context.seed_version,
                payload,
            )
        else:
            _assign(record, values)
        records.append(record)
    return tuple(records)


def _seed_receivable(
    context: _SeedContext,
    fixture: DemoPosSaleFixture,
    sale: Sale,
    sale_lines: tuple[SaleLine, ...],
    customer: Customer | None,
    method: PaymentMethod,
    total: Decimal,
    receivable_index: int,
) -> int:
    if customer is None:
        raise RuntimeError("Deferred demo sale customer validation was bypassed.")
    posted = [payment for payment in fixture.receivable_payments if payment.status == "posted"]
    paid_amount = money(sum((payment.amount for payment in posted), Decimal("0")))
    if paid_amount > total:
        raise RuntimeError(f"Demo receivable for {fixture.seed_key!r} is overpaid.")
    if fixture.status == "voided":
        if paid_amount != 0:
            raise RuntimeError("A voided demo sale cannot retain posted receivable payments.")
        status = "cancelled"
        paid_at = None
        cancelled_at = fixture.voided_at
        cancellation_reason = f"Venta anulada: {fixture.void_reason}"
    elif paid_amount == 0:
        status = "pending"
        paid_at = None
        cancelled_at = None
        cancellation_reason = None
    elif paid_amount < total:
        status = "partial"
        paid_at = None
        cancelled_at = None
        cancellation_reason = None
    else:
        status = "paid"
        paid_at = max(payment.posted_at for payment in posted)
        cancelled_at = None
        cancellation_reason = None
    seed_key = fixture.seed_key
    payload = {
        "saleSeedKey": seed_key,
        "dueDate": fixture.receivable_due_date.isoformat() if fixture.receivable_due_date else None,
        "payments": [payment.model_dump(mode="json") for payment in fixture.receivable_payments],
    }
    entity_id = stable_demo_id(context.seed_version, "customer_receivable", seed_key)
    receivable = registered_entity(
        context.session,
        context.workspace_id,
        "customer_receivable",
        seed_key,
        entity_id,
        payload,
        CustomerReceivable,
    )
    updated_at = max(
        [
            sale.completed_at,
            *(payment.reversed_at or payment.posted_at for payment in fixture.receivable_payments),
        ]
    )
    values = {
        "workspace_id": context.workspace_id,
        "branch_id": sale.branch_id,
        "customer_id": customer.id,
        "receivable_number": f"CXC-{99_000_000 + receivable_index:08d}",
        "source": "sale",
        "sale_id": sale.id,
        "appointment_id": None,
        **_payment_snapshot(method),
        "currency_code": "DOP",
        "customer_name": customer.display_name,
        "customer_phone": customer.phone,
        "amount": total,
        "paid_amount": paid_amount,
        "status": status,
        "reference": fixture.receivable_reference or sale.payment_reference,
        "notes": fixture.receivable_notes or sale.notes,
        "due_date": fixture.receivable_due_date,
        "paid_at": paid_at,
        "cancelled_at": cancelled_at,
        "cancellation_reason": cancellation_reason,
        "creation_idempotency_key": f"demo:{context.seed_version}:receivable:{seed_key}",
        "request_fingerprint": checksum_payload(payload),
        "created_by_platform_user_id": sale.sold_by_platform_user_id,
        "updated_by_platform_user_id": sale.sold_by_platform_user_id,
        "created_at": sale.completed_at,
        "updated_at": updated_at,
    }
    if receivable is None:
        receivable = CustomerReceivable(id=entity_id, **values)
        context.session.add(receivable)
        context.session.flush()
        register_entity(
            context.session,
            context.workspace_id,
            "customer_receivable",
            seed_key,
            receivable.id,
            context.seed_version,
            payload,
        )
    else:
        _assign(receivable, values)
    _seed_receivable_lines(context, seed_key, receivable, sale_lines)
    for payment in fixture.receivable_payments:
        _seed_receivable_payment(context, fixture, receivable, payment)
    return len(fixture.receivable_payments)


def _seed_receivable_lines(
    context: _SeedContext,
    receivable_seed_key: str,
    receivable: CustomerReceivable,
    sale_lines: tuple[SaleLine, ...],
) -> None:
    for line in sale_lines:
        seed_key = f"{receivable_seed_key}:{line.position}"
        payload = {"saleLineId": str(line.id), "position": line.position}
        entity_id = stable_demo_id(context.seed_version, "customer_receivable_line", seed_key)
        record = registered_entity(
            context.session,
            context.workspace_id,
            "customer_receivable_line",
            seed_key,
            entity_id,
            payload,
            CustomerReceivableLine,
        )
        values = {
            "workspace_id": context.workspace_id,
            "receivable_id": receivable.id,
            "position": line.position,
            "sale_line_id": line.id,
            "item_id": line.item_id,
            "item_name": line.item_name,
            "item_sku": line.item_sku,
            "unit_symbol": line.unit_symbol,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "line_total": line.line_total,
        }
        if record is None:
            record = CustomerReceivableLine(id=entity_id, **values)
            context.session.add(record)
            context.session.flush()
            register_entity(
                context.session,
                context.workspace_id,
                "customer_receivable_line",
                seed_key,
                record.id,
                context.seed_version,
                payload,
            )
        else:
            _assign(record, values)


def _seed_receivable_payment(
    context: _SeedContext,
    sale_fixture: DemoPosSaleFixture,
    receivable: CustomerReceivable,
    fixture: DemoPosReceivablePaymentFixture,
) -> None:
    method = _required_method(context, fixture.payment_method_seed_key)
    if method.settlement_policy == "receivable":
        raise RuntimeError(f"Demo payment {fixture.seed_key!r} uses an invalid method.")
    actor = _actor(context, fixture.received_by_user_seed_key)
    reverse_actor = (
        _actor(context, fixture.reversed_by_user_seed_key)
        if fixture.reversed_by_user_seed_key
        else None
    )
    register = (
        _register(context, sale_fixture.register_seed_key) if method.affects_cash_drawer else None
    )
    seed_key = f"{sale_fixture.seed_key}:{fixture.seed_key}"
    payload = fixture.model_dump(mode="json")
    entity_id = stable_demo_id(context.seed_version, "customer_payment", seed_key)
    payment = registered_entity(
        context.session,
        context.workspace_id,
        "customer_payment",
        seed_key,
        entity_id,
        payload,
        CustomerPayment,
    )
    values = {
        "workspace_id": context.workspace_id,
        "branch_id": receivable.branch_id,
        "receivable_id": receivable.id,
        "payment_method_id": method.id,
        "cash_register_id": register.id if register else None,
        "status": fixture.status,
        "currency_code": "DOP",
        "amount": money(fixture.amount),
        **_payment_snapshot(method),
        "reference": fixture.reference,
        "note": fixture.note,
        "received_by_membership_id": actor.membership.id,
        "received_by_platform_user_id": actor.user.id,
        "received_by_name": actor.user.display_name,
        "posted_at": fixture.posted_at,
        "idempotency_key": f"demo:{context.seed_version}:payment:{seed_key}",
        "request_fingerprint": checksum_payload(payload),
        "reversed_at": fixture.reversed_at,
        "reversed_by_platform_user_id": reverse_actor.user.id if reverse_actor else None,
        "reversal_reason": fixture.reversal_reason,
        "reversal_idempotency_key": (
            f"demo:{context.seed_version}:payment-reversal:{seed_key}" if reverse_actor else None
        ),
        "reversal_request_fingerprint": checksum_payload({"reversal": payload})
        if reverse_actor
        else None,
        "created_at": fixture.posted_at,
        "updated_at": fixture.reversed_at or fixture.posted_at,
    }
    if payment is None:
        payment = CustomerPayment(id=entity_id, **values)
        context.session.add(payment)
        context.session.flush()
        register_entity(
            context.session,
            context.workspace_id,
            "customer_payment",
            seed_key,
            payment.id,
            context.seed_version,
            payload,
        )
    else:
        _assign(payment, values)
    if register is not None:
        original = _seed_payment_cash_movement(
            context, seed_key, receivable, payment, register, actor, method, fixture.posted_at
        )
        if fixture.status == "reversed":
            if reverse_actor is None or fixture.reversed_at is None:
                raise RuntimeError("Demo payment reversal validation was bypassed.")
            _seed_reversal_movement(
                context,
                seed_key=f"payment:{seed_key}:reversal",
                register=register,
                actor=reverse_actor,
                original=original,
                created_at=fixture.reversed_at,
                concept=f"Reverso de cobro {receivable.receivable_number}",
                reference=fixture.reference,
                notes=fixture.reversal_reason,
            )


def _seed_sale_inventory(
    context: _SeedContext,
    fixture: DemoPosSaleFixture,
    branch: Branch,
    actor: _Actor,
    lines: tuple[_PricedEntry, ...],
) -> UUID | None:
    tracked = [
        (position, line)
        for position, line in enumerate(lines, start=1)
        if line.catalog.item.item_type == "product"
    ]
    if not tracked:
        return None
    warehouse = context.session.scalar(
        select(InventoryWarehouse).where(
            InventoryWarehouse.workspace_id == context.workspace_id,
            InventoryWarehouse.branch_id == branch.id,
            InventoryWarehouse.is_default.is_(True),
            InventoryWarehouse.status == "active",
        )
    )
    if warehouse is None:
        raise RuntimeError(f"Demo POS branch {branch.code!r} has no default warehouse.")
    outbound_id = _seed_inventory_movement(
        context,
        seed_key=f"{fixture.seed_key}:outbound",
        branch=branch,
        warehouse=warehouse,
        actor=actor,
        movement_type="outbound",
        created_at=fixture.completed_at,
        comment=f"Venta POS {fixture.sale_number}",
        tracked=tracked,
    )
    if fixture.status == "voided":
        if fixture.voided_at is None or fixture.voided_by_user_seed_key is None:
            raise RuntimeError("Demo inventory reversal validation was bypassed.")
        _seed_inventory_movement(
            context,
            seed_key=f"{fixture.seed_key}:inbound",
            branch=branch,
            warehouse=warehouse,
            actor=_actor(context, fixture.voided_by_user_seed_key),
            movement_type="inbound",
            created_at=fixture.voided_at,
            comment=f"Anulación POS {fixture.sale_number}: {fixture.void_reason}",
            tracked=tracked,
        )
    return outbound_id


def _seed_inventory_movement(
    context: _SeedContext,
    *,
    seed_key: str,
    branch: Branch,
    warehouse: InventoryWarehouse,
    actor: _Actor,
    movement_type: str,
    created_at: datetime,
    comment: str,
    tracked: list[tuple[int, _PricedEntry]],
) -> UUID:
    payload = {
        "branchCode": branch.code,
        "movementType": movement_type,
        "createdAt": created_at.isoformat(),
        "lines": [
            {
                "position": position,
                "itemId": str(line.catalog.item.id),
                "quantity": str(line.quantity),
            }
            for position, line in tracked
        ],
    }
    entity_id = stable_demo_id(context.seed_version, "pos_inventory_movement", seed_key)
    movement = registered_entity(
        context.session,
        context.workspace_id,
        "pos_inventory_movement",
        seed_key,
        entity_id,
        payload,
        InventoryMovement,
    )
    values = {
        "workspace_id": context.workspace_id,
        "branch_id": branch.id,
        "warehouse_id": warehouse.id,
        "movement_type": movement_type,
        "employee_id": None,
        "appointment_id": None,
        "comment": comment,
        "idempotency_key": f"demo:{context.seed_version}:pos-stock:{seed_key}",
        "request_fingerprint": checksum_payload(payload),
        "created_by_platform_user_id": actor.user.id,
        "created_at": created_at,
    }
    if movement is None:
        movement = InventoryMovement(id=entity_id, **values)
        context.session.add(movement)
        context.session.flush()
        register_entity(
            context.session,
            context.workspace_id,
            "pos_inventory_movement",
            seed_key,
            movement.id,
            context.seed_version,
            payload,
        )
    else:
        _assign(movement, values)
    direction = Decimal("-1") if movement_type == "outbound" else Decimal("1")
    for position, line in tracked:
        balance = context.session.scalar(
            select(InventoryStockBalance).where(
                InventoryStockBalance.workspace_id == context.workspace_id,
                InventoryStockBalance.warehouse_id == warehouse.id,
                InventoryStockBalance.item_id == line.catalog.item.id,
            )
        )
        if balance is None:
            raise RuntimeError(f"Demo POS item {line.catalog.item.name!r} has no stock balance.")
        before = quantity(balance.quantity)
        after = quantity(before + direction * line.quantity)
        if after < 0:
            raise RuntimeError(f"Demo POS sale {seed_key!r} exceeds seeded inventory stock.")
        line_key = f"{seed_key}:{position}"
        line_payload = {**payload, "position": position, "before": str(before), "after": str(after)}
        line_id = stable_demo_id(context.seed_version, "pos_inventory_line", line_key)
        movement_line = registered_entity(
            context.session,
            context.workspace_id,
            "pos_inventory_line",
            line_key,
            line_id,
            line_payload,
            InventoryMovementLine,
        )
        line_values = {
            "workspace_id": context.workspace_id,
            "movement_id": movement.id,
            "item_id": line.catalog.item.id,
            "quantity_delta": quantity(direction * line.quantity),
            "quantity_before": before,
            "quantity_after": after,
            "unit_cost_snapshot": line.catalog.profile.unit_cost,
            "item_name": line.catalog.item.name,
            "item_sku": line.catalog.item.sku,
            "unit_symbol": line.catalog.unit.symbol,
        }
        if movement_line is None:
            movement_line = InventoryMovementLine(id=line_id, **line_values)
            context.session.add(movement_line)
            context.session.flush()
            register_entity(
                context.session,
                context.workspace_id,
                "pos_inventory_line",
                line_key,
                movement_line.id,
                context.seed_version,
                line_payload,
            )
        else:
            _assign(movement_line, line_values)
        balance.quantity = after
    context.inventory_movement_count += 1
    return movement.id


def _seed_sale_cash_movement(
    context: _SeedContext,
    fixture: DemoPosSaleFixture,
    sale: Sale,
    register: CashRegister,
    actor: _Actor,
    method: PaymentMethod,
    inventory_movement_id: UUID | None,
) -> CashMovement:
    return _upsert_cash_movement(
        context,
        seed_key=f"sale:{fixture.seed_key}",
        register=register,
        actor=actor,
        movement_type="sale",
        amount=sale.total,
        cash_delta=sale.total,
        created_at=fixture.completed_at,
        concept=f"Venta {sale.sale_number}",
        reference=sale.payment_reference,
        payment_method=method,
        sale_id=sale.id,
        inventory_movement_id=inventory_movement_id,
    )


def _seed_payment_cash_movement(
    context: _SeedContext,
    seed_key: str,
    receivable: CustomerReceivable,
    payment: CustomerPayment,
    register: CashRegister,
    actor: _Actor,
    method: PaymentMethod,
    created_at: datetime,
) -> CashMovement:
    return _upsert_cash_movement(
        context,
        seed_key=f"payment:{seed_key}",
        register=register,
        actor=actor,
        movement_type="receivable_payment",
        amount=payment.amount,
        cash_delta=payment.amount,
        created_at=created_at,
        concept=f"Cobro {receivable.receivable_number}",
        reference=payment.reference,
        payment_method=method,
        customer_payment_id=payment.id,
    )


def _seed_reversal_movement(
    context: _SeedContext,
    *,
    seed_key: str,
    register: CashRegister,
    actor: _Actor,
    original: CashMovement,
    created_at: datetime,
    concept: str,
    reference: str | None,
    notes: str | None,
) -> CashMovement:
    method = (
        context.session.get(PaymentMethod, original.payment_method_id)
        if original.payment_method_id
        else None
    )
    return _upsert_cash_movement(
        context,
        seed_key=seed_key,
        register=register,
        actor=actor,
        movement_type="reversal",
        amount=original.amount,
        cash_delta=-original.cash_delta,
        created_at=created_at,
        concept=concept,
        reference=reference,
        notes=notes,
        payment_method=method,
        reversal_of_movement_id=original.id,
    )


def _seed_cash_adjustments(context: _SeedContext) -> None:
    for fixture in context.bundle.pos.cash_adjustments:
        register = _register(context, fixture.register_seed_key)
        actor = _actor(context, fixture.created_by_user_seed_key)
        delta = (
            money(fixture.amount) if fixture.movement_type == "income" else -money(fixture.amount)
        )
        _upsert_cash_movement(
            context,
            seed_key=f"adjustment:{fixture.seed_key}",
            register=register,
            actor=actor,
            movement_type=fixture.movement_type,
            amount=money(fixture.amount),
            cash_delta=delta,
            created_at=fixture.created_at,
            concept=fixture.concept,
            reference=fixture.reference,
            notes=fixture.notes,
        )


def _upsert_cash_movement(
    context: _SeedContext,
    *,
    seed_key: str,
    register: CashRegister,
    actor: _Actor,
    movement_type: str,
    amount: Decimal,
    cash_delta: Decimal,
    created_at: datetime,
    concept: str,
    reference: str | None = None,
    notes: str | None = None,
    payment_method: PaymentMethod | None = None,
    sale_id: UUID | None = None,
    customer_payment_id: UUID | None = None,
    reversal_of_movement_id: UUID | None = None,
    inventory_movement_id: UUID | None = None,
) -> CashMovement:
    payload = {
        "registerId": str(register.id),
        "movementType": movement_type,
        "amount": str(money(amount)),
        "cashDelta": str(money(cash_delta)),
        "createdAt": created_at.isoformat(),
        "sourceId": str(sale_id or customer_payment_id or reversal_of_movement_id or ""),
    }
    entity_id = stable_demo_id(context.seed_version, "cash_movement", seed_key)
    movement = registered_entity(
        context.session,
        context.workspace_id,
        "cash_movement",
        seed_key,
        entity_id,
        payload,
        CashMovement,
    )
    values = {
        "workspace_id": context.workspace_id,
        "branch_id": register.branch_id,
        "cash_register_id": register.id,
        "movement_type": movement_type,
        "currency_code": "DOP",
        "amount": money(amount),
        "cash_delta": money(cash_delta),
        **_payment_snapshot(payment_method),
        "sale_id": sale_id,
        "customer_payment_id": customer_payment_id,
        "reversal_of_movement_id": reversal_of_movement_id,
        "inventory_movement_id": inventory_movement_id,
        "concept": concept,
        "reference": reference,
        "notes": notes,
        "created_by_membership_id": actor.membership.id,
        "created_by_platform_user_id": actor.user.id,
        "created_by_name": actor.user.display_name,
        "idempotency_key": f"demo:{context.seed_version}:cash:{seed_key}",
        "request_fingerprint": checksum_payload(payload),
        "created_at": created_at,
    }
    if movement is None:
        movement = CashMovement(id=entity_id, **values)
        context.session.add(movement)
        context.session.flush()
        register_entity(
            context.session,
            context.workspace_id,
            "cash_movement",
            seed_key,
            movement.id,
            context.seed_version,
            payload,
        )
    else:
        _assign(movement, values)
    context.cash_movement_count += 1
    return movement


def _finalize_registers(context: _SeedContext) -> None:
    fixture_by_key = {fixture.seed_key: fixture for fixture in context.bundle.pos.registers}
    for seed_key, register in context.registers.items():
        fixture = fixture_by_key[seed_key]
        movements = context.session.scalars(
            select(CashMovement).where(
                CashMovement.workspace_id == context.workspace_id,
                CashMovement.cash_register_id == register.id,
            )
        ).all()
        by_id = {movement.id: movement for movement in movements}
        cash_sales = Decimal("0")
        receivable_payments = Decimal("0")
        cash_income = Decimal("0")
        cash_expense = Decimal("0")
        for movement in movements:
            source_type = movement.movement_type
            if source_type == "reversal" and movement.reversal_of_movement_id is not None:
                original = by_id.get(movement.reversal_of_movement_id)
                source_type = original.movement_type if original is not None else source_type
            if source_type == "sale":
                cash_sales += movement.cash_delta
            elif source_type == "receivable_payment":
                receivable_payments += movement.cash_delta
            elif source_type == "income":
                cash_income += movement.cash_delta
            elif source_type == "expense":
                cash_expense -= movement.cash_delta
        register.cash_sales_amount = money(cash_sales)
        register.receivable_payments_amount = money(receivable_payments)
        register.cash_income_amount = money(cash_income)
        register.cash_expense_amount = money(cash_expense)
        if fixture.status == "open":
            register.expected_cash = None
            register.actual_cash = None
            register.difference = None
            continue
        expected = money(
            register.opening_cash
            + register.cash_sales_amount
            + register.receivable_payments_amount
            + register.cash_income_amount
            - register.cash_expense_amount
        )
        difference = money(fixture.closing_difference or Decimal("0"))
        register.expected_cash = expected
        register.actual_cash = money(expected + difference)
        register.difference = difference
    context.session.flush()


def _update_document_counter(context: _SeedContext) -> None:
    counter = context.session.get(SalesDocumentCounter, context.workspace_id)
    if counter is None:
        counter = SalesDocumentCounter(workspace_id=context.workspace_id)
        context.session.add(counter)
        context.session.flush()
    counter.last_quote_value = max(counter.last_quote_value, len(context.bundle.pos.quotes))
    counter.last_sale_value = max(counter.last_sale_value, len(context.bundle.pos.sales))
    receivable_count = len(
        [
            sale
            for sale in context.bundle.pos.sales
            if _required_method(context, sale.payment_method_seed_key).settlement_policy
            != "immediate"
        ]
    )
    counter.last_receivable_value = max(counter.last_receivable_value, receivable_count)


def _price_lines(
    context: _SeedContext,
    branch: Branch,
    fixtures: list[DemoPosLineFixture],
    discount_type: str | None,
    discount_value: Decimal,
) -> tuple[PricedDocument, tuple[_PricedEntry, ...]]:
    selected: list[tuple[DemoPosLineFixture, _CatalogEntry, Decimal, Decimal, Decimal]] = []
    pricing_inputs: list[PricingInput] = []
    for fixture in fixtures:
        catalog = context.catalog.get(fixture.item_seed_key)
        if catalog is None:
            raise RuntimeError(f"Demo POS item {fixture.item_seed_key!r} has no sale profile.")
        assignment = context.session.scalar(
            select(ItemBranchAssignment.id).where(
                ItemBranchAssignment.workspace_id == context.workspace_id,
                ItemBranchAssignment.item_id == catalog.item.id,
                ItemBranchAssignment.branch_id == branch.id,
                ItemBranchAssignment.status == "active",
            )
        )
        if assignment is None:
            raise RuntimeError(
                f"Demo POS item {fixture.item_seed_key!r} is unavailable in {branch.code!r}."
            )
        line_quantity = quantity(fixture.quantity)
        list_price = money(catalog.profile.sale_price or Decimal("0"))
        unit_price = money(fixture.unit_price) if fixture.unit_price is not None else list_price
        tax_rate = catalog.profile.tax_rate
        selected.append((fixture, catalog, line_quantity, list_price, unit_price))
        pricing_inputs.append(PricingInput(catalog.item.id, line_quantity, unit_price, tax_rate))
    priced = price_document(
        pricing_inputs,
        discount_type=discount_type,  # type: ignore[arg-type]
        discount_value=discount_value,
    )
    lines = tuple(
        _PricedEntry(
            fixture=fixture,
            catalog=catalog,
            quantity=priced_line.quantity,
            list_price=list_price,
            unit_price=priced_line.unit_price,
            discount_amount=priced_line.discount_amount,
            tax_rate=priced_line.tax_rate,
            tax_amount=priced_line.tax_amount,
            line_total=priced_line.line_total,
        )
        for (fixture, catalog, _line_quantity, list_price, _unit_price), priced_line in zip(
            selected, priced.lines, strict=True
        )
    )
    return priced, lines


def _document_values(
    priced: PricedDocument,
    discount_type: str | None,
    discount_value: Decimal,
) -> dict[str, Any]:
    return {
        "subtotal": priced.subtotal,
        "discount_mode": "amount" if discount_type == "fixed" else "pct",
        "discount_value": money(discount_value),
        "discount_amount": priced.discount_amount,
        "tax_amount": priced.tax_amount,
        "total": priced.total,
    }


def _payment_snapshot(method: PaymentMethod | None) -> dict[str, Any]:
    if method is None:
        return {
            "payment_method_id": None,
            "payment_method_code": None,
            "payment_method_name": None,
            "payment_channel": None,
            "settlement_policy": None,
            "affects_cash_drawer": None,
            "requires_evidence": None,
        }
    return {
        "payment_method_id": method.id,
        "payment_method_code": method.code,
        "payment_method_name": method.name,
        "payment_channel": method.channel,
        "settlement_policy": method.settlement_policy,
        "affects_cash_drawer": method.affects_cash_drawer,
        "requires_evidence": method.requires_evidence,
    }


def _commercial_line_values(line: _PricedEntry) -> dict[str, Any]:
    return {
        "item_id": line.catalog.item.id,
        "item_name": line.catalog.item.name,
        "item_sku": line.catalog.item.sku,
        "item_type": line.catalog.item.item_type,
        "unit_symbol": line.catalog.unit.symbol,
        "quantity": line.quantity,
        "list_price": line.list_price,
        "unit_price": line.unit_price,
        "discount_amount": line.discount_amount,
        "tax_rate": line.tax_rate,
        "tax_amount": line.tax_amount,
        "line_total": line.line_total,
    }


def _line_payload(line: _PricedEntry, position: int) -> dict[str, object]:
    return {
        "position": position,
        "itemSeedKey": line.fixture.item_seed_key,
        "quantity": str(line.quantity),
        "listPrice": str(line.list_price),
        "unitPrice": str(line.unit_price),
        "discountAmount": str(line.discount_amount),
        "taxRate": str(line.tax_rate),
        "taxAmount": str(line.tax_amount),
        "lineTotal": str(line.line_total),
    }


def _branch(context: _SeedContext, code: str) -> Branch:
    branch = context.branches.get(code)
    if branch is None:
        raise RuntimeError(f"Demo POS branch {code!r} is missing.")
    return branch


def _actor(context: _SeedContext, seed_key: str | None) -> _Actor:
    actor = context.actors.get(seed_key or "")
    if actor is None:
        raise RuntimeError(f"Demo POS actor {seed_key!r} is missing.")
    return actor


def _customer(context: _SeedContext, seed_key: str | None) -> Customer | None:
    if seed_key is None:
        return None
    customer = context.customers.get(seed_key)
    if customer is None:
        raise RuntimeError(f"Demo POS customer {seed_key!r} is missing.")
    return customer


def _method(context: _SeedContext, seed_key: str | None) -> PaymentMethod | None:
    if seed_key is None:
        return None
    method = context.methods.get(seed_key)
    if method is None:
        raise RuntimeError(f"Demo POS payment method {seed_key!r} is missing.")
    return method


def _required_method(context: _SeedContext, seed_key: str) -> PaymentMethod:
    method = _method(context, seed_key)
    if method is None:
        raise RuntimeError(f"Demo POS payment method {seed_key!r} is missing.")
    return method


def _register(context: _SeedContext, seed_key: str) -> CashRegister:
    register = context.registers.get(seed_key)
    if register is None:
        raise RuntimeError(f"Demo POS register {seed_key!r} is missing.")
    return register


def _assign(entity: object, values: dict[str, Any]) -> None:
    for field, value in values.items():
        setattr(entity, field, value)
