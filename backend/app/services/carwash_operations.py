import hashlib
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import AuditEntry, CarwashWash, CarwashWashLine, Workspace
from app.repositories.carwash import CarwashRepository
from app.repositories.carwash_operations import CarwashOperationsRepository
from app.schemas.carwash_operations import (
    CancelWashRequest,
    CreateWashRequest,
    UpdateWashRequest,
    WashActionRequest,
    WashFields,
    WashLineResponse,
    WashResponse,
)
from app.schemas.common import ApiModel
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.carwash import CarwashService
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError
from app.services.pos_money import PricingInput, price_document


def wash_response(wash: CarwashWash, lines: list[CarwashWashLine]) -> WashResponse:
    fields = {name: getattr(wash, name) for name in WashResponse.model_fields if name != "lines"}
    for name, value in fields.items():
        if isinstance(value, datetime):
            fields[name] = value.astimezone(UTC)
    return WashResponse(
        **fields,
        lines=[
            WashLineResponse(
                **{name: getattr(line, name) for name in WashLineResponse.model_fields}
            )
            for line in lines
        ],
    )


def fingerprint(payload: ApiModel) -> str:
    return hashlib.sha256(payload.model_dump_json().encode()).hexdigest()


class CarwashOperationsService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = CarwashOperationsRepository(session)
        self.catalog = CarwashRepository(session)

    def grant(
        self, principal: AuthPrincipal, branch_id: UUID, *, manage: bool = False
    ) -> PermissionGrant:
        auth = AuthorizationService(self.session)
        read = auth.require_permission(principal, "carwash.read")
        CarwashService(self.session).require_branch(read, branch_id)
        if manage:
            write = auth.require_permission(principal, "carwash.wash.manage")
            CarwashService(self.session).require_branch(write, branch_id)
            return write
        return read

    def get(self, principal: AuthPrincipal, wash_id: UUID, *, manage: bool = False) -> CarwashWash:
        wash = self.repository.get(principal.workspace_id, wash_id, lock=manage)
        if wash is None:
            raise ResourceNotFoundError("El lavado no existe.", "washId")
        self.grant(principal, wash.branch_id, manage=manage)
        return wash

    def response(self, wash: CarwashWash) -> WashResponse:
        return wash_response(wash, self.repository.lines(wash.workspace_id, [wash.id])[wash.id])

    def replay(self, principal: AuthPrincipal, key: str, signature: str) -> CarwashWash | None:
        wash = self.repository.creation(principal.workspace_id, key)
        if wash:
            self.grant(principal, wash.branch_id, manage=True)
            if wash.creation_fingerprint != signature:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
        return wash

    def references(self, wash: CarwashWash, payload: WashFields) -> None:
        customer = self.repository.customer(wash.workspace_id, wash.branch_id, payload.customer_id)
        if customer is None:
            raise ResourceNotFoundError("El cliente no está activo en esta sucursal.", "customerId")
        if wash.customer_id != customer.id or not wash.customer_name:
            wash.customer_name = customer.display_name
        wash.customer_id = customer.id
        employees = {}
        for employee_id in sorted({payload.washer_id, payload.supervisor_id}, key=str):
            employee = self.repository.employee(wash.workspace_id, wash.branch_id, employee_id)
            if employee is None:
                raise ResourceNotFoundError(
                    "El empleado no está activo en esta sucursal.", "employeeId"
                )
            employees[employee_id] = employee
        for role, employee_id in (
            ("washer", payload.washer_id),
            ("supervisor", payload.supervisor_id),
        ):
            employee = employees[employee_id]
            if getattr(wash, f"{role}_id") != employee_id or not getattr(wash, f"{role}_name"):
                setattr(wash, f"{role}_name", f"{employee.first_name} {employee.last_name}")
            setattr(wash, f"{role}_id", employee_id)
        payment = None
        if payload.payment_method_id:
            payment = self.repository.payment(wash.workspace_id, payload.payment_method_id)
            if payment is None:
                raise ResourceNotFoundError(
                    "El método de pago previsto no está activo.", "paymentMethodId"
                )
        if wash.payment_method_id != payload.payment_method_id or not wash.payment_method_name:
            wash.payment_method_name = payment.name if payment else None
        wash.payment_method_id = payload.payment_method_id

    def apply(self, wash: CarwashWash, payload: WashFields, old: list[CarwashWashLine]) -> None:
        self.references(wash, payload)
        retained = {line.service_config_id: line for line in old}
        selected = {}
        for config_id in sorted(payload.service_ids, key=str):
            if config_id in retained:
                selected[config_id] = retained[config_id]
                continue
            record = self.catalog.get_service(wash.workspace_id, config_id, lock=True)
            if record is None or record.config.branch_id != wash.branch_id:
                raise ResourceNotFoundError(
                    "El servicio no está configurado en esta sucursal.", "serviceIds"
                )
            source = self.catalog.catalog_service(
                wash.workspace_id, wash.branch_id, record.config.item_id
            )
            assert source is not None
            self.session.refresh(source.item)
            self.session.refresh(source.assignment)
            if source.profile:
                self.session.refresh(source.profile)
            if not record.config.enabled or source.unavailable_reason:
                raise InvalidOperationError(
                    "El servicio no está habilitado o disponible para Carwash.", "serviceIds"
                )
            assert source.profile is not None and source.profile.sale_price is not None
            selected[config_id] = CarwashWashLine(
                id=uuid7(),
                workspace_id=wash.workspace_id,
                branch_id=wash.branch_id,
                wash_id=wash.id,
                service_config_id=config_id,
                item_id=source.item.id,
                name=source.item.name,
                unit_price=source.profile.sale_price,
                tax_rate=source.profile.tax_rate,
                washer_rate=record.config.washer_rate,
                supervisor_rate=record.config.supervisor_rate,
                config_version=record.config.version,
                catalog_version=source.item.version,
            )
        lines = [selected[config_id] for config_id in payload.service_ids]
        priced = price_document(
            [
                PricingInput(
                    item_id=line.item_id,
                    quantity=Decimal("1"),
                    unit_price=line.unit_price,
                    tax_rate=line.tax_rate,
                )
                for line in lines
            ]
        )
        wash.plate = payload.plate
        wash.vehicle_model = payload.vehicle_model
        wash.vehicle_color = payload.vehicle_color
        wash.subtotal, wash.tax_amount, wash.total = (
            priced.subtotal,
            priced.tax_amount,
            priced.total,
        )
        self.session.add(wash)
        self.session.flush([wash])
        for line in old:
            if line.service_config_id not in selected:
                self.session.delete(line)
        for position, (line, price) in enumerate(zip(lines, priced.lines, strict=True)):
            line.position = position
            line.tax_amount, line.total = price.tax_amount, price.line_total
            self.session.add(line)
        self.session.flush()

    def create(
        self, principal: AuthPrincipal, payload: CreateWashRequest, key: str
    ) -> WashResponse:
        self.grant(principal, payload.branch_id, manage=True)
        signature = fingerprint(payload)
        replay = self.replay(principal, key, signature)
        if replay:
            return self.response(replay)
        branch = self.catalog.branch(principal.workspace_id, payload.branch_id)
        workspace = self.session.get(Workspace, principal.workspace_id)
        assert branch is not None and workspace is not None
        wash = CarwashWash(
            id=uuid7(),
            workspace_id=principal.workspace_id,
            branch_id=payload.branch_id,
            currency=workspace.default_currency,
            timezone=branch.timezone,
            creation_key=key,
            creation_fingerprint=signature,
            status="waiting",
            version=1,
        )
        try:
            self.apply(wash, payload, [])
            self.audit(principal, wash, "create", None)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            replay = self.replay(principal, key, signature)
            if replay:
                return self.response(replay)
            raise ConflictError(
                "No se pudo registrar el lavado por un conflicto de datos."
            ) from exc
        return self.response(wash)

    @staticmethod
    def editable(wash: CarwashWash, version: int) -> None:
        if wash.version != version:
            raise ConflictError(
                "El lavado cambió. Recarga sus datos antes de continuar.", "version"
            )
        if wash.status not in {"waiting", "washing"}:
            raise ConflictError("Este lavado ya no permite cambios.", "status")

    def update(
        self, principal: AuthPrincipal, wash_id: UUID, payload: UpdateWashRequest
    ) -> WashResponse:
        wash = self.get(principal, wash_id, manage=True)
        self.editable(wash, payload.version)
        before = self.response(wash).model_dump(mode="json")
        wash.version += 1
        self.apply(wash, payload, self.repository.lines(wash.workspace_id, [wash.id])[wash.id])
        self.audit(principal, wash, "update", before)
        self.session.commit()
        return self.response(wash)

    def action(
        self,
        principal: AuthPrincipal,
        wash_id: UUID,
        payload: WashActionRequest,
        key: str,
        *,
        cancel: bool = False,
    ) -> WashResponse:
        wash = self.get(principal, wash_id, manage=True)
        prefix = "cancel" if cancel else "start"
        signature = fingerprint(payload)
        if getattr(wash, f"{prefix}_key") == key:
            if getattr(wash, f"{prefix}_fingerprint") != signature:
                raise ConflictError(
                    "Idempotency-Key ya fue usado con otro contenido.", "Idempotency-Key"
                )
            return self.response(wash)
        self.editable(wash, payload.version)
        before = self.response(wash).model_dump(mode="json")
        if cancel:
            assert isinstance(payload, CancelWashRequest)
            wash.status = "cancelled"
            wash.cancelled_at = datetime.now(UTC)
            wash.cancel_reason = payload.reason
        else:
            if wash.status != "waiting":
                raise ConflictError("Solo puedes iniciar un lavado en espera.", "status")
            self.references(
                wash,
                WashFields(
                    customer_id=wash.customer_id,
                    plate=wash.plate,
                    service_ids=[
                        line.service_config_id
                        for line in self.repository.lines(wash.workspace_id, [wash.id])[wash.id]
                    ],
                    washer_id=wash.washer_id,
                    supervisor_id=wash.supervisor_id,
                    payment_method_id=wash.payment_method_id,
                ),
            )
            wash.status = "washing"
            wash.started_at = datetime.now(UTC)
        setattr(wash, f"{prefix}_key", key)
        setattr(wash, f"{prefix}_fingerprint", signature)
        wash.version += 1
        try:
            self.session.flush()
            self.audit(principal, wash, prefix, before)
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise ConflictError("La clave de la acción ya está en uso.", "Idempotency-Key") from exc
        return self.response(wash)

    def audit(
        self, principal: AuthPrincipal, wash: CarwashWash, action: str, before: dict | None
    ) -> None:
        self.session.add(
            AuditEntry(
                workspace_id=principal.workspace_id,
                actor_platform_user_id=principal.platform_user_id,
                action=f"carwash.wash.{action}",
                target_type="carwash_wash",
                target_id=wash.id,
                outcome="success",
                request_id=get_request_id(),
                details={"before": before, "after": self.response(wash).model_dump(mode="json")},
            )
        )
