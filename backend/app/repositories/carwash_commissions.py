from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from math import ceil
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import CarwashCommission as Commission
from app.db.models import CarwashSettlement as Settlement
from app.db.models import CarwashSettlementDetail as Detail
from app.db.models import CarwashWash as Wash
from app.db.models import CarwashWashLine as Line
from app.schemas.carwash_commissions import (
    CommissionFilters,
    CommissionPage,
    CommissionResponse,
    CommissionSummary,
    SettlementResponse,
)


class CarwashCommissionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def entries(self, workspace_id: UUID, ids: list[UUID]) -> list[CommissionResponse]:
        rows = self.session.execute(
            select(Commission, Wash, Line, Detail.settlement_id)
            .join(Wash, Wash.id == Commission.wash_id)
            .join(Line, Line.id == Commission.wash_line_id)
            .outerjoin(
                Detail, (Detail.commission_id == Commission.id) & Detail.reversed_at.is_(None)
            )
            .where(Commission.workspace_id == workspace_id, Commission.id.in_(ids))
            .order_by(Commission.accrued_at.desc(), Commission.id)
        )
        return [
            CommissionResponse(
                **{
                    name: getattr(commission, name)
                    for name in CommissionResponse.model_fields
                    if name not in {"plate", "service", "sale_number", "settlement_id"}
                },
                plate=wash.plate,
                service=line.name,
                sale_number=wash.sale_number,
                settlement_id=settlement_id,
            )
            for commission, wash, line, settlement_id in rows
        ]

    def list_commissions(
        self, workspace_id: UUID, filters: CommissionFilters, timezone: str
    ) -> CommissionPage:
        predicates = [
            Commission.workspace_id == workspace_id,
            Commission.branch_id == filters.branch_id,
        ]
        for field in ("employee_id", "status", "role"):
            value = getattr(filters, field)
            if value:
                predicates.append(getattr(Commission, field) == value)
        if filters.date_from:
            predicates.append(
                Commission.accrued_at
                >= datetime.combine(filters.date_from, time.min, ZoneInfo(timezone))
            )
        if filters.date_to and filters.date_to < date.max:
            predicates.append(
                Commission.accrued_at
                < datetime.combine(
                    filters.date_to + timedelta(days=1), time.min, ZoneInfo(timezone)
                )
            )
        matched = select(Commission).where(*predicates).cte("matched_commissions")
        total = self.session.scalar(select(func.count()).select_from(matched)) or 0
        valid_washes = select(matched.c.wash_id).where(matched.c.status != "voided").distinct()
        washes, billed = self.session.execute(
            select(func.count(), func.coalesce(func.sum(Wash.final_total), 0)).where(
                Wash.workspace_id == workspace_id, Wash.id.in_(valid_washes)
            )
        ).one()
        accrued = self.session.scalar(
            select(func.coalesce(func.sum(matched.c.amount), 0)).where(matched.c.status != "voided")
        )
        pending = self.session.scalar(
            select(func.coalesce(func.sum(matched.c.amount), 0)).where(
                matched.c.status == "pending"
            )
        )
        ids = list(
            self.session.scalars(
                select(matched.c.id)
                .order_by(matched.c.accrued_at.desc(), matched.c.id)
                .offset((filters.page - 1) * filters.page_size)
                .limit(filters.page_size)
            )
        )
        return CommissionPage(
            items=self.entries(workspace_id, ids),
            summary=CommissionSummary(
                washes=washes,
                billed=billed,
                commissions=accrued or Decimal(0),
                pending=pending or Decimal(0),
            ),
            page=filters.page,
            page_size=filters.page_size,
            total_items=total,
            total_pages=ceil(total / filters.page_size),
        )

    def lock_entries(
        self, workspace_id: UUID, branch_id: UUID, ids: list[UUID]
    ) -> list[Commission]:
        # Same lock order as sale voiding: wash(es), then commissions, then register.
        wash_ids = select(Commission.wash_id).where(
            Commission.workspace_id == workspace_id,
            Commission.branch_id == branch_id,
            Commission.id.in_(ids),
        )
        list(
            self.session.scalars(
                select(Wash)
                .where(Wash.workspace_id == workspace_id, Wash.id.in_(wash_ids))
                .order_by(Wash.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        return list(
            self.session.scalars(
                select(Commission)
                .where(
                    Commission.workspace_id == workspace_id,
                    Commission.branch_id == branch_id,
                    Commission.id.in_(ids),
                )
                .order_by(Commission.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )

    def settlement(
        self, workspace_id: UUID, settlement_id: UUID, *, lock: bool = False
    ) -> Settlement | None:
        query = select(Settlement).where(
            Settlement.workspace_id == workspace_id, Settlement.id == settlement_id
        )
        if lock:
            query = query.with_for_update().execution_options(populate_existing=True)
        return self.session.scalar(query)

    def details(self, row: Settlement) -> list[Detail]:
        return list(
            self.session.scalars(
                select(Detail)
                .where(Detail.workspace_id == row.workspace_id, Detail.settlement_id == row.id)
                .order_by(Detail.id)
            )
        )

    def response(self, row: Settlement) -> SettlementResponse:
        return SettlementResponse(
            **{
                name: (
                    getattr(row, name).astimezone(UTC)
                    if isinstance(getattr(row, name), datetime)
                    else getattr(row, name)
                )
                for name in SettlementResponse.model_fields
                if name != "commissions"
            },
            commissions=self.entries(
                row.workspace_id, [detail.commission_id for detail in self.details(row)]
            ),
        )
