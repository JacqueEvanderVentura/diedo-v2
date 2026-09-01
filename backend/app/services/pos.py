from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any, BinaryIO, cast
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models.administration import PaymentMethod
from app.db.models.agenda import Appointment
from app.db.models.pos import CashMovement, CashMovementLine, CashRegister
from app.db.models.sales import (
    CustomerPayment,
    CustomerReceivable,
    CustomerReceivableLine,
    PaymentProof,
    Sale,
    SaleLine,
    SalesQuote,
    SalesQuoteLine,
)
from app.repositories.authorization import AuthorizationRepository
from app.repositories.inventory import InventoryRepository, LockedStockRecord
from app.repositories.pos import (
    CashMovementRecord,
    CashRegisterRecord,
    Page,
    PosCatalogRecord,
    PosRepository,
    QuoteRecord,
    ReceivableRecord,
    SaleRecord,
)
from app.services.attachment_storage import (
    AttachmentContentMismatchError,
    AttachmentStorage,
    AttachmentTooLargeError,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import (
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
)
from app.services.pos_money import PricedDocument, PricingInput, money, price_document, quantity

_ALLOWED_PROOF_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@dataclass(frozen=True)
class SalesSummary:
    gross_sales: Decimal
    discounts: Decimal
    taxes: Decimal
    net_sales: Decimal
    average_ticket: Decimal
    sales_count: int
    voided_count: int


@dataclass(frozen=True)
class QuotesSummary:
    open_count: int
    held_count: int
    converted_count: int
    open_total: Decimal
    held_total: Decimal


@dataclass(frozen=True)
class ReceivablesSummary:
    original_total: Decimal
    paid_total: Decimal
    pending_total: Decimal
    overdue_total: Decimal
    pending_count: int
    partial_count: int
    overdue_count: int


@dataclass(frozen=True)
class PosState:
    branch_id: UUID
    register: CashRegisterRecord | None
    catalog: tuple[PosCatalogRecord, ...]
    quotes: tuple[QuoteRecord, ...]
    sales: tuple[SaleRecord, ...]
    receivables: tuple[ReceivableRecord, ...]
    receivable_summary: ReceivablesSummary
    payment_methods: tuple[PaymentMethod, ...]


@dataclass(frozen=True)
class CheckoutResult:
    sale: SaleRecord
    receivable_id: UUID | None


@dataclass(frozen=True)
class ProofDigest:
    size_bytes: int
    checksum_sha256: str


@dataclass(frozen=True)
class _PricedCatalogLine:
    catalog: PosCatalogRecord
    quantity: Decimal
    list_price: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    line_total: Decimal


class PosService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = PosRepository(session)
        self._inventory = InventoryRepository(session)
        self._authorization = AuthorizationRepository(session)

    def state(
        self,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        branch_id: UUID,
    ) -> PosState:
        self._require_branch(grant, branch_id)
        self._require_active_branch(grant.workspace_id, branch_id)
        permissions = AuthorizationService(self._session).permission_codes_for_branches(
            principal,
            {branch_id},
        )[branch_id]
        register = (
            self._repository.current_register(grant.workspace_id, branch_id)
            if "pos.cash.read" in permissions
            else None
        )
        expired_quote_ids: tuple[UUID, ...] = ()
        if "sales.read" in permissions:
            expired_quote_ids = self._repository.expire_due_quotes(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=frozenset({branch_id}),
                branch_id=branch_id,
            )
        quotes = (
            self._repository.list_quotes(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=frozenset({branch_id}),
                branch_id=branch_id,
                customer_id=None,
                status="open",
                kind=None,
                page=1,
                page_size=200,
                include_details=True,
            )
            if "sales.read" in permissions
            else Page((), 0)
        )
        sales = (
            self._repository.list_sales(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=frozenset({branch_id}),
                branch_id=branch_id,
                register_id=None,
                customer_id=None,
                status=None,
                date_from=None,
                date_to=None,
                page=1,
                page_size=100,
                include_details=True,
            )
            if "sales.read" in permissions
            else Page((), 0)
        )
        receivables = (
            self._repository.list_receivables(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=frozenset({branch_id}),
                branch_id=branch_id,
                customer_id=None,
                status=None,
                overdue=None,
                page=1,
                page_size=200,
                include_details=True,
            )
            if "pos.receivables.read" in permissions
            else Page((), 0)
        )
        result = PosState(
            branch_id=branch_id,
            register=(self._repository.register_record(register) if register else None),
            catalog=self._repository.catalog(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
            ),
            quotes=cast(tuple[QuoteRecord, ...], quotes.items),
            sales=cast(tuple[SaleRecord, ...], sales.items),
            receivables=cast(tuple[ReceivableRecord, ...], receivables.items),
            receivable_summary=(
                self.receivables_summary(grant, branch_id)
                if "pos.receivables.read" in permissions
                else ReceivablesSummary(
                    original_total=Decimal("0"),
                    paid_total=Decimal("0"),
                    pending_total=Decimal("0"),
                    overdue_total=Decimal("0"),
                    pending_count=0,
                    partial_count=0,
                    overdue_count=0,
                )
            ),
            payment_methods=self._repository.payment_methods(grant.workspace_id),
        )
        if expired_quote_ids:
            self._session.commit()
        return result

    def list_registers(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        page: int,
        page_size: int,
    ) -> Page:
        self._require_optional_branch(grant, branch_id)
        return self._repository.list_registers(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            page=page,
            page_size=page_size,
        )

    def current_register(
        self, grant: PermissionGrant, branch_id: UUID
    ) -> CashRegisterRecord | None:
        self._require_branch(grant, branch_id)
        register = self._repository.current_register(grant.workspace_id, branch_id)
        return self._repository.register_record(register) if register is not None else None

    def get_register(self, grant: PermissionGrant, register_id: UUID) -> CashRegisterRecord:
        register = self._repository.get_register(
            grant.workspace_id,
            register_id,
            grant.allowed_branch_ids,
        )
        if register is None:
            raise ResourceNotFoundError("La caja no existe.", "registerId")
        return self._repository.register_record(register)

    def list_register_movements(
        self,
        grant: PermissionGrant,
        *,
        register_id: UUID,
        movement_type: str | None,
        page: int,
        page_size: int,
    ) -> Page:
        register = self._repository.get_register(
            grant.workspace_id,
            register_id,
            grant.allowed_branch_ids,
        )
        if register is None:
            raise ResourceNotFoundError("La caja no existe.", "registerId")
        return self._repository.list_cash_movements(
            workspace_id=grant.workspace_id,
            register_id=register.id,
            movement_type=movement_type,
            page=page,
            page_size=page_size,
        )

    def open_register(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> CashRegisterRecord:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        branch = self._require_active_branch(grant.workspace_id, branch_id)
        workspace = self._repository.workspace(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.")
        currency = cast(str | None, values.get("currency")) or workspace.default_currency
        if currency.upper() != workspace.default_currency:
            raise InvalidOperationError(
                "La caja debe usar la moneda configurada para el workspace.",
                "currency",
            )
        persistent = {
            "branch_id": branch_id,
            "opening_cash": money(cast(Decimal, values["opening_cash"])),
            "currency_code": currency.upper(),
            "notes": self._optional_text(cast(str | None, values.get("notes"))),
        }
        fingerprint = self._fingerprint(persistent)
        existing = self._repository.register_by_open_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            self._require_same_fingerprint(
                existing.open_request_fingerprint, fingerprint, "Idempotency-Key"
            )
            return self._repository.register_record(existing)
        if self._repository.current_register(grant.workspace_id, branch_id, lock=True):
            raise ConflictError("Ya existe una caja abierta en esta sucursal.", "branchId")
        register = CashRegister(
            workspace_id=grant.workspace_id,
            branch_id=branch.id,
            status="open",
            currency_code=currency.upper(),
            opening_cash=persistent["opening_cash"],
            notes=persistent["notes"],
            opened_by_membership_id=principal.membership_id,
            opened_by_platform_user_id=principal.platform_user_id,
            opened_by_name=principal.display_name,
            open_idempotency_key=idempotency_key,
            open_request_fingerprint=fingerprint,
        )
        try:
            self._repository.add_register(register)
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="pos.register.open",
                target_type="cash_register",
                target_id=register.id,
                request_id=get_request_id(),
                details={
                    "branchId": str(branch_id),
                    "openingCash": str(register.opening_cash),
                    "currency": register.currency_code,
                },
            )
            self._session.commit()
            return self._repository.register_record(register)
        except IntegrityError as exc:
            self._session.rollback()
            replay = self._repository.register_by_open_key(grant.workspace_id, idempotency_key)
            if replay is not None:
                self._require_same_fingerprint(
                    replay.open_request_fingerprint, fingerprint, "Idempotency-Key"
                )
                return self._repository.register_record(replay)
            raise ConflictError("No se pudo abrir la caja por un conflicto concurrente.") from exc

    def close_register(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        register_id: UUID,
        expected_version: int,
        counted_cash: Decimal,
        notes: str | None,
        idempotency_key: str,
    ) -> CashRegisterRecord:
        fingerprint = self._fingerprint(
            {
                "register_id": register_id,
                "version": expected_version,
                "counted_cash": money(counted_cash),
                "notes": self._optional_text(notes),
            }
        )
        replay = self._repository.register_by_close_key(grant.workspace_id, idempotency_key)
        if replay is not None:
            self._require_branch(grant, replay.branch_id)
            self._require_same_fingerprint(
                replay.close_request_fingerprint, fingerprint, "Idempotency-Key"
            )
            return self._repository.register_record(replay)
        register = self._repository.get_register(
            grant.workspace_id,
            register_id,
            grant.allowed_branch_ids,
            lock=True,
        )
        if register is None:
            raise ResourceNotFoundError("La caja no existe.", "registerId")
        concurrent = self._repository.register_by_close_key(
            grant.workspace_id,
            idempotency_key,
        )
        if concurrent is not None:
            self._require_branch(grant, concurrent.branch_id)
            self._require_same_fingerprint(
                concurrent.close_request_fingerprint,
                fingerprint,
                "Idempotency-Key",
            )
            return self._repository.register_record(concurrent)
        if register.status != "open":
            raise ConflictError("La caja ya está cerrada.", "registerId")
        self._require_version(register.version, expected_version)
        expected = self._expected_cash(register)
        actual = money(counted_cash)
        register.status = "closed"
        register.expected_cash = expected
        register.actual_cash = actual
        register.difference = money(actual - expected)
        register.closed_by_membership_id = principal.membership_id
        register.closed_by_platform_user_id = principal.platform_user_id
        register.closed_by_name = principal.display_name
        register.closed_at = datetime.now(UTC)
        register.close_idempotency_key = idempotency_key
        register.close_request_fingerprint = fingerprint
        if notes is not None:
            register.notes = self._optional_text(notes)
        register.version += 1
        try:
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="pos.register.close",
                target_type="cash_register",
                target_id=register.id,
                request_id=get_request_id(),
                details={
                    "expectedCash": str(expected),
                    "countedCash": str(actual),
                    "difference": str(register.difference),
                },
            )
            self._session.commit()
            return self._repository.register_record(register)
        except IntegrityError as exc:
            self._session.rollback()
            concurrent = self._repository.register_by_close_key(grant.workspace_id, idempotency_key)
            if concurrent is not None:
                self._require_same_fingerprint(
                    concurrent.close_request_fingerprint,
                    fingerprint,
                    "Idempotency-Key",
                )
                return self._repository.register_record(concurrent)
            raise ConflictError("No se pudo cerrar la caja.") from exc

    def create_manual_movement(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        register_id: UUID,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> CashMovementRecord:
        fingerprint = self._fingerprint({"register_id": register_id, **values})
        existing = self._repository.movement_by_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            self._require_same_fingerprint(
                existing.request_fingerprint, fingerprint, "Idempotency-Key"
            )
            return self._movement_from_register(grant, existing)
        register = self._locked_open_register(grant, register_id)
        method = self._require_payment_method(
            grant.workspace_id, cast(UUID, values["payment_method_id"])
        )
        if not method.affects_cash_drawer:
            raise InvalidOperationError(
                "Este movimiento pertenece a la caja de efectivo; "
                "selecciona un método que afecte el cajón.",
                "paymentMethodId",
            )
        amount = money(cast(Decimal, values["amount"]))
        movement_type = cast(str, values["type"])
        raw_lines = cast(list[dict[str, Any]], values.get("lines") or [])
        prepared_lines = tuple(
            (
                raw,
                quantity(cast(Decimal, raw["quantity"])),
                money(cast(Decimal, raw["unit_cost"])),
            )
            for raw in raw_lines
        )
        if prepared_lines:
            detail_total = money(
                sum(
                    (
                        money(line_quantity * unit_amount)
                        for _, line_quantity, unit_amount in prepared_lines
                    ),
                    Decimal("0"),
                )
            )
            if detail_total != amount:
                raise InvalidOperationError(
                    "El total del detalle debe coincidir con el monto del movimiento.",
                    "lines",
                )
        delta = amount if movement_type == "income" else -amount
        movement = CashMovement(
            workspace_id=grant.workspace_id,
            branch_id=register.branch_id,
            cash_register_id=register.id,
            movement_type=movement_type,
            currency_code=register.currency_code,
            amount=amount,
            cash_delta=delta,
            **self._payment_snapshot(method),
            concept=cast(str, values["concept"]),
            reference=self._optional_text(cast(str | None, values.get("reference"))),
            notes=self._optional_text(cast(str | None, values.get("notes"))),
            created_by_membership_id=principal.membership_id,
            created_by_platform_user_id=principal.platform_user_id,
            created_by_name=principal.display_name,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        lines_buffer: list[CashMovementLine] = []
        for position, (raw, line_quantity, unit_amount) in enumerate(
            prepared_lines,
            start=1,
        ):
            item_id = cast(UUID | None, raw.get("item_id"))
            item_snapshot = (
                self._repository.active_item_snapshot(
                    grant.workspace_id,
                    register.branch_id,
                    item_id,
                )
                if item_id is not None
                else None
            )
            if item_id is not None and item_snapshot is None:
                raise ResourceNotFoundError(
                    "El artículo del detalle no está activo en la sucursal.",
                    "lines",
                )
            item, unit = item_snapshot if item_snapshot is not None else (None, None)
            lines_buffer.append(
                CashMovementLine(
                    workspace_id=grant.workspace_id,
                    position=position,
                    item_id=item_id,
                    item_name=cast(str, raw["description"]),
                    item_sku=item.sku if item is not None else None,
                    unit_symbol=unit.symbol if unit is not None else "ud",
                    quantity=line_quantity,
                    unit_amount=unit_amount,
                    line_total=money(line_quantity * unit_amount),
                )
            )
        lines = tuple(lines_buffer)
        try:
            self._repository.add_movement(movement, lines)
            self._apply_cash_effect(register, movement_type, amount)
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action=f"pos.cash.{movement_type}",
                target_type="cash_movement",
                target_id=movement.id,
                request_id=get_request_id(),
                details={"registerId": str(register.id), "amount": str(amount)},
            )
            self._session.commit()
            return self._movement_from_register(grant, movement)
        except IntegrityError as exc:
            self._session.rollback()
            replay = self._repository.movement_by_key(grant.workspace_id, idempotency_key)
            if replay is not None:
                self._require_same_fingerprint(
                    replay.request_fingerprint, fingerprint, "Idempotency-Key"
                )
                return self._movement_from_register(grant, replay)
            raise ConflictError("No se pudo registrar el movimiento de caja.") from exc

    def list_quotes(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        customer_id: UUID | None,
        status: str | None,
        kind: str | None,
        origin: str | None = None,
        crm_status: str | None = None,
        page: int,
        page_size: int,
    ) -> Page:
        self._require_optional_branch(grant, branch_id)
        expired_quote_ids = self._repository.expire_due_quotes(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )
        result = self._repository.list_quotes(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            customer_id=customer_id,
            status=status,
            kind=kind,
            origin=origin,
            crm_status=crm_status,
            page=page,
            page_size=page_size,
        )
        if expired_quote_ids:
            self._session.commit()
        return result

    def quotes_summary(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
    ) -> QuotesSummary:
        self._require_optional_branch(grant, branch_id)
        expired_quote_ids = self._repository.expire_due_quotes(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )
        values = self._repository.quote_totals(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )
        if expired_quote_ids:
            self._session.commit()
        return QuotesSummary(*values)

    def get_quote(self, grant: PermissionGrant, quote_id: UUID) -> QuoteRecord:
        expired_quote_ids = self._repository.expire_due_quotes(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            quote_id=quote_id,
        )
        quote = self._repository.get_quote(grant.workspace_id, quote_id, grant.allowed_branch_ids)
        if quote is None:
            raise ResourceNotFoundError("La cotización no existe.", "quoteId")
        result = self._repository.quote_record(quote)
        if expired_quote_ids:
            self._session.commit()
        return result

    def create_quote(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> QuoteRecord:
        branch_id = cast(UUID, values["branch_id"])
        self._require_branch(grant, branch_id)
        workspace = self._repository.workspace(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.")
        fingerprint = self._fingerprint(values)
        existing = self._repository.quote_by_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            self._require_branch(grant, existing.branch_id)
            self._require_same_fingerprint(
                existing.request_fingerprint, fingerprint, "Idempotency-Key"
            )
            expired_quote_ids = self._repository.expire_due_quotes(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=grant.allowed_branch_ids,
                quote_id=existing.id,
            )
            if expired_quote_ids:
                self._session.refresh(existing)
                self._session.commit()
            return self._repository.quote_record(existing)
        self._require_future_quote_deadline(cast(datetime | None, values.get("due_at")))
        payment_method_id = cast(UUID | None, values.get("payment_method_id"))
        payment_method = (
            self._require_payment_method(grant.workspace_id, payment_method_id)
            if payment_method_id is not None
            else None
        )
        customer = self._optional_customer(
            grant.workspace_id,
            branch_id,
            cast(UUID | None, values.get("customer_id")),
        )
        priced, priced_lines = self._price_lines(
            principal=principal,
            grant=grant,
            branch_id=branch_id,
            raw_lines=cast(list[dict[str, Any]], values["lines"]),
            discount_type=cast(str | None, values.get("discount_type")),
            discount_value=cast(Decimal | None, values.get("discount_value")),
        )
        quote = SalesQuote(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            customer_id=customer.id if customer else None,
            opportunity_id=cast(UUID | None, values.get("opportunity_id")),
            document_number=self._repository.next_document_number(grant.workspace_id, "quote"),
            kind=cast(str, values["kind"]),
            origin=cast(str, values.get("origin", "pos")),
            status="open",
            crm_status=cast(str | None, values.get("crm_status")),
            currency_code=workspace.default_currency,
            customer_name=customer.display_name if customer else None,
            customer_phone=customer.phone if customer else None,
            **self._document_values(priced, values),
            **(self._payment_snapshot(payment_method) if payment_method is not None else {}),
            payment_reference=self._optional_text(cast(str | None, values.get("reference"))),
            expires_at=cast(datetime | None, values.get("due_at")),
            creation_idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            created_by_platform_user_id=principal.platform_user_id,
            updated_by_platform_user_id=principal.platform_user_id,
            notes=self._optional_text(cast(str | None, values.get("notes"))),
        )
        lines = self._quote_lines(grant.workspace_id, priced_lines)
        try:
            self._repository.add_quote(quote, lines)
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="sales.quote.create",
                target_type="sales_quote",
                target_id=quote.id,
                request_id=get_request_id(),
                details={
                    "branchId": str(branch_id),
                    "kind": quote.kind,
                    "total": str(quote.total),
                },
            )
            self._session.commit()
            return self._repository.quote_record(quote)
        except IntegrityError as exc:
            self._session.rollback()
            replay = self._repository.quote_by_key(grant.workspace_id, idempotency_key)
            if replay is not None:
                self._require_branch(grant, replay.branch_id)
                self._require_same_fingerprint(
                    replay.request_fingerprint, fingerprint, "Idempotency-Key"
                )
                expired_quote_ids = self._repository.expire_due_quotes(
                    workspace_id=grant.workspace_id,
                    allowed_branch_ids=grant.allowed_branch_ids,
                    quote_id=replay.id,
                )
                if expired_quote_ids:
                    self._session.refresh(replay)
                    self._session.commit()
                return self._repository.quote_record(replay)
            raise ConflictError("No se pudo crear la cotización.") from exc

    def update_quote(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        quote_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> QuoteRecord:
        quote = self._repository.get_quote(
            grant.workspace_id,
            quote_id,
            grant.allowed_branch_ids,
            lock=True,
        )
        if quote is None:
            raise ResourceNotFoundError("La cotización no existe.", "quoteId")
        if self._repository.expire_due_quotes(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            quote_id=quote.id,
        ):
            self._session.commit()
            raise ConflictError("La cotización expiró y ya no puede editarse.", "status")
        if quote.status != "open":
            raise ConflictError("Solo una cotización abierta puede editarse.", "status")
        self._require_version(quote.version, expected_version)
        if "due_at" in changes:
            self._require_future_quote_deadline(cast(datetime | None, changes["due_at"]))
        payment_snapshot: dict[str, Any] | None = None
        if "payment_method_id" in changes:
            payment_method_id = cast(UUID | None, changes["payment_method_id"])
            if payment_method_id is None:
                payment_snapshot = self._empty_payment_snapshot()
            else:
                payment_snapshot = self._payment_snapshot(
                    self._require_payment_method(grant.workspace_id, payment_method_id)
                )
        branch_id = cast(UUID, changes.get("branch_id", quote.branch_id))
        self._require_branch(grant, branch_id)
        customer_id = cast(UUID | None, changes.get("customer_id", quote.customer_id))
        branch_changed = branch_id != quote.branch_id
        customer_changed = customer_id != quote.customer_id or branch_changed
        customer = (
            self._optional_customer(grant.workspace_id, branch_id, customer_id)
            if customer_changed
            else None
        )
        discount_type = cast(
            str,
            changes.get("discount_type", "percent" if quote.discount_mode == "pct" else "fixed"),
        )
        discount_value = cast(Decimal, changes.get("discount_value", quote.discount_value))
        discount_changed = (
            "amount" if discount_type == "fixed" else "pct"
        ) != quote.discount_mode or money(discount_value) != quote.discount_value
        reprice = branch_changed or "lines" in changes or discount_changed
        priced_lines: tuple[_PricedCatalogLine, ...] | None = None
        if reprice:
            current = self._repository.quote_record(quote)
            raw_lines = cast(
                list[dict[str, Any]],
                changes.get(
                    "lines",
                    [
                        {
                            "item_id": line.item_id,
                            "quantity": line.quantity,
                            "unit_price": line.unit_price,
                        }
                        for line in current.lines
                    ],
                ),
            )
            if any(line.get("item_id") is None for line in raw_lines):
                raise InvalidOperationError(
                    "La cotización contiene una línea histórica que ya no puede editarse.",
                    "lines",
                )
            priced, priced_lines = self._price_lines(
                principal=principal,
                grant=grant,
                branch_id=branch_id,
                raw_lines=raw_lines,
                discount_type=discount_type,
                discount_value=discount_value,
            )
        quote.branch_id = branch_id
        if customer_changed:
            quote.customer_id = customer.id if customer else None
            quote.customer_name = customer.display_name if customer else None
            quote.customer_phone = customer.phone if customer else None
        if "kind" in changes:
            quote.kind = cast(str, changes["kind"])
        if "opportunity_id" in changes:
            quote.opportunity_id = cast(UUID | None, changes["opportunity_id"])
        if "crm_status" in changes:
            quote.crm_status = cast(str | None, changes["crm_status"])
        if reprice:
            for key, value in self._document_values(
                priced,
                {
                    "discount_type": discount_type,
                    "discount_value": discount_value,
                },
            ).items():
                setattr(quote, key, value)
        if "notes" in changes:
            quote.notes = self._optional_text(cast(str | None, changes["notes"]))
        if payment_snapshot is not None:
            for key, value in payment_snapshot.items():
                setattr(quote, key, value)
        if "reference" in changes:
            quote.payment_reference = self._optional_text(cast(str | None, changes["reference"]))
        if "due_at" in changes:
            quote.expires_at = cast(datetime | None, changes["due_at"])
        quote.updated_by_platform_user_id = principal.platform_user_id
        quote.version += 1
        try:
            if priced_lines is not None:
                self._repository.replace_quote_lines(
                    quote,
                    self._quote_lines(grant.workspace_id, priced_lines),
                )
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="sales.quote.update",
                target_type="sales_quote",
                target_id=quote.id,
                request_id=get_request_id(),
                details={"changedFields": sorted(changes), "version": quote.version},
            )
            self._session.commit()
            return self._repository.quote_record(quote)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo actualizar la cotización.") from exc

    def cancel_quote(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        quote_id: UUID,
        expected_version: int,
        reason: str,
    ) -> QuoteRecord:
        quote = self._repository.get_quote(
            grant.workspace_id,
            quote_id,
            grant.allowed_branch_ids,
            lock=True,
        )
        if quote is None:
            raise ResourceNotFoundError("La cotización no existe.", "quoteId")
        if self._repository.expire_due_quotes(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            quote_id=quote.id,
        ):
            self._session.commit()
            raise ConflictError("La cotización expiró y ya no puede cancelarse.", "status")
        if quote.status == "cancelled":
            return self._repository.quote_record(quote)
        if quote.status != "open":
            raise ConflictError("La cotización ya no se puede cancelar.", "status")
        self._require_version(quote.version, expected_version)
        quote.status = "cancelled"
        quote.closed_at = datetime.now(UTC)
        quote.notes = self._join_note(quote.notes, f"Cancelación: {reason}")
        quote.updated_by_platform_user_id = principal.platform_user_id
        quote.version += 1
        self._repository.add_audit(
            workspace_id=grant.workspace_id,
            actor_platform_user_id=principal.platform_user_id,
            action="sales.quote.cancel",
            target_type="sales_quote",
            target_id=quote.id,
            request_id=get_request_id(),
            details={"reason": reason, "version": quote.version},
        )
        self._session.commit()
        return self._repository.quote_record(quote)

    def list_sales(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        register_id: UUID | None,
        customer_id: UUID | None,
        status: str | None,
        date_from: date | None,
        date_to: date | None,
        page: int,
        page_size: int,
    ) -> Page:
        self._require_optional_branch(grant, branch_id)
        if date_from is not None and date_to is not None and date_from > date_to:
            raise InvalidOperationError("dateFrom no puede ser posterior a dateTo.", "dateFrom")
        return self._repository.list_sales(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            register_id=register_id,
            customer_id=customer_id,
            status=status,
            date_from=date_from,
            date_to=date_to,
            page=page,
            page_size=page_size,
        )

    def get_sale(self, grant: PermissionGrant, sale_id: UUID) -> SaleRecord:
        sale = self._repository.get_sale(grant.workspace_id, sale_id, grant.allowed_branch_ids)
        if sale is None:
            raise ResourceNotFoundError("La venta no existe.", "saleId")
        return self._repository.sale_record(sale)

    def sales_summary(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        date_from: date | None,
        date_to: date | None,
    ) -> SalesSummary:
        self._require_optional_branch(grant, branch_id)
        if date_from is not None and date_to is not None and date_from > date_to:
            raise InvalidOperationError("dateFrom no puede ser posterior a dateTo.", "dateFrom")
        values = self._repository.sales_totals(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            date_from=date_from,
            date_to=date_to,
        )
        gross, discounts, taxes, net, count, voided = values
        return SalesSummary(
            gross_sales=money(gross),
            discounts=money(discounts),
            taxes=money(taxes),
            net_sales=money(net),
            average_ticket=money(net / count) if count else Decimal("0.00"),
            sales_count=count,
            voided_count=voided,
        )

    def checkout(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        values: dict[str, Any],
        idempotency_key: str,
    ) -> CheckoutResult:
        fingerprint = self._fingerprint(values)
        branch_id = cast(UUID, values["branch_id"])
        quote_id = cast(UUID | None, values.get("quote_id"))
        quote_version = cast(int | None, values.get("quote_version"))
        if (quote_id is None) != (quote_version is None):
            raise InvalidOperationError(
                "quoteId y quoteVersion deben enviarse juntos.", "quoteVersion"
            )
        self._require_branch(grant, branch_id)
        quote_grant: PermissionGrant | None = None
        if quote_id is not None:
            quote_grant = AuthorizationService(self._session).require_permission(
                principal, "sales.quote.manage"
            )
            self._require_branch(quote_grant, branch_id)
        existing = self._repository.sale_by_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            self._require_branch(grant, existing.branch_id)
            if quote_grant is not None:
                self._require_branch(quote_grant, existing.branch_id)
            self._require_same_fingerprint(
                existing.request_fingerprint, fingerprint, "Idempotency-Key"
            )
            replay_receivable = self._repository.receivable_for_sale(
                grant.workspace_id, existing.id
            )
            return CheckoutResult(
                self._repository.sale_record(existing),
                replay_receivable.id if replay_receivable is not None else None,
            )

        register_id = cast(UUID, values["register_id"])
        register = self._locked_open_register(grant, register_id)
        if register.branch_id != branch_id:
            raise InvalidOperationError("La caja abierta pertenece a otra sucursal.", "registerId")
        method = self._require_payment_method(
            grant.workspace_id, cast(UUID, values["payment_method_id"])
        )
        if method.requires_evidence and method.settlement_policy == "immediate":
            raise InvalidOperationError(
                "Este método requiere comprobante y debe confirmarse mediante CxC.",
                "paymentMethodId",
            )

        quote: SalesQuote | None = None
        if quote_id is not None:
            if quote_grant is None:
                raise RuntimeError("Checkout quote authorization was bypassed.")
            quote = self._repository.get_quote(
                grant.workspace_id,
                quote_id,
                quote_grant.allowed_branch_ids,
                lock=True,
            )
            if quote is None:
                raise ResourceNotFoundError("La cotización no existe.", "quoteId")
            if self._repository.expire_due_quotes(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=quote_grant.allowed_branch_ids,
                quote_id=quote.id,
            ):
                self._session.commit()
                raise ConflictError("La cotización expiró y ya no puede convertirse.", "quoteId")
            if quote.status != "open":
                raise ConflictError("La cotización ya fue procesada.", "quoteId")
            if quote.branch_id != branch_id:
                raise InvalidOperationError("La cotización pertenece a otra sucursal.", "quoteId")
            if quote_version is None:
                raise RuntimeError("Checkout quote version validation was bypassed.")
            self._require_version(quote.version, quote_version, "quoteVersion")

        customer_id = cast(UUID | None, values.get("customer_id"))
        if customer_id is None and quote is not None:
            customer_id = quote.customer_id
        if quote is not None and quote.customer_id is not None and customer_id != quote.customer_id:
            raise InvalidOperationError(
                "La venta debe conservar el cliente de la cotización.", "customerId"
            )
        customer = self._optional_customer(grant.workspace_id, branch_id, customer_id)
        if method.settlement_policy != "immediate" and customer is None:
            raise InvalidOperationError(
                "Selecciona un cliente registrado para crear una cuenta por cobrar.",
                "customerId",
            )

        priced, priced_lines = self._price_lines(
            principal=principal,
            grant=grant,
            branch_id=branch_id,
            raw_lines=cast(list[dict[str, Any]], values["lines"]),
            discount_type=cast(str | None, values.get("discount_type")),
            discount_value=cast(Decimal | None, values.get("discount_value")),
        )
        workspace = self._repository.workspace(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.")
        sale_number = self._repository.next_document_number(grant.workspace_id, "sale")
        inventory_movement_id = self._consume_stock(
            principal=principal,
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            sale_number=sale_number,
            lines=priced_lines,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        sale = Sale(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            customer_id=customer.id if customer else None,
            cash_register_id=register.id,
            quote_id=quote.id if quote else None,
            inventory_movement_id=inventory_movement_id,
            sale_number=sale_number,
            status="completed",
            currency_code=workspace.default_currency,
            customer_name=customer.display_name if customer else None,
            customer_phone=customer.phone if customer else None,
            **self._document_values(priced, values),
            **self._payment_snapshot(method),
            payment_reference=self._optional_text(cast(str | None, values.get("reference"))),
            notes=self._optional_text(cast(str | None, values.get("notes"))),
            sold_by_membership_id=principal.membership_id,
            sold_by_platform_user_id=principal.platform_user_id,
            sold_by_name=principal.display_name,
            creation_idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        sale_lines = self._sale_lines(grant.workspace_id, priced_lines)
        receivable: CustomerReceivable | None = None
        try:
            self._repository.add_sale(sale, sale_lines)
            if method.settlement_policy != "immediate" and priced.total > 0:
                if customer is None:
                    raise RuntimeError("Deferred sale customer validation was bypassed.")
                receivable = CustomerReceivable(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    customer_id=customer.id,
                    receivable_number=self._repository.next_document_number(
                        grant.workspace_id, "receivable"
                    ),
                    source="sale",
                    sale_id=sale.id,
                    **self._payment_snapshot(method),
                    currency_code=sale.currency_code,
                    customer_name=customer.display_name,
                    customer_phone=customer.phone,
                    amount=priced.total,
                    paid_amount=Decimal("0"),
                    status="pending",
                    reference=sale.payment_reference,
                    notes=self._optional_text(cast(str | None, values.get("notes"))),
                    creation_idempotency_key=self._derived_key("pos-receivable", idempotency_key),
                    request_fingerprint=fingerprint,
                    created_by_platform_user_id=principal.platform_user_id,
                    updated_by_platform_user_id=principal.platform_user_id,
                )
                receivable_lines = tuple(
                    CustomerReceivableLine(
                        workspace_id=grant.workspace_id,
                        position=line.position,
                        sale_line_id=line.id,
                        item_id=line.item_id,
                        item_name=line.item_name,
                        item_sku=line.item_sku,
                        unit_symbol=line.unit_symbol,
                        quantity=line.quantity,
                        unit_price=line.unit_price,
                        line_total=line.line_total,
                    )
                    for line in sale_lines
                )
                self._repository.add_receivable(receivable, receivable_lines)

            if method.settlement_policy == "immediate" and method.affects_cash_drawer:
                if priced.total > 0:
                    movement = CashMovement(
                        workspace_id=grant.workspace_id,
                        branch_id=branch_id,
                        cash_register_id=register.id,
                        movement_type="sale",
                        currency_code=sale.currency_code,
                        amount=priced.total,
                        cash_delta=priced.total,
                        **self._payment_snapshot(method),
                        sale_id=sale.id,
                        inventory_movement_id=inventory_movement_id,
                        concept=f"Venta {sale.sale_number}",
                        reference=sale.payment_reference,
                        created_by_membership_id=principal.membership_id,
                        created_by_platform_user_id=principal.platform_user_id,
                        created_by_name=principal.display_name,
                        idempotency_key=self._derived_key("pos-cash-sale", idempotency_key),
                        request_fingerprint=fingerprint,
                    )
                    self._repository.add_movement(movement)
                    self._apply_cash_effect(register, "sale", priced.total)

            if quote is not None:
                quote.status = "converted"
                quote.closed_at = datetime.now(UTC)
                quote.updated_by_platform_user_id = principal.platform_user_id
                quote.version += 1
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="pos.sale.checkout",
                target_type="sale",
                target_id=sale.id,
                request_id=get_request_id(),
                details={
                    "saleNumber": sale.sale_number,
                    "branchId": str(branch_id),
                    "registerId": str(register.id),
                    "total": str(sale.total),
                    "settlementPolicy": method.settlement_policy,
                    "receivableId": str(receivable.id) if receivable else None,
                    "inventoryMovementId": (
                        str(inventory_movement_id) if inventory_movement_id else None
                    ),
                },
            )
            self._session.commit()
            return CheckoutResult(
                self._repository.sale_record(sale),
                receivable.id if receivable is not None else None,
            )
        except IntegrityError as exc:
            self._session.rollback()
            replay = self._repository.sale_by_key(grant.workspace_id, idempotency_key)
            if replay is not None:
                self._require_same_fingerprint(
                    replay.request_fingerprint, fingerprint, "Idempotency-Key"
                )
                concurrent_receivable = self._repository.receivable_for_sale(
                    grant.workspace_id, replay.id
                )
                return CheckoutResult(
                    self._repository.sale_record(replay),
                    concurrent_receivable.id if concurrent_receivable else None,
                )
            raise ConflictError("No se pudo completar la venta.") from exc

    def list_receivables(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        customer_id: UUID | None,
        status: str | None,
        overdue: bool | None,
        page: int,
        page_size: int,
    ) -> Page:
        self._require_optional_branch(grant, branch_id)
        return self._repository.list_receivables(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
            customer_id=customer_id,
            status=status,
            overdue=overdue,
            page=page,
            page_size=page_size,
        )

    def get_receivable(self, grant: PermissionGrant, receivable_id: UUID) -> ReceivableRecord:
        receivable = self._repository.get_receivable(
            grant.workspace_id,
            receivable_id,
            grant.allowed_branch_ids,
        )
        if receivable is None:
            raise ResourceNotFoundError("La cuenta por cobrar no existe.", "receivableId")
        return self._repository.receivable_record(receivable)

    def receivables_summary(
        self, grant: PermissionGrant, branch_id: UUID | None
    ) -> ReceivablesSummary:
        self._require_optional_branch(grant, branch_id)
        values = self._repository.receivable_totals(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            branch_id=branch_id,
        )
        return ReceivablesSummary(*values)

    def update_receivable(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        receivable_id: UUID,
        expected_version: int,
        changes: dict[str, Any],
    ) -> ReceivableRecord:
        receivable = self._locked_receivable(grant, receivable_id)
        if receivable.status == "cancelled":
            raise ConflictError("La cuenta por cobrar está cancelada.", "status")
        self._require_version(receivable.version, expected_version)
        if "due_date" in changes:
            receivable.due_date = cast(date | None, changes["due_date"])
        if "notes" in changes:
            receivable.notes = self._optional_text(cast(str | None, changes["notes"]))
        receivable.updated_by_platform_user_id = principal.platform_user_id
        receivable.version += 1
        self._repository.add_audit(
            workspace_id=grant.workspace_id,
            actor_platform_user_id=principal.platform_user_id,
            action="pos.receivable.update",
            target_type="customer_receivable",
            target_id=receivable.id,
            request_id=get_request_id(),
            details={"changedFields": sorted(changes), "version": receivable.version},
        )
        self._session.commit()
        return self._repository.receivable_record(receivable)

    def cancel_receivable(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        receivable_id: UUID,
        expected_version: int,
        reason: str,
    ) -> ReceivableRecord:
        receivable = self._locked_receivable(grant, receivable_id)
        if receivable.status == "cancelled":
            return self._repository.receivable_record(receivable)
        if receivable.source == "sale":
            raise ConflictError("Anula la venta para cancelar su cuenta por cobrar.", "saleId")
        self._require_version(receivable.version, expected_version)
        if receivable.paid_amount > 0:
            raise ConflictError(
                "Revierte primero los pagos aplicados antes de cancelar la cuenta.",
                "status",
            )
        receivable.status = "cancelled"
        receivable.cancelled_at = datetime.now(UTC)
        receivable.cancellation_reason = reason
        receivable.updated_by_platform_user_id = principal.platform_user_id
        receivable.version += 1
        self._sync_appointment_balance(receivable)
        self._repository.add_audit(
            workspace_id=grant.workspace_id,
            actor_platform_user_id=principal.platform_user_id,
            action="pos.receivable.cancel",
            target_type="customer_receivable",
            target_id=receivable.id,
            request_id=get_request_id(),
            details={"reason": reason, "version": receivable.version},
        )
        self._session.commit()
        return self._repository.receivable_record(receivable)

    def create_receivable_payment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        receivable_id: UUID,
        amount: Decimal,
        payment_method_id: UUID,
        reference: str | None,
        note: str | None,
        register_id: UUID | None,
        expected_version: int,
        idempotency_key: str,
        evidence_source: BinaryIO | None,
        filename: str | None,
        content_type: str | None,
        storage: AttachmentStorage,
        max_bytes: int,
    ) -> ReceivableRecord:
        normalized_type = self._proof_content_type(content_type) if evidence_source else None
        digest = (
            self._digest_proof(evidence_source, max_bytes=max_bytes)
            if evidence_source is not None
            else None
        )
        request_values = {
            "receivable_id": receivable_id,
            "amount": money(amount),
            "payment_method_id": payment_method_id,
            "reference": self._optional_text(reference),
            "note": self._optional_text(note),
            "register_id": register_id,
            "version": expected_version,
            "filename": self._safe_filename(filename) if filename else None,
            "content_type": normalized_type,
            "size_bytes": digest.size_bytes if digest else None,
            "checksum_sha256": digest.checksum_sha256 if digest else None,
        }
        fingerprint = self._fingerprint(request_values)
        existing = self._repository.payment_by_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            self._require_same_fingerprint(
                existing.request_fingerprint, fingerprint, "Idempotency-Key"
            )
            return self.get_receivable(grant, existing.receivable_id)

        receivable = self._locked_receivable(grant, receivable_id)
        concurrent = self._repository.payment_by_key(grant.workspace_id, idempotency_key)
        if concurrent is not None:
            self._require_same_fingerprint(
                concurrent.request_fingerprint,
                fingerprint,
                "Idempotency-Key",
            )
            return self._repository.receivable_record(receivable)
        self._require_version(receivable.version, expected_version)
        if receivable.status in {"paid", "cancelled"}:
            raise ConflictError("La cuenta ya no admite pagos.", "status")
        payment_amount = money(amount)
        balance = money(receivable.amount - receivable.paid_amount)
        if payment_amount > balance:
            raise InvalidOperationError("El pago excede el saldo pendiente.", "amount")
        method = self._require_payment_method(grant.workspace_id, payment_method_id)
        if method.settlement_policy == "receivable":
            raise InvalidOperationError(
                "No puedes pagar una cuenta por cobrar con otro método de crédito.",
                "paymentMethodId",
            )
        if method.requires_evidence and evidence_source is None:
            raise InvalidOperationError(
                "Adjunta el comprobante requerido por este método de pago.", "file"
            )
        register: CashRegister | None = None
        if method.affects_cash_drawer:
            if register_id is None:
                raise InvalidOperationError(
                    "Selecciona una caja abierta para registrar el cobro en efectivo.",
                    "registerId",
                )
            register = self._locked_open_register(grant, register_id)
            if register.branch_id != receivable.branch_id:
                raise InvalidOperationError("La caja pertenece a otra sucursal.", "registerId")
        payment = CustomerPayment(
            workspace_id=grant.workspace_id,
            branch_id=receivable.branch_id,
            receivable_id=receivable.id,
            payment_method_id=method.id,
            cash_register_id=register.id if register else None,
            status="posted",
            currency_code=receivable.currency_code,
            amount=payment_amount,
            payment_method_code=method.code,
            payment_method_name=method.name,
            payment_channel=method.channel,
            settlement_policy=method.settlement_policy,
            affects_cash_drawer=method.affects_cash_drawer,
            requires_evidence=method.requires_evidence,
            reference=self._optional_text(reference),
            note=self._optional_text(note),
            received_by_membership_id=principal.membership_id,
            received_by_platform_user_id=principal.platform_user_id,
            received_by_name=principal.display_name,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
        )
        storage_key: str | None = None
        try:
            self._repository.add_payment(payment)
            if evidence_source is not None and digest is not None and normalized_type is not None:
                extension = _ALLOWED_PROOF_TYPES[normalized_type]
                storage_key = (
                    f"{grant.workspace_id}/pos/payments/{payment.id}/{payment.id}{extension}"
                )
                blob = storage.save(
                    evidence_source,
                    storage_key=storage_key,
                    content_type=normalized_type,
                    max_bytes=max_bytes,
                )
                if (
                    blob.size_bytes != digest.size_bytes
                    or blob.checksum_sha256 != digest.checksum_sha256
                ):
                    raise InvalidOperationError("El comprobante cambió durante la carga.", "file")
                self._repository.add_proof(
                    PaymentProof(
                        workspace_id=grant.workspace_id,
                        branch_id=receivable.branch_id,
                        customer_payment_id=payment.id,
                        original_filename=self._safe_filename(filename),
                        storage_key=blob.storage_key,
                        content_type=normalized_type,
                        size_bytes=blob.size_bytes,
                        checksum_sha256=blob.checksum_sha256,
                        uploaded_by_platform_user_id=principal.platform_user_id,
                    )
                )
            receivable.paid_amount = money(receivable.paid_amount + payment_amount)
            self._set_receivable_status(receivable)
            receivable.updated_by_platform_user_id = principal.platform_user_id
            receivable.version += 1
            if register is not None:
                movement = CashMovement(
                    workspace_id=grant.workspace_id,
                    branch_id=receivable.branch_id,
                    cash_register_id=register.id,
                    movement_type="receivable_payment",
                    currency_code=receivable.currency_code,
                    amount=payment_amount,
                    cash_delta=payment_amount,
                    **self._payment_snapshot(method),
                    customer_payment_id=payment.id,
                    concept=f"Cobro {receivable.receivable_number}",
                    reference=payment.reference,
                    created_by_membership_id=principal.membership_id,
                    created_by_platform_user_id=principal.platform_user_id,
                    created_by_name=principal.display_name,
                    idempotency_key=self._derived_key("pos-cash-payment", idempotency_key),
                    request_fingerprint=fingerprint,
                )
                self._repository.add_movement(movement)
                self._apply_cash_effect(register, "receivable_payment", payment_amount)
            self._sync_appointment_balance(receivable)
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="pos.receivable.payment.post",
                target_type="customer_receivable",
                target_id=receivable.id,
                request_id=get_request_id(),
                details={
                    "paymentId": str(payment.id),
                    "amount": str(payment.amount),
                    "status": receivable.status,
                    "version": receivable.version,
                },
            )
            self._session.commit()
            return self._repository.receivable_record(receivable)
        except AttachmentTooLargeError as exc:
            self._session.rollback()
            if storage_key:
                storage.delete(storage_key)
            raise InvalidOperationError(
                "El comprobante excede el tamaño permitido.", "file"
            ) from exc
        except AttachmentContentMismatchError as exc:
            self._session.rollback()
            if storage_key:
                storage.delete(storage_key)
            raise InvalidOperationError(
                "El contenido no coincide con el tipo declarado.", "file"
            ) from exc
        except IntegrityError as exc:
            self._session.rollback()
            if storage_key:
                storage.delete(storage_key)
            replay = self._repository.payment_by_key(grant.workspace_id, idempotency_key)
            if replay is not None:
                self._require_same_fingerprint(
                    replay.request_fingerprint,
                    fingerprint,
                    "Idempotency-Key",
                )
                return self.get_receivable(grant, replay.receivable_id)
            raise ConflictError("No se pudo registrar el pago.") from exc
        except Exception:
            self._session.rollback()
            if storage_key:
                storage.delete(storage_key)
            raise

    def upload_receivable_proof(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        receivable_id: UUID,
        evidence_source: BinaryIO,
        filename: str | None,
        content_type: str | None,
        storage: AttachmentStorage,
        max_bytes: int,
    ) -> PaymentProof:
        normalized_type = self._proof_content_type(content_type)
        digest = self._digest_proof(evidence_source, max_bytes=max_bytes)
        receivable = self._repository.get_receivable(
            grant.workspace_id,
            receivable_id,
            grant.allowed_branch_ids,
            lock=True,
        )
        if receivable is None:
            raise ResourceNotFoundError("La cuenta por cobrar no existe.", "receivableId")
        if receivable.status == "cancelled":
            raise ConflictError("La cuenta por cobrar está cancelada.", "status")
        existing = self._repository.proof_by_receivable_checksum(
            grant.workspace_id,
            receivable.id,
            digest.checksum_sha256,
        )
        if existing is not None:
            return existing
        proof_id = uuid7()
        extension = _ALLOWED_PROOF_TYPES[normalized_type]
        storage_key = f"{grant.workspace_id}/pos/receivables/{receivable.id}/{proof_id}{extension}"
        try:
            blob = storage.save(
                evidence_source,
                storage_key=storage_key,
                content_type=normalized_type,
                max_bytes=max_bytes,
            )
        except AttachmentTooLargeError as exc:
            raise InvalidOperationError(
                "El comprobante excede el tamaño permitido.", "file"
            ) from exc
        except AttachmentContentMismatchError as exc:
            raise InvalidOperationError(
                "El contenido no coincide con el tipo declarado.", "file"
            ) from exc
        proof = PaymentProof(
            id=proof_id,
            workspace_id=grant.workspace_id,
            branch_id=receivable.branch_id,
            receivable_id=receivable.id,
            original_filename=self._safe_filename(filename),
            storage_key=blob.storage_key,
            content_type=normalized_type,
            size_bytes=blob.size_bytes,
            checksum_sha256=blob.checksum_sha256,
            uploaded_by_platform_user_id=principal.platform_user_id,
        )
        try:
            self._repository.add_proof(proof)
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="pos.receivable.proof.upload",
                target_type="payment_proof",
                target_id=proof.id,
                request_id=get_request_id(),
                details={
                    "receivableId": str(receivable.id),
                    "checksumSha256": proof.checksum_sha256,
                },
            )
            self._session.commit()
            return proof
        except IntegrityError as exc:
            self._session.rollback()
            storage.delete(storage_key)
            replay = self._repository.proof_by_receivable_checksum(
                grant.workspace_id, receivable_id, digest.checksum_sha256
            )
            if replay is not None:
                return replay
            raise ConflictError("No se pudo registrar el comprobante.") from exc
        except Exception:
            self._session.rollback()
            storage.delete(storage_key)
            raise

    def get_proof(self, grant: PermissionGrant, proof_id: UUID) -> PaymentProof:
        proof = self._repository.get_proof(
            workspace_id=grant.workspace_id,
            proof_id=proof_id,
            allowed_branch_ids=grant.allowed_branch_ids,
        )
        if proof is None:
            raise ResourceNotFoundError("El comprobante no existe.", "proofId")
        return proof

    def reverse_payment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        payment_id: UUID,
        expected_version: int,
        reason: str,
        idempotency_key: str,
    ) -> ReceivableRecord:
        fingerprint = self._fingerprint(
            {
                "payment_id": payment_id,
                "version": expected_version,
                "reason": reason,
            }
        )
        replay = self._repository.payment_by_reversal_key(grant.workspace_id, idempotency_key)
        if replay is not None:
            self._require_branch(grant, replay.branch_id)
            self._require_same_fingerprint(
                replay.reversal_request_fingerprint, fingerprint, "Idempotency-Key"
            )
            return self.get_receivable(grant, replay.receivable_id)
        payment = self._repository.get_payment(grant.workspace_id, payment_id, lock=True)
        if payment is None:
            raise ResourceNotFoundError("El pago no existe.", "paymentId")
        self._require_branch(grant, payment.branch_id)
        concurrent = self._repository.payment_by_reversal_key(
            grant.workspace_id,
            idempotency_key,
        )
        if concurrent is not None:
            self._require_same_fingerprint(
                concurrent.reversal_request_fingerprint,
                fingerprint,
                "Idempotency-Key",
            )
            return self.get_receivable(grant, concurrent.receivable_id)
        self._require_version(payment.version, expected_version)
        if payment.status != "posted":
            raise ConflictError("El pago ya fue revertido.", "status")
        receivable = self._locked_receivable(grant, payment.receivable_id)
        if payment.amount > receivable.paid_amount:
            raise ConflictError("El saldo aplicado del pago es inconsistente.")
        if payment.affects_cash_drawer:
            if payment.cash_register_id is None:
                raise ConflictError("El pago en efectivo no tiene una caja asociada.")
            register = self._locked_reversal_register(
                grant,
                original_register_id=payment.cash_register_id,
                branch_id=payment.branch_id,
            )
            original = self._repository.movement_for_payment(grant.workspace_id, payment.id)
            if original is None:
                raise ConflictError("No existe el movimiento de caja del pago.")
            reversal = CashMovement(
                workspace_id=grant.workspace_id,
                branch_id=payment.branch_id,
                cash_register_id=register.id,
                movement_type="reversal",
                currency_code=payment.currency_code,
                amount=payment.amount,
                cash_delta=-payment.amount,
                payment_method_id=payment.payment_method_id,
                payment_method_code=payment.payment_method_code,
                payment_method_name=payment.payment_method_name,
                payment_channel=payment.payment_channel,
                settlement_policy=payment.settlement_policy,
                affects_cash_drawer=payment.affects_cash_drawer,
                requires_evidence=payment.requires_evidence,
                reversal_of_movement_id=original.id,
                concept=f"Reverso de cobro {receivable.receivable_number}",
                reference=payment.reference,
                notes=reason,
                created_by_membership_id=principal.membership_id,
                created_by_platform_user_id=principal.platform_user_id,
                created_by_name=principal.display_name,
                idempotency_key=self._derived_key("pos-cash-payment-reversal", idempotency_key),
                request_fingerprint=fingerprint,
            )
            self._repository.add_movement(reversal)
            self._reverse_cash_effect(register, original)
        payment.status = "reversed"
        payment.reversed_at = datetime.now(UTC)
        payment.reversed_by_platform_user_id = principal.platform_user_id
        payment.reversal_reason = reason
        payment.reversal_idempotency_key = idempotency_key
        payment.reversal_request_fingerprint = fingerprint
        payment.version += 1
        receivable.paid_amount = money(receivable.paid_amount - payment.amount)
        self._set_receivable_status(receivable)
        receivable.updated_by_platform_user_id = principal.platform_user_id
        receivable.version += 1
        self._sync_appointment_balance(receivable)
        try:
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="pos.receivable.payment.reverse",
                target_type="customer_payment",
                target_id=payment.id,
                request_id=get_request_id(),
                details={
                    "receivableId": str(receivable.id),
                    "amount": str(payment.amount),
                    "reason": reason,
                },
            )
            self._session.commit()
            return self._repository.receivable_record(receivable)
        except IntegrityError as exc:
            self._session.rollback()
            concurrent = self._repository.payment_by_reversal_key(
                grant.workspace_id, idempotency_key
            )
            if concurrent is not None:
                self._require_same_fingerprint(
                    concurrent.reversal_request_fingerprint,
                    fingerprint,
                    "Idempotency-Key",
                )
                return self.get_receivable(grant, concurrent.receivable_id)
            raise ConflictError("No se pudo revertir el pago.") from exc

    def void_sale(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        sale_id: UUID,
        expected_version: int,
        reason: str,
        idempotency_key: str,
    ) -> SaleRecord:
        fingerprint = self._fingerprint(
            {"sale_id": sale_id, "version": expected_version, "reason": reason}
        )
        replay = self._repository.sale_by_void_key(grant.workspace_id, idempotency_key)
        if replay is not None:
            self._require_branch(grant, replay.branch_id)
            self._require_same_fingerprint(
                replay.void_request_fingerprint, fingerprint, "Idempotency-Key"
            )
            return self._repository.sale_record(replay)
        sale = self._repository.get_sale(
            grant.workspace_id,
            sale_id,
            grant.allowed_branch_ids,
            lock=True,
        )
        if sale is None:
            raise ResourceNotFoundError("La venta no existe.", "saleId")
        concurrent = self._repository.sale_by_void_key(grant.workspace_id, idempotency_key)
        if concurrent is not None:
            self._require_branch(grant, concurrent.branch_id)
            self._require_same_fingerprint(
                concurrent.void_request_fingerprint,
                fingerprint,
                "Idempotency-Key",
            )
            return self._repository.sale_record(concurrent)
        self._require_version(sale.version, expected_version)
        if sale.status != "completed":
            raise ConflictError("La venta ya fue anulada.", "status")
        sale_record = self._repository.sale_record(sale)
        receivable = self._repository.receivable_for_sale(grant.workspace_id, sale.id, lock=True)
        if receivable is not None and receivable.paid_amount > 0:
            raise ConflictError(
                "Revierte primero los cobros aplicados a la cuenta por cobrar.",
                "saleId",
            )

        cash_movement = self._repository.movement_for_sale(grant.workspace_id, sale.id)
        if cash_movement is not None:
            register = self._locked_reversal_register(
                grant,
                original_register_id=sale.cash_register_id,
                branch_id=sale.branch_id,
            )
            reversal = CashMovement(
                workspace_id=grant.workspace_id,
                branch_id=sale.branch_id,
                cash_register_id=register.id,
                movement_type="reversal",
                currency_code=sale.currency_code,
                amount=cash_movement.amount,
                cash_delta=-cash_movement.cash_delta,
                payment_method_id=sale.payment_method_id,
                payment_method_code=sale.payment_method_code,
                payment_method_name=sale.payment_method_name,
                payment_channel=sale.payment_channel,
                settlement_policy=sale.settlement_policy,
                affects_cash_drawer=sale.affects_cash_drawer,
                requires_evidence=sale.requires_evidence,
                reversal_of_movement_id=cash_movement.id,
                concept=f"Anulación {sale.sale_number}",
                reference=sale.payment_reference,
                notes=reason,
                created_by_membership_id=principal.membership_id,
                created_by_platform_user_id=principal.platform_user_id,
                created_by_name=principal.display_name,
                idempotency_key=self._derived_key("pos-cash-sale-void", idempotency_key),
                request_fingerprint=fingerprint,
            )
            self._repository.add_movement(reversal)
            self._reverse_cash_effect(register, cash_movement)

        reversal_inventory_id = self._restore_stock(
            principal=principal,
            sale=sale,
            lines=sale_record.lines,
            idempotency_key=idempotency_key,
            request_fingerprint=fingerprint,
            reason=reason,
        )
        if receivable is not None:
            receivable.status = "cancelled"
            receivable.cancelled_at = datetime.now(UTC)
            receivable.cancellation_reason = f"Venta anulada: {reason}"
            receivable.updated_by_platform_user_id = principal.platform_user_id
            receivable.version += 1
            self._sync_appointment_balance(receivable)
        sale.status = "voided"
        sale.voided_at = datetime.now(UTC)
        sale.voided_by_platform_user_id = principal.platform_user_id
        sale.void_reason = reason
        sale.void_idempotency_key = idempotency_key
        sale.void_request_fingerprint = fingerprint
        sale.version += 1
        try:
            self._repository.add_audit(
                workspace_id=grant.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action="pos.sale.void",
                target_type="sale",
                target_id=sale.id,
                request_id=get_request_id(),
                details={
                    "reason": reason,
                    "inventoryReversalMovementId": (
                        str(reversal_inventory_id) if reversal_inventory_id else None
                    ),
                    "version": sale.version,
                },
            )
            self._session.commit()
            return self._repository.sale_record(sale)
        except IntegrityError as exc:
            self._session.rollback()
            concurrent = self._repository.sale_by_void_key(grant.workspace_id, idempotency_key)
            if concurrent is not None:
                self._require_same_fingerprint(
                    concurrent.void_request_fingerprint,
                    fingerprint,
                    "Idempotency-Key",
                )
                return self._repository.sale_record(concurrent)
            raise ConflictError("No se pudo anular la venta.") from exc

    def sync_appointment_receivable(
        self,
        *,
        principal: AuthPrincipal,
        appointment: Appointment,
    ) -> CustomerReceivable | None:
        """Synchronize agenda debt inside the caller's existing transaction."""

        existing = self._repository.receivable_for_appointment(
            appointment.workspace_id, appointment.id, lock=True
        )
        if appointment.status == "cancelled":
            appointment.pending_payment = False
            appointment.pending_amount = Decimal("0")
        should_exist = appointment.pending_payment and appointment.pending_amount > 0
        if should_exist and appointment.customer_id is None:
            raise InvalidOperationError(
                "Vincula un cliente registrado para dejar saldo pendiente en la cita.",
                "customerId",
            )
        if not should_exist:
            if existing is None or existing.status in {"paid", "cancelled"}:
                return existing
            if existing.paid_amount > 0:
                raise ConflictError(
                    "No puedes retirar el saldo pendiente de una cita con cobros parciales.",
                    "pendingPayment",
                )
            existing.status = "cancelled"
            existing.cancelled_at = datetime.now(UTC)
            existing.cancellation_reason = "Saldo pendiente retirado desde Agenda."
            existing.updated_by_platform_user_id = principal.platform_user_id
            existing.version += 1
            return existing
        customer = self._repository.customer(
            appointment.workspace_id,
            appointment.branch_id,
            cast(UUID, appointment.customer_id),
        )
        if customer is None:
            raise ResourceNotFoundError(
                "El cliente de la cita no está activo en la sucursal.", "customerId"
            )
        outstanding_amount = money(appointment.pending_amount)
        if existing is None:
            amount = outstanding_amount
            workspace = self._repository.workspace(appointment.workspace_id)
            if workspace is None:
                raise ResourceNotFoundError("El workspace no existe.")
            fingerprint = self._fingerprint(
                {
                    "appointment_id": appointment.id,
                    "customer_id": customer.id,
                    "amount": amount,
                }
            )
            existing = CustomerReceivable(
                workspace_id=appointment.workspace_id,
                branch_id=appointment.branch_id,
                customer_id=customer.id,
                receivable_number=self._repository.next_document_number(
                    appointment.workspace_id, "receivable"
                ),
                source="appointment",
                appointment_id=appointment.id,
                currency_code=workspace.default_currency,
                customer_name=appointment.customer_name,
                customer_phone=appointment.customer_phone,
                amount=amount,
                paid_amount=Decimal("0"),
                status="pending",
                reference=(
                    f"Cita {appointment.scheduled_date.isoformat()} "
                    f"{appointment.scheduled_time.isoformat(timespec='minutes')}"
                ),
                notes=f"Servicio: {appointment.service_name}",
                due_date=appointment.scheduled_date,
                creation_idempotency_key=self._derived_key(
                    "agenda-receivable", str(appointment.id)
                ),
                request_fingerprint=fingerprint,
                created_by_platform_user_id=principal.platform_user_id,
                updated_by_platform_user_id=principal.platform_user_id,
            )
            line = CustomerReceivableLine(
                workspace_id=appointment.workspace_id,
                position=1,
                item_id=appointment.service_id,
                item_name=appointment.service_name,
                item_sku=None,
                unit_symbol="serv",
                quantity=Decimal("1.000"),
                unit_price=amount,
                line_total=amount,
            )
            self._repository.add_receivable(existing, (line,))
        else:
            amount = money(existing.paid_amount + outstanding_amount)
            if existing.branch_id != appointment.branch_id:
                history = self._repository.receivable_record(existing)
                if history.payments or history.proofs:
                    raise ConflictError(
                        "No puedes mover de sucursal una CxC con cobros o comprobantes.",
                        "branchId",
                    )
                existing.branch_id = appointment.branch_id
            if existing.customer_id != customer.id:
                if existing.paid_amount > 0:
                    raise ConflictError(
                        "No puedes cambiar el cliente de una CxC con pagos.", "customerId"
                    )
                existing.customer_id = customer.id
            existing.amount = amount
            existing.customer_name = appointment.customer_name
            existing.customer_phone = appointment.customer_phone
            existing.due_date = appointment.scheduled_date
            existing.reference = (
                f"Cita {appointment.scheduled_date.isoformat()} "
                f"{appointment.scheduled_time.isoformat(timespec='minutes')}"
            )
            existing.notes = f"Servicio: {appointment.service_name}"
            lines = self._repository.receivable_lines(
                appointment.workspace_id,
                existing.id,
            )
            if len(lines) != 1:
                raise ConflictError(
                    "El detalle de la cuenta por cobrar de la cita es inconsistente."
                )
            line = lines[0]
            line.item_id = appointment.service_id
            line.item_name = appointment.service_name
            line.quantity = Decimal("1.000")
            line.unit_price = amount
            line.line_total = amount
            existing.status = (
                "paid"
                if existing.paid_amount == amount
                else ("partial" if existing.paid_amount > 0 else "pending")
            )
            existing.paid_at = datetime.now(UTC) if existing.status == "paid" else None
            existing.cancelled_at = None
            existing.cancellation_reason = None
            existing.updated_by_platform_user_id = principal.platform_user_id
            existing.version += 1
        self._repository.add_audit(
            workspace_id=appointment.workspace_id,
            actor_platform_user_id=principal.platform_user_id,
            action="pos.receivable.sync_appointment",
            target_type="customer_receivable",
            target_id=existing.id,
            request_id=get_request_id(),
            details={
                "appointmentId": str(appointment.id),
                "amount": str(existing.amount),
                "status": existing.status,
            },
        )
        return existing

    def _price_lines(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        branch_id: UUID,
        raw_lines: list[dict[str, Any]],
        discount_type: str | None,
        discount_value: Decimal | None,
    ) -> tuple[PricedDocument, tuple[_PricedCatalogLine, ...]]:
        self._require_active_branch(grant.workspace_id, branch_id)
        item_ids = {cast(UUID, line["item_id"]) for line in raw_lines}
        records = self._repository.catalog(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            item_ids=item_ids,
        )
        by_id = {record.item.id: record for record in records}
        if set(by_id) != item_ids:
            raise ResourceNotFoundError(
                "Un artículo no está activo o disponible en la sucursal.", "lines"
            )
        pricing_inputs: list[PricingInput] = []
        selected_prices: list[tuple[PosCatalogRecord, Decimal, Decimal]] = []
        override_requested = False
        for raw in raw_lines:
            record = by_id[cast(UUID, raw["item_id"])]
            if record.profile.sale_price is None:
                raise InvalidOperationError(
                    "El artículo no tiene precio de venta configurado.", "lines"
                )
            list_price = money(record.profile.sale_price)
            requested_price = cast(Decimal | None, raw.get("unit_price"))
            unit_price = money(requested_price) if requested_price is not None else list_price
            if unit_price != list_price:
                override_requested = True
            line_quantity = quantity(cast(Decimal, raw["quantity"]))
            selected_prices.append((record, line_quantity, unit_price))
            pricing_inputs.append(
                PricingInput(
                    item_id=record.item.id,
                    quantity=line_quantity,
                    unit_price=unit_price,
                    tax_rate=record.profile.tax_rate,
                )
            )
        normalized_discount = money(discount_value or Decimal("0"))
        if override_requested or normalized_discount > 0:
            self._require_discount_permission(principal, grant.workspace_id, branch_id)
        normalized_type = cast(Any, discount_type)
        priced = price_document(
            pricing_inputs,
            discount_type=normalized_type,
            discount_value=normalized_discount,
        )
        lines = tuple(
            _PricedCatalogLine(
                catalog=record,
                quantity=priced_line.quantity,
                list_price=money(record.profile.sale_price or Decimal("0")),
                unit_price=priced_line.unit_price,
                discount_amount=priced_line.discount_amount,
                tax_rate=priced_line.tax_rate,
                tax_amount=priced_line.tax_amount,
                line_total=priced_line.line_total,
            )
            for (record, _requested_quantity, _requested_price), priced_line in zip(
                selected_prices, priced.lines, strict=True
            )
        )
        return priced, lines

    @staticmethod
    def _document_values(priced: PricedDocument, values: dict[str, Any]) -> dict[str, Any]:
        discount_type = cast(str | None, values.get("discount_type"))
        return {
            "subtotal": priced.subtotal,
            "discount_mode": "amount" if discount_type == "fixed" else "pct",
            "discount_value": money(
                cast(Decimal | None, values.get("discount_value")) or Decimal("0")
            ),
            "discount_amount": priced.discount_amount,
            "tax_amount": priced.tax_amount,
            "total": priced.total,
        }

    @staticmethod
    def _quote_lines(
        workspace_id: UUID,
        lines: tuple[_PricedCatalogLine, ...],
    ) -> tuple[SalesQuoteLine, ...]:
        return tuple(
            SalesQuoteLine(
                workspace_id=workspace_id,
                position=position,
                item_id=line.catalog.item.id,
                item_name=line.catalog.item.name,
                item_sku=line.catalog.item.sku,
                item_type=line.catalog.item.item_type,
                unit_symbol=line.catalog.unit.symbol,
                quantity=line.quantity,
                list_price=line.list_price,
                unit_price=line.unit_price,
                discount_amount=line.discount_amount,
                tax_rate=line.tax_rate,
                tax_amount=line.tax_amount,
                line_total=line.line_total,
            )
            for position, line in enumerate(lines, start=1)
        )

    @staticmethod
    def _sale_lines(
        workspace_id: UUID,
        lines: tuple[_PricedCatalogLine, ...],
    ) -> tuple[SaleLine, ...]:
        return tuple(
            SaleLine(
                workspace_id=workspace_id,
                position=position,
                item_id=line.catalog.item.id,
                item_name=line.catalog.item.name,
                item_sku=line.catalog.item.sku,
                item_type=line.catalog.item.item_type,
                unit_symbol=line.catalog.unit.symbol,
                quantity=line.quantity,
                list_price=line.list_price,
                unit_price=line.unit_price,
                unit_cost_snapshot=line.catalog.profile.unit_cost,
                discount_amount=line.discount_amount,
                tax_rate=line.tax_rate,
                tax_amount=line.tax_amount,
                line_total=line.line_total,
            )
            for position, line in enumerate(lines, start=1)
        )

    def _consume_stock(
        self,
        *,
        principal: AuthPrincipal,
        workspace_id: UUID,
        branch_id: UUID,
        sale_number: str,
        lines: tuple[_PricedCatalogLine, ...],
        idempotency_key: str,
        request_fingerprint: str,
    ) -> UUID | None:
        tracked = {
            line.catalog.item.id: line for line in lines if line.catalog.item.item_type == "product"
        }
        if not tracked:
            return None
        warehouse = self._repository.default_warehouse(workspace_id, branch_id)
        if warehouse is None:
            raise InvalidOperationError(
                "La sucursal no tiene un almacén predeterminado activo.", "branchId"
            )
        locked = self._inventory.lock_stock_records(
            workspace_id=workspace_id,
            branch_id=branch_id,
            warehouse_id=warehouse.id,
            item_ids=set(tracked),
        )
        by_id = {record.item.id: record for record in locked}
        if set(by_id) != set(tracked):
            raise ConflictError("Un producto no tiene balance de inventario inicializado.", "lines")
        changes: list[tuple[LockedStockRecord, Decimal]] = []
        for item_id in sorted(tracked, key=str):
            line = tracked[item_id]
            record = by_id[item_id]
            current = quantity(record.balance.quantity)
            if line.quantity > current:
                raise ConflictError(f"Stock insuficiente para {record.item.name}.", "lines")
            changes.append((record, quantity(current - line.quantity)))
        return self._inventory.create_movement(
            workspace_id=workspace_id,
            branch_id=branch_id,
            warehouse_id=warehouse.id,
            movement_type="outbound",
            employee_id=None,
            appointment_id=None,
            comment=f"Venta POS {sale_number}",
            idempotency_key=self._derived_key("pos-stock-sale", idempotency_key),
            request_fingerprint=request_fingerprint,
            actor_platform_user_id=principal.platform_user_id,
            changes=changes,
            request_id=get_request_id(),
        )

    def _restore_stock(
        self,
        *,
        principal: AuthPrincipal,
        sale: Sale,
        lines: tuple[SaleLine, ...],
        idempotency_key: str,
        request_fingerprint: str,
        reason: str,
    ) -> UUID | None:
        tracked = {
            line.item_id: line
            for line in lines
            if line.item_type == "product" and line.item_id is not None
        }
        if not tracked:
            return None
        if sale.inventory_movement_id is None:
            raise ConflictError("La venta no tiene movimiento de inventario asociado.")
        original = self._repository.inventory_movement(
            sale.workspace_id, sale.inventory_movement_id
        )
        if original is None:
            raise ConflictError("El movimiento de inventario de la venta no existe.")
        locked = self._inventory.lock_stock_records(
            workspace_id=sale.workspace_id,
            branch_id=sale.branch_id,
            warehouse_id=original.warehouse_id,
            item_ids=set(tracked),
            require_active_items=False,
        )
        by_id = {record.item.id: record for record in locked}
        if set(by_id) != set(tracked):
            raise ConflictError("No se pudo bloquear todo el inventario para revertir la venta.")
        changes = [
            (
                by_id[item_id],
                quantity(by_id[item_id].balance.quantity + tracked[item_id].quantity),
            )
            for item_id in sorted(tracked, key=str)
        ]
        return self._inventory.create_movement(
            workspace_id=sale.workspace_id,
            branch_id=sale.branch_id,
            warehouse_id=original.warehouse_id,
            movement_type="inbound",
            employee_id=None,
            appointment_id=None,
            comment=f"Anulación POS {sale.sale_number}: {reason}",
            idempotency_key=self._derived_key("pos-stock-void", idempotency_key),
            request_fingerprint=request_fingerprint,
            actor_platform_user_id=principal.platform_user_id,
            changes=changes,
            request_id=get_request_id(),
        )

    def _require_discount_permission(
        self, principal: AuthPrincipal, workspace_id: UUID, branch_id: UUID
    ) -> None:
        scopes = self._authorization.permission_scopes(
            workspace_id=workspace_id,
            membership_id=principal.membership_id,
            permission_code="pos.discount.override",
        )
        branch = self._repository.branch(workspace_id, branch_id)
        allowed = any(
            scope.scope_type == "workspace"
            or (scope.scope_type == "branch" and scope.branch_id == branch_id)
            or (
                branch is not None
                and scope.scope_type == "legal_entity"
                and scope.legal_entity_id == branch.legal_entity_id
            )
            for scope in scopes
        )
        if not allowed:
            raise AuthorizationError("No tienes permiso para aplicar descuentos o cambiar precios.")

    def _optional_customer(
        self, workspace_id: UUID, branch_id: UUID, customer_id: UUID | None
    ) -> Any:
        if customer_id is None:
            return None
        customer = self._repository.customer(workspace_id, branch_id, customer_id)
        if customer is None:
            raise ResourceNotFoundError("El cliente no está activo en la sucursal.", "customerId")
        return customer

    def _locked_receivable(
        self,
        grant: PermissionGrant,
        receivable_id: UUID,
    ) -> CustomerReceivable:
        candidate = self._repository.get_receivable(
            grant.workspace_id,
            receivable_id,
            grant.allowed_branch_ids,
        )
        if candidate is None:
            raise ResourceNotFoundError("La cuenta por cobrar no existe.", "receivableId")
        if candidate.appointment_id is not None:
            appointment = self._repository.appointment(
                grant.workspace_id,
                candidate.appointment_id,
                lock=True,
            )
            if appointment is None:
                raise ConflictError("La cita asociada a la cuenta por cobrar no existe.")
        locked = self._repository.get_receivable(
            grant.workspace_id,
            receivable_id,
            grant.allowed_branch_ids,
            lock=True,
        )
        if locked is None:
            raise ResourceNotFoundError("La cuenta por cobrar no existe.", "receivableId")
        return locked

    def _locked_open_register(self, grant: PermissionGrant, register_id: UUID) -> CashRegister:
        register = self._repository.get_register(
            grant.workspace_id,
            register_id,
            grant.allowed_branch_ids,
            lock=True,
        )
        if register is None:
            raise ResourceNotFoundError("La caja no existe.", "registerId")
        if register.status != "open":
            raise ConflictError("La caja está cerrada.", "registerId")
        return register

    def _locked_reversal_register(
        self,
        grant: PermissionGrant,
        *,
        original_register_id: UUID,
        branch_id: UUID,
    ) -> CashRegister:
        original = self._repository.get_register(
            grant.workspace_id,
            original_register_id,
            grant.allowed_branch_ids,
            lock=True,
        )
        if original is None:
            raise ResourceNotFoundError("La caja original no existe.", "registerId")
        if original.branch_id != branch_id:
            raise ConflictError("La caja original no pertenece a la sucursal del movimiento.")
        if original.status == "open":
            return original
        current = self._repository.current_register(
            grant.workspace_id,
            branch_id,
            lock=True,
        )
        if current is None:
            raise ConflictError(
                "Abre una caja en la sucursal para registrar la salida de efectivo del reverso.",
                "registerId",
            )
        return current

    def _require_payment_method(self, workspace_id: UUID, payment_method_id: UUID) -> PaymentMethod:
        method = self._repository.payment_method(workspace_id, payment_method_id)
        if method is None:
            raise ResourceNotFoundError(
                "El método de pago no existe o está inactivo.", "paymentMethodId"
            )
        return method

    @staticmethod
    def _payment_snapshot(method: PaymentMethod) -> dict[str, Any]:
        return {
            "payment_method_id": method.id,
            "payment_method_code": method.code,
            "payment_method_name": method.name,
            "payment_channel": method.channel,
            "settlement_policy": method.settlement_policy,
            "affects_cash_drawer": method.affects_cash_drawer,
            "requires_evidence": method.requires_evidence,
        }

    @staticmethod
    def _empty_payment_snapshot() -> dict[str, None]:
        return {
            "payment_method_id": None,
            "payment_method_code": None,
            "payment_method_name": None,
            "payment_channel": None,
            "settlement_policy": None,
            "affects_cash_drawer": None,
            "requires_evidence": None,
        }

    @staticmethod
    def _expected_cash(register: CashRegister) -> Decimal:
        return money(
            register.opening_cash
            + register.cash_sales_amount
            + register.receivable_payments_amount
            + register.cash_income_amount
            - register.cash_expense_amount
        )

    @staticmethod
    def _apply_cash_effect(register: CashRegister, movement_type: str, amount: Decimal) -> None:
        fields = {
            "sale": "cash_sales_amount",
            "receivable_payment": "receivable_payments_amount",
            "income": "cash_income_amount",
            "expense": "cash_expense_amount",
        }
        field = fields[movement_type]
        setattr(register, field, money(cast(Decimal, getattr(register, field)) + amount))
        register.version += 1

    @staticmethod
    def _reverse_cash_effect(register: CashRegister, original: CashMovement) -> None:
        if register.id != original.cash_register_id:
            if original.cash_delta > 0:
                register.cash_expense_amount = money(
                    register.cash_expense_amount + original.cash_delta
                )
            else:
                register.cash_income_amount = money(
                    register.cash_income_amount + abs(original.cash_delta)
                )
            register.version += 1
            return
        fields = {
            "sale": "cash_sales_amount",
            "receivable_payment": "receivable_payments_amount",
            "income": "cash_income_amount",
            "expense": "cash_expense_amount",
        }
        field = fields.get(original.movement_type)
        if field is None:
            raise ConflictError("El movimiento original no admite otro reverso.")
        next_value = money(cast(Decimal, getattr(register, field)) - original.amount)
        if next_value < 0:
            raise ConflictError("El acumulado de caja no permite este reverso.")
        setattr(register, field, next_value)
        register.version += 1

    def _movement_from_register(
        self, grant: PermissionGrant, movement: CashMovement
    ) -> CashMovementRecord:
        register = self._repository.get_register(
            grant.workspace_id,
            movement.cash_register_id,
            grant.allowed_branch_ids,
        )
        if register is None:
            raise ResourceNotFoundError("La caja no existe.", "registerId")
        return self._repository.movement_record(movement)

    def _sync_appointment_balance(self, receivable: CustomerReceivable) -> None:
        if receivable.appointment_id is None:
            return
        appointment = self._repository.appointment(
            receivable.workspace_id,
            receivable.appointment_id,
            lock=True,
        )
        if appointment is None:
            raise ConflictError("La cita asociada a la cuenta por cobrar no existe.")
        balance = money(receivable.amount - receivable.paid_amount)
        if receivable.status in {"paid", "cancelled"}:
            appointment.pending_payment = False
            appointment.pending_amount = Decimal("0")
        else:
            appointment.pending_payment = True
            appointment.pending_amount = balance
        appointment.updated_by_platform_user_id = receivable.updated_by_platform_user_id
        appointment.version += 1

    @staticmethod
    def _set_receivable_status(receivable: CustomerReceivable) -> None:
        if receivable.paid_amount <= 0:
            receivable.status = "pending"
            receivable.paid_at = None
        elif receivable.paid_amount < receivable.amount:
            receivable.status = "partial"
            receivable.paid_at = None
        else:
            receivable.status = "paid"
            receivable.paid_at = datetime.now(UTC)
        receivable.cancelled_at = None
        receivable.cancellation_reason = None

    @staticmethod
    def _proof_content_type(content_type: str | None) -> str:
        normalized = (content_type or "").casefold().split(";", 1)[0].strip()
        if normalized not in _ALLOWED_PROOF_TYPES:
            raise InvalidOperationError(
                "Tipo de comprobante no permitido. Usa PDF, JPG, PNG o WebP.", "file"
            )
        return normalized

    @staticmethod
    def _digest_proof(source: BinaryIO, *, max_bytes: int) -> ProofDigest:
        try:
            start = source.tell()
        except AttributeError, OSError:
            start = 0
        digest = hashlib.sha256()
        total = 0
        while chunk := source.read(64 * 1024):
            total += len(chunk)
            if total > max_bytes:
                try:
                    source.seek(start)
                except AttributeError, OSError:
                    pass
                raise InvalidOperationError("El comprobante excede el tamaño permitido.", "file")
            digest.update(chunk)
        try:
            source.seek(start)
        except (AttributeError, OSError) as exc:
            raise InvalidOperationError(
                "No se pudo preparar el comprobante para cargarlo.", "file"
            ) from exc
        if total == 0:
            raise InvalidOperationError("El comprobante está vacío.", "file")
        return ProofDigest(total, digest.hexdigest())

    @staticmethod
    def _safe_filename(filename: str | None) -> str:
        value = re.split(r"[\\/]", filename or "comprobante")[-1]
        value = "".join(char for char in value if char.isprintable()).strip()[:255]
        return value or "comprobante"

    def _require_active_branch(self, workspace_id: UUID, branch_id: UUID) -> Any:
        branch = self._repository.branch(workspace_id, branch_id)
        if branch is None:
            raise ResourceNotFoundError("La sucursal no existe o está inactiva.", "branchId")
        return branch

    @staticmethod
    def _require_branch(grant: PermissionGrant, branch_id: UUID) -> None:
        if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
            raise ResourceNotFoundError(
                "La sucursal no existe o está fuera de tu alcance.", "branchId"
            )

    def _require_optional_branch(self, grant: PermissionGrant, branch_id: UUID | None) -> None:
        if branch_id is not None:
            self._require_branch(grant, branch_id)

    @staticmethod
    def _require_version(current: int, expected: int, parameter: str = "version") -> None:
        if current != expected:
            raise ConflictError(
                "El registro cambió; vuelve a cargarlo antes de continuar.", parameter
            )

    def _require_future_quote_deadline(self, value: datetime | None) -> None:
        if self._repository.quote_deadline_has_elapsed(value):
            raise InvalidOperationError("dueAt debe estar en el futuro.", "dueAt")

    @staticmethod
    def _require_same_fingerprint(current: str | None, expected: str, parameter: str) -> None:
        if current != expected:
            raise ConflictError(
                "La clave de idempotencia ya fue usada con otro contenido.", parameter
            )

    @staticmethod
    def _fingerprint(values: Any) -> str:
        encoded = json.dumps(
            values,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _derived_key(prefix: str, value: str) -> str:
        digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
        return f"{prefix}:{digest}"

    @staticmethod
    def _optional_text(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None

    @staticmethod
    def _join_note(current: str | None, addition: str) -> str:
        return f"{current}\n{addition}" if current else addition
