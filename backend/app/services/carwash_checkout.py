import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import CarwashCommission, CarwashWash, CarwashWashLine, SaleLine
from app.repositories.pos import PosRepository
from app.schemas.administration import PaymentMethodResponse
from app.schemas.carwash_checkout import (
    CompleteWashRequest,
    PreviewWashRequest,
    VoidWashRequest,
    WashBillingResponse,
    WashCheckoutContext,
    WashPricePreview,
)
from app.schemas.carwash_operations import WashFields, WashResponse
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.carwash import CarwashService
from app.services.carwash_operations import CarwashOperationsService, fingerprint
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError
from app.services.pos import CheckoutSnapshot, PosService
from app.services.pos_money import PricingInput, money, price_document


class CarwashCheckoutService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.operations = CarwashOperationsService(session)
        self.pos = PosService(session)
        self.sales = PosRepository(session)

    def get(
        self, principal: AuthPrincipal, wash_id: UUID, *, void: bool = False, lock: bool = False
    ) -> tuple[CarwashWash, PermissionGrant]:
        wash = self.operations.repository.get(principal.workspace_id, wash_id, lock=lock)
        if wash is None:
            raise ResourceNotFoundError("El lavado no existe.", "washId")
        self.operations.grant(principal, wash.branch_id)
        auth = AuthorizationService(self.session)
        for code in (
            "carwash.wash.void" if void else "carwash.wash.complete",
            "sales.invoice.void" if void else "pos.sell",
        ):
            grant = auth.require_permission(principal, code)
            CarwashService(self.session).require_branch(grant, wash.branch_id)
        return wash, grant

    def context(self, principal: AuthPrincipal, wash_id: UUID) -> WashCheckoutContext:
        wash, _ = self.get(principal, wash_id)
        codes = AuthorizationService(self.session).permission_codes_for_branches(
            principal, {wash.branch_id}
        )[wash.branch_id]
        register = self.sales.current_register(wash.workspace_id, wash.branch_id)
        return WashCheckoutContext(
            wash=self.operations.response(wash),
            register_id=register.id if register else None,
            payment_methods=[
                PaymentMethodResponse(
                    **{name: getattr(method, name) for name in PaymentMethodResponse.model_fields}
                )
                for method in self.sales.payment_methods(wash.workspace_id)
            ],
            can_discount="pos.discount.override" in codes,
            can_upload_proof="pos.receivables.collect" in codes,
        )

    def snapshot(
        self, principal: AuthPrincipal, wash: CarwashWash, payload: PreviewWashRequest
    ) -> tuple[CheckoutSnapshot, list[CarwashWashLine]]:
        if wash.status != "washing":
            raise ConflictError("Solo se puede completar un lavado en curso.", "status")
        if wash.version != payload.version:
            raise ConflictError("El lavado cambió. Actualiza antes de continuar.", "version")
        lines = self.operations.repository.lines(wash.workspace_id, [wash.id])[wash.id]
        overrides = {row.wash_line_id: row.unit_price for row in payload.price_overrides}
        if not set(overrides) <= {line.id for line in lines}:
            raise InvalidOperationError(
                "El precio corresponde a una línea ajena al lavado.", "priceOverrides"
            )
        if payload.price_overrides or payload.discount_value:
            self.pos._require_discount_permission(principal, wash.workspace_id, wash.branch_id)
        priced = price_document(
            [
                PricingInput(
                    item_id=line.item_id,
                    quantity=Decimal(1),
                    unit_price=overrides.get(line.id, line.unit_price),
                    tax_rate=line.tax_rate,
                )
                for line in lines
            ],
            discount_type=payload.discount_type,
            discount_value=payload.discount_value or Decimal(0),
        )
        if max(priced.subtotal, priced.discount_amount, priced.tax_amount, priced.total) >= Decimal(
            "1000000000000"
        ):
            raise InvalidOperationError("El total excede el límite admitido por POS.", "total")
        sale_lines = []
        for line, price in zip(lines, priced.lines, strict=True):
            catalog = self.operations.catalog.catalog_service(
                wash.workspace_id, wash.branch_id, line.item_id, lock=False
            )
            if catalog is None:
                raise ResourceNotFoundError("El servicio de origen no existe.", "serviceId")
            sale_lines.append(
                SaleLine(
                    workspace_id=wash.workspace_id,
                    position=line.position + 1,
                    item_id=line.item_id,
                    item_name=line.name,
                    item_sku=catalog.item.sku,
                    item_type="service",
                    unit_symbol=catalog.unit.symbol,
                    quantity=Decimal(1),
                    list_price=line.unit_price,
                    unit_price=price.unit_price,
                    unit_cost_snapshot=catalog.profile.unit_cost if catalog.profile else None,
                    discount_amount=price.discount_amount,
                    tax_rate=line.tax_rate,
                    tax_amount=price.tax_amount,
                    line_total=price.line_total,
                )
            )
        return CheckoutSnapshot(wash.id, priced, tuple(sale_lines), wash.currency), lines

    def preview(
        self, principal: AuthPrincipal, wash_id: UUID, payload: PreviewWashRequest
    ) -> WashPricePreview:
        wash, _ = self.get(principal, wash_id)
        snapshot, _ = self.snapshot(principal, wash, payload)
        return WashPricePreview(
            **{name: getattr(snapshot.priced, name) for name in WashPricePreview.model_fields}
        )

    def complete(
        self, principal: AuthPrincipal, wash_id: UUID, payload: CompleteWashRequest, key: str
    ) -> WashResponse:
        wash, grant = self.get(principal, wash_id, lock=True)
        signature = fingerprint(payload)
        if wash.completion_key == key:
            if wash.completion_fingerprint != signature:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
            return self.operations.response(wash)
        snapshot, lines = self.snapshot(principal, wash, payload)
        before = self.operations.response(wash).model_dump(mode="json")
        # POS locks the register before inserting customer/payment foreign keys.
        # Follow that order before locking our references, otherwise a simultaneous
        # ordinary checkout can deadlock against their implicit KEY SHARE locks.
        register = self.pos._locked_open_register(grant, payload.register_id)
        if register.branch_id != wash.branch_id:
            raise InvalidOperationError("La caja abierta pertenece a otra sucursal.", "registerId")
        self.operations.references(
            wash,
            WashFields(
                customer_id=wash.customer_id,
                plate=wash.plate,
                washer_id=wash.washer_id,
                supervisor_id=wash.supervisor_id,
                service_ids=[line.service_config_id for line in lines],
                payment_method_id=payload.payment_method_id,
            ),
        )
        values = {
            "branch_id": wash.branch_id,
            "customer_id": wash.customer_id,
            "register_id": payload.register_id,
            "payment_method_id": payload.payment_method_id,
            "reference": payload.reference,
            "discount_type": payload.discount_type,
            "discount_value": payload.discount_value,
            "notes": f"Carwash · {wash.plate}",
        }
        try:
            result = self.pos.checkout_in_transaction(
                principal=principal,
                grant=grant,
                values=values,
                idempotency_key=self.key("complete", wash, key),
                snapshot=snapshot,
            )
            wash.sale_id = result.sale.sale.id
            wash.sale_number = result.sale.sale.sale_number
            wash.receivable_id = result.receivable_id
            wash.completed_at = datetime.now(UTC)
            wash.completion_key = key
            wash.completion_fingerprint = signature
            wash.status = "completed"
            wash.version += 1
            wash.final_subtotal = snapshot.priced.subtotal
            wash.final_discount_amount = snapshot.priced.discount_amount
            wash.final_tax_amount = snapshot.priced.tax_amount
            wash.final_total = snapshot.priced.total
            for line, price, sale_line in zip(
                lines, snapshot.priced.lines, snapshot.lines, strict=True
            ):
                for role in ("washer", "supervisor"):
                    rate = getattr(line, f"{role}_rate")
                    self.session.add(
                        CarwashCommission(
                            workspace_id=wash.workspace_id,
                            branch_id=wash.branch_id,
                            wash_id=wash.id,
                            wash_line_id=line.id,
                            sale_line_id=sale_line.id,
                            employee_id=getattr(wash, f"{role}_id"),
                            employee_name=getattr(wash, f"{role}_name"),
                            role=role,
                            currency=wash.currency,
                            base_amount=price.taxable_amount,
                            rate=rate,
                            amount=money(price.taxable_amount * rate / 100),
                            accrued_at=wash.completed_at,
                        )
                    )
            self.session.flush()
            self.operations.audit(principal, wash, "complete", before)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise ConflictError(
                "No se pudo completar el lavado. La clave puede estar en uso.", "Idempotency-Key"
            ) from exc
        return self.operations.response(wash)

    def void(
        self, principal: AuthPrincipal, wash_id: UUID, payload: VoidWashRequest, key: str
    ) -> WashResponse:
        wash, grant = self.get(principal, wash_id, void=True, lock=True)
        signature = fingerprint(payload)
        if wash.void_key == key:
            if wash.void_fingerprint != signature:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
            return self.operations.response(wash)
        if wash.status != "completed" or wash.sale_id is None:
            raise ConflictError("Solo se puede anular un lavado completado.", "status")
        if wash.version != payload.version:
            raise ConflictError("El lavado cambió. Actualiza antes de continuar.", "version")
        sale = self.sales.get_sale(
            wash.workspace_id, wash.sale_id, grant.allowed_branch_ids, lock=True
        )
        assert sale is not None
        try:
            self.pos.void_sale_in_transaction(
                principal=principal,
                grant=grant,
                sale_id=sale.id,
                expected_version=sale.version,
                reason=payload.reason,
                idempotency_key=self.key("void", wash, key),
            )
            wash.void_key = key
            wash.void_fingerprint = signature
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise ConflictError(
                "No se pudo anular el lavado. La clave puede estar en uso.", "Idempotency-Key"
            ) from exc
        return self.operations.response(wash)

    def billing(self, principal: AuthPrincipal, wash_id: UUID) -> WashBillingResponse:
        wash = self.operations.get(principal, wash_id)
        if wash.sale_id is None:
            raise ResourceNotFoundError("El lavado todavía no tiene factura.", "saleId")
        sale = self.sales.get_sale(wash.workspace_id, wash.sale_id, frozenset({wash.branch_id}))
        assert sale is not None
        debt = self.sales.receivable_for_sale(wash.workspace_id, sale.id)
        codes = AuthorizationService(self.session).permission_codes_for_branches(
            principal, {wash.branch_id}
        )[wash.branch_id]
        return WashBillingResponse(
            sale_id=sale.id,
            sale_number=sale.sale_number,
            status=sale.status,
            total=sale.total,
            subtotal=sale.subtotal,
            discount_amount=sale.discount_amount,
            tax_amount=sale.tax_amount,
            payment_method_name=sale.payment_method_name,
            receivable_id=debt.id if debt else None,
            receivable_status=debt.status if debt else None,
            paid_amount=debt.paid_amount
            if debt
            else (sale.total if sale.status == "completed" else Decimal(0)),
            pending_amount=money(debt.amount - debt.paid_amount)
            if debt and debt.status != "cancelled"
            else Decimal(0),
            can_upload_proof="pos.receivables.collect" in codes and sale.status == "completed",
        )

    @staticmethod
    def key(action: str, wash: CarwashWash, key: str) -> str:
        return "carwash-" + action + "-" + hashlib.sha256(f"{wash.id}:{key}".encode()).hexdigest()
