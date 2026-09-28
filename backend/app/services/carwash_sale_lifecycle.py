from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CarwashCommission, CarwashWash
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService
from app.services.carwash import CarwashService
from app.services.carwash_operations import CarwashOperationsService
from app.services.errors import ConflictError


class CarwashSaleLifecycle:
    """Shared by both void entry points. Lock order: wash, sale, commissions, debt, cash."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def lock(self, principal: AuthPrincipal, sale_id: UUID) -> CarwashWash | None:
        wash = self.session.scalar(
            select(CarwashWash)
            .where(
                CarwashWash.workspace_id == principal.workspace_id,
                CarwashWash.sale_id == sale_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if wash is not None:
            operations = CarwashOperationsService(self.session)
            operations.grant(principal, wash.branch_id)
            grant = AuthorizationService(self.session).require_permission(
                principal, "carwash.wash.void"
            )
            CarwashService(self.session).require_branch(grant, wash.branch_id)
        return wash

    def commissions(self, wash: CarwashWash) -> list[CarwashCommission]:
        return list(
            self.session.scalars(
                select(CarwashCommission)
                .where(
                    CarwashCommission.workspace_id == wash.workspace_id,
                    CarwashCommission.branch_id == wash.branch_id,
                    CarwashCommission.wash_id == wash.id,
                )
                .order_by(CarwashCommission.id)
                .with_for_update()
            )
        )

    def require_reversible(self, wash: CarwashWash | None) -> None:
        if wash is not None and any(row.status == "settled" for row in self.commissions(wash)):
            raise ConflictError("Revierte primero la liquidación de las comisiones.", "washId")

    def void(
        self, principal: AuthPrincipal, wash: CarwashWash | None, reason: str, at: datetime
    ) -> None:
        if wash is None:
            return
        operations = CarwashOperationsService(self.session)
        before = operations.response(wash).model_dump(mode="json")
        for row in self.commissions(wash):
            row.status = "voided"
            row.voided_at = at
            row.void_reason = reason
            row.version += 1
        wash.status = "voided"
        wash.voided_at = at
        wash.void_reason = reason
        wash.version += 1
        operations.audit(principal, wash, "void", before)
