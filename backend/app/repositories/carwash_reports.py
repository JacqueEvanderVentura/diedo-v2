from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import String, cast, func, literal, select, union_all
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.orm import Session

from app.db.models import CarwashCommission as Commission
from app.db.models import CarwashWash as Wash
from app.db.models import CarwashWashLine as Line

ZERO = Decimal("0.00")


class CarwashReportRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def indicators(
        self,
        workspace_id: UUID,
        branch_id: UUID,
        start: datetime,
        end: datetime,
        *,
        commissions: bool,
    ) -> Any:
        scope = (Wash.workspace_id == workspace_id, Wash.branch_id == branch_id)
        today = (
            *scope,
            Wash.status == "completed",
            Wash.completed_at >= start,
            Wash.completed_at < end,
        )
        pending = (
            select(func.coalesce(func.sum(Commission.amount), ZERO))
            .join(Wash, Wash.id == Commission.wash_id)
            .where(
                *scope,
                Wash.status == "completed",
                Commission.workspace_id == workspace_id,
                Commission.branch_id == branch_id,
                Commission.status == "pending",
            )
            .scalar_subquery()
            if commissions
            else literal(None)
        )
        # One database statement provides a consistent snapshot while checkout/void commits.
        return self.session.execute(
            select(
                select(func.count())
                .select_from(Wash)
                .where(*scope, Wash.status.in_(["waiting", "washing"]))
                .scalar_subquery()
                .label("active_washes"),
                select(func.count())
                .select_from(Wash)
                .where(*today)
                .scalar_subquery()
                .label("completed_today"),
                select(func.coalesce(func.sum(Wash.final_total), ZERO))
                .where(*today)
                .scalar_subquery()
                .label("billed_today"),
                pending.label("pending_commissions"),
            )
        ).one()

    def report(
        self, workspace_id: UUID, branch_id: UUID, start: datetime, end: datetime, timezone: str
    ) -> list[Any]:
        washes = (
            select(Wash.id, Wash.completed_at, Wash.final_total)
            .where(
                Wash.workspace_id == workspace_id,
                Wash.branch_id == branch_id,
                Wash.status == "completed",
                Wash.completed_at >= start,
                Wash.completed_at < end,
            )
            .cte("report_washes")
        )
        commissions = (
            select(
                Commission.id,
                Commission.wash_id,
                Commission.employee_id,
                Commission.employee_name,
                Commission.role,
                Commission.amount,
                washes.c.completed_at,
            )
            .join(washes, washes.c.id == Commission.wash_id)
            .where(
                Commission.workspace_id == workspace_id,
                Commission.branch_id == branch_id,
                Commission.status.in_(["pending", "settled"]),
            )
            .cte("report_commissions")
        )
        lines = (
            select(Line.id, Line.item_id, Line.name, washes.c.completed_at)
            .join(washes, washes.c.id == Line.wash_id)
            .where(Line.workspace_id == workspace_id, Line.branch_id == branch_id)
            .cte("report_lines")
        )
        billed = func.coalesce(func.sum(washes.c.final_total), ZERO)
        washer = func.coalesce(
            func.sum(commissions.c.amount).filter(commissions.c.role == "washer"), ZERO
        )
        supervisor = func.coalesce(
            func.sum(commissions.c.amount).filter(commissions.c.role == "supervisor"), ZERO
        )
        day = func.to_char(func.timezone(timezone, washes.c.completed_at), "YYYY-MM-DD")
        commission_day = func.to_char(
            func.timezone(timezone, commissions.c.completed_at), "YYYY-MM-DD"
        )

        def row(
            kind: str,
            key: Any = "",
            name: Any = "",
            count: Any = 0,
            sales: Any = ZERO,
            washer_amount: Any = ZERO,
            supervisor_amount: Any = ZERO,
        ) -> Any:
            return select(
                literal(kind).label("kind"),
                cast(literal(key) if isinstance(key, str) else key, String).label("key"),
                (literal(name) if isinstance(name, str) else name).label("name"),
                (literal(count) if isinstance(count, int) else count).label("count"),
                (literal(sales) if isinstance(sales, Decimal) else sales).label("billed"),
                (
                    literal(washer_amount) if isinstance(washer_amount, Decimal) else washer_amount
                ).label("washer"),
                (
                    literal(supervisor_amount)
                    if isinstance(supervisor_amount, Decimal)
                    else supervisor_amount
                ).label("supervisor"),
            )

        # Aggregate independently: joining sale headers to role entries multiplies sales.
        totals = row("sales_total", count=func.count(), sales=billed).select_from(washes)
        commission_totals = row(
            "commission_total",
            count=func.count(func.distinct(commissions.c.employee_id)),
            washer_amount=washer,
            supervisor_amount=supervisor,
        ).select_from(commissions)
        service_total = row("service_total", count=func.count()).select_from(lines)
        sales_days = (
            row("sales_day", key=day, count=func.count(), sales=billed)
            .select_from(washes)
            .group_by(day)
        )
        commission_days = (
            row(
                "commission_day",
                key=commission_day,
                washer_amount=washer,
                supervisor_amount=supervisor,
            )
            .select_from(commissions)
            .group_by(commission_day)
        )
        service_name = func.array_agg(
            aggregate_order_by(lines.c.name, lines.c.completed_at.desc(), lines.c.id.desc())
        )[1]
        services = (
            row("service", key=lines.c.item_id, name=service_name, count=func.count())
            .select_from(lines)
            .group_by(lines.c.item_id)
            .order_by(func.count().desc(), lines.c.item_id)
            .limit(9)
        )
        employee_name = func.array_agg(
            aggregate_order_by(
                commissions.c.employee_name,
                commissions.c.completed_at.desc(),
                commissions.c.id.desc(),
            )
        )[1]
        employees = (
            row(
                "employee",
                key=commissions.c.employee_id,
                name=employee_name,
                count=func.count(func.distinct(commissions.c.wash_id)),
                washer_amount=washer,
                supervisor_amount=supervisor,
            )
            .select_from(commissions)
            .group_by(commissions.c.employee_id)
            .order_by((washer + supervisor).desc(), commissions.c.employee_id)
            .limit(10)
        )
        # The entire response uses one MVCC snapshot, without locking financial rows.
        return list(
            self.session.execute(
                union_all(
                    totals,
                    commission_totals,
                    service_total,
                    sales_days,
                    commission_days,
                    services,
                    employees,
                )
            )
        )
