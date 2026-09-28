from datetime import UTC, datetime
from decimal import Decimal
from math import ceil
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import (
    CarwashCommission,
    CarwashSettlement,
    CarwashSettlementDetail,
    CashMovement,
    Workspace,
)
from app.repositories.carwash_commissions import CarwashCommissionRepository
from app.repositories.pos import PosRepository
from app.schemas.carwash_commissions import (
    CommissionContext,
    ReverseSettlementRequest,
    SettleCommissionsRequest,
    SettlementPage,
    SettlementResponse,
)
from app.schemas.common import SimpleOptionResponse
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.carwash import CarwashService
from app.services.carwash_operations import fingerprint
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError
from app.services.pos import PosService
from app.services.pos_money import money


class CarwashCommissionService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = CarwashCommissionRepository(session)
        self.pos = PosService(session)
        self.cash = PosRepository(session)

    def grant(
        self, principal: AuthPrincipal, branch_id: UUID, action: str | None = None
    ) -> PermissionGrant:
        codes = ["carwash.read", "carwash.commissions.read"]
        if action:
            codes += [f"carwash.commissions.{action}", "pos.cash.manage"]
        auth = AuthorizationService(self.session)
        for code in codes:
            grant = auth.require_permission(principal, code)
            CarwashService(self.session).require_branch(grant, branch_id)
        return grant

    def context(self, principal: AuthPrincipal, branch_id: UUID) -> CommissionContext:
        self.grant(principal, branch_id)
        codes = AuthorizationService(self.session).permission_codes_for_branches(
            principal, {branch_id}
        )[branch_id]
        branch = CarwashService(self.session).repository.branch(principal.workspace_id, branch_id)
        workspace = self.session.get(Workspace, principal.workspace_id)
        assert branch is not None and workspace is not None
        register = self.cash.current_register(principal.workspace_id, branch_id)
        # Include former employees with earned commissions, even if no longer active.
        employees = self.session.execute(
            select(CarwashCommission.employee_id, func.max(CarwashCommission.employee_name))
            .where(
                CarwashCommission.workspace_id == principal.workspace_id,
                CarwashCommission.branch_id == branch_id,
            )
            .group_by(CarwashCommission.employee_id)
            .order_by(func.max(CarwashCommission.employee_name))
        )
        return CommissionContext(
            can_settle={"carwash.commissions.settle", "pos.cash.manage"} <= codes,
            can_reverse={"carwash.commissions.reverse", "pos.cash.manage"} <= codes,
            register_id=register.id if register else None,
            currency=workspace.default_currency,
            timezone=branch.timezone,
            employees=[SimpleOptionResponse(id=id, name=name) for id, name in employees],
            payment_methods=[
                SimpleOptionResponse(id=m.id, name=m.name)
                for m in self.cash.payment_methods(principal.workspace_id)
                if m.channel == "cash"
                and m.affects_cash_drawer
                and m.settlement_policy == "immediate"
            ],
        )

    def replay(
        self, principal: AuthPrincipal, key: str, signature: str, *, reverse: bool = False
    ) -> CarwashSettlement | None:
        column = CarwashSettlement.reversal_key if reverse else CarwashSettlement.idempotency_key
        row = self.session.scalar(
            select(CarwashSettlement).where(
                CarwashSettlement.workspace_id == principal.workspace_id, column == key
            )
        )
        if row:
            self.grant(principal, row.branch_id, "reverse" if reverse else "settle")
            self.pos._require_same_fingerprint(
                row.reversal_fingerprint if reverse else row.request_fingerprint,
                signature,
                "Idempotency-Key",
            )
        return row

    def audit(self, principal: AuthPrincipal, row: CarwashSettlement, action: str) -> None:
        self.cash.add_audit(
            workspace_id=row.workspace_id,
            actor_platform_user_id=principal.platform_user_id,
            action=f"carwash.commissions.{action}",
            target_type="carwash_settlement",
            target_id=row.id,
            request_id=get_request_id(),
            details=self.repository.response(row).model_dump(mode="json"),
        )

    def settle(
        self, principal: AuthPrincipal, payload: SettleCommissionsRequest, key: str
    ) -> SettlementResponse:
        grant = self.grant(principal, payload.branch_id, "settle")
        signature = fingerprint(payload)
        existing = self.replay(principal, key, signature)
        if existing:
            return self.repository.response(existing)
        try:
            entries = self.repository.lock_entries(
                principal.workspace_id, payload.branch_id, [row.id for row in payload.commissions]
            )
            existing = self.replay(principal, key, signature)
            if existing:
                return self.repository.response(existing)
            if len(entries) != len(payload.commissions):
                raise ResourceNotFoundError("Una comisión no existe en la sucursal.", "commissions")
            versions = {row.id: row.version for row in payload.commissions}
            for entry in entries:
                if entry.employee_id != payload.employee_id:
                    raise InvalidOperationError(
                        "Selecciona comisiones de un solo empleado.", "employeeId"
                    )
                if entry.status != "pending" or entry.version != versions[entry.id]:
                    raise ConflictError(
                        "Las comisiones cambiaron. Actualiza la selección.", "commissions"
                    )
            register = self.pos._locked_open_register(grant, payload.register_id)
            if register.branch_id != payload.branch_id or any(
                row.currency != register.currency_code for row in entries
            ):
                raise InvalidOperationError(
                    "La caja debe pertenecer a la misma sucursal y moneda.", "registerId"
                )
            method = self.pos._require_payment_method(
                principal.workspace_id, payload.payment_method_id
            )
            if (
                method.channel != "cash"
                or not method.affects_cash_drawer
                or method.settlement_policy != "immediate"
            ):
                raise InvalidOperationError(
                    "La liquidación requiere un método de efectivo inmediato.", "paymentMethodId"
                )
            amount = money(sum((row.amount for row in entries), Decimal(0)))
            if amount >= Decimal("1000000000000"):
                raise InvalidOperationError("El total excede el límite de Caja.", "commissions")
            movement_id = None
            if amount:
                movement = self.pos.create_manual_movement_in_transaction(
                    principal=principal,
                    grant=grant,
                    register_id=register.id,
                    values={
                        "type": "expense",
                        "amount": amount,
                        "payment_method_id": method.id,
                        "concept": f"Comisiones Carwash: {entries[0].employee_name}",
                    },
                    idempotency_key=self.pos._derived_key("carwash-settlement", key),
                )
                movement_id = movement.movement.id
            row = CarwashSettlement(
                workspace_id=principal.workspace_id,
                branch_id=payload.branch_id,
                employee_id=payload.employee_id,
                employee_name=entries[0].employee_name,
                register_id=register.id,
                currency=register.currency_code,
                amount=amount,
                movement_id=movement_id,
                idempotency_key=key,
                request_fingerprint=signature,
            )
            self.session.add(row)
            self.session.flush()
            for entry in entries:
                self.session.add(
                    CarwashSettlementDetail(
                        workspace_id=row.workspace_id,
                        branch_id=row.branch_id,
                        settlement_id=row.id,
                        commission_id=entry.id,
                        amount=entry.amount,
                    )
                )
                entry.status = "settled"
                entry.version += 1
            self.session.flush()
            self.audit(principal, row, "settle")
            self.session.commit()
            return self.repository.response(row)
        except IntegrityError as exc:
            self.session.rollback()
            existing = self.replay(principal, key, signature)
            if existing:
                return self.repository.response(existing)
            raise ConflictError(
                "La selección ya fue liquidada o cambió durante la operación."
            ) from exc

    def get(self, principal: AuthPrincipal, id: UUID) -> CarwashSettlement:
        row = self.repository.settlement(principal.workspace_id, id)
        if row is None:
            raise ResourceNotFoundError("La liquidación no existe.", "settlementId")
        self.grant(principal, row.branch_id)
        return row

    def reverse(
        self, principal: AuthPrincipal, id: UUID, payload: ReverseSettlementRequest, key: str
    ) -> SettlementResponse:
        row = self.get(principal, id)
        grant = self.grant(principal, row.branch_id, "reverse")
        signature = self.pos._fingerprint({"settlement_id": id, **payload.model_dump()})
        existing = self.replay(principal, key, signature, reverse=True)
        if existing:
            return self.repository.response(existing)
        try:
            details = self.repository.details(row)
            entries = self.repository.lock_entries(
                row.workspace_id, row.branch_id, [detail.commission_id for detail in details]
            )
            locked = self.repository.settlement(row.workspace_id, id, lock=True)
            assert locked is not None
            row = locked
            existing = self.replay(principal, key, signature, reverse=True)
            if existing:
                return self.repository.response(existing)
            if row.status != "posted" or row.version != payload.version:
                raise ConflictError("La liquidación cambió o ya fue revertida.", "version")
            if any(entry.status != "settled" for entry in entries):
                raise ConflictError("El estado de las comisiones es inconsistente.")
            register = self.pos._locked_reversal_register(
                grant, original_register_id=row.register_id, branch_id=row.branch_id
            )
            if register.currency_code != row.currency:
                raise ConflictError("La moneda de la caja no coincide con la liquidación.")
            if row.movement_id:
                original = self.session.get(CashMovement, row.movement_id)
                assert original is not None
                reversal = CashMovement(
                    workspace_id=row.workspace_id,
                    branch_id=row.branch_id,
                    cash_register_id=register.id,
                    movement_type="reversal",
                    currency_code=row.currency,
                    amount=row.amount,
                    cash_delta=row.amount,
                    reversal_of_movement_id=original.id,
                    concept=f"Reverso comisiones Carwash: {row.employee_name}",
                    notes=payload.reason,
                    created_by_membership_id=principal.membership_id,
                    created_by_platform_user_id=principal.platform_user_id,
                    created_by_name=principal.display_name,
                    idempotency_key=self.pos._derived_key("carwash-settlement-reversal", key),
                    request_fingerprint=signature,
                    **{
                        field: getattr(original, field)
                        for field in (
                            "payment_method_id",
                            "payment_method_code",
                            "payment_method_name",
                            "payment_channel",
                            "settlement_policy",
                            "affects_cash_drawer",
                            "requires_evidence",
                        )
                    },
                )
                self.cash.add_movement(reversal)
                self.pos._reverse_cash_effect(register, original)
                row.reversal_movement_id = reversal.id
            now = datetime.now(UTC)
            row.status = "reversed"
            row.reversed_at = now
            row.reversal_reason = payload.reason
            row.reversal_key = key
            row.reversal_fingerprint = signature
            row.version += 1
            for detail in details:
                detail.reversed_at = now
            for entry in entries:
                entry.status = "pending"
                entry.version += 1
            self.session.flush()
            self.audit(principal, row, "reverse")
            self.session.commit()
            return self.repository.response(row)
        except IntegrityError as exc:
            self.session.rollback()
            existing = self.replay(principal, key, signature, reverse=True)
            if existing:
                return self.repository.response(existing)
            raise ConflictError("La liquidación cambió durante el reverso.") from exc

    def list_settlements(
        self,
        principal: AuthPrincipal,
        branch_id: UUID,
        employee_id: UUID | None,
        page: int,
        page_size: int,
    ) -> SettlementPage:
        self.grant(principal, branch_id)
        query = select(CarwashSettlement).where(
            CarwashSettlement.workspace_id == principal.workspace_id,
            CarwashSettlement.branch_id == branch_id,
        )
        if employee_id:
            query = query.where(CarwashSettlement.employee_id == employee_id)
        total = self.session.scalar(select(func.count()).select_from(query.subquery())) or 0
        rows = self.session.scalars(
            query.order_by(CarwashSettlement.created_at.desc(), CarwashSettlement.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return SettlementPage(
            items=[self.repository.response(row) for row in rows],
            page=page,
            page_size=page_size,
            total_items=total,
            total_pages=ceil(total / page_size),
        )
