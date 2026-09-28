from calendar import monthrange
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.db.models import Branch, Workspace
from app.repositories.carwash_reports import ZERO, CarwashReportRepository
from app.schemas.carwash_reports import (
    CarwashDailyReport,
    CarwashEmployeeReport,
    CarwashIndicators,
    CarwashReportFilters,
    CarwashReports,
    CarwashReportTotals,
    CarwashServiceReport,
)
from app.services.auth import AuthPrincipal
from app.services.authorization import AuthorizationService
from app.services.carwash import CarwashService
from app.services.errors import InvalidOperationError
from app.services.pos_money import money


def now_utc() -> datetime:
    return datetime.now(UTC)


def date_bounds(start: date, end: date, timezone: str) -> tuple[datetime, datetime]:
    zone = ZoneInfo(timezone)
    return datetime.combine(start, time.min, zone), datetime.combine(
        end + timedelta(days=1), time.min, zone
    )


class CarwashReportService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repository = CarwashReportRepository(session)

    def scope(
        self, principal: AuthPrincipal, branch_id: UUID, *, reports: bool = False
    ) -> tuple[Branch, Workspace]:
        auth = AuthorizationService(self.session)
        service = CarwashService(self.session)
        for code in ("carwash.read", "carwash.reports.read") if reports else ("carwash.read",):
            service.require_branch(auth.require_permission(principal, code), branch_id)
        branch = service.repository.branch(principal.workspace_id, branch_id)
        workspace = self.session.get(Workspace, principal.workspace_id)
        assert branch is not None and workspace is not None
        return branch, workspace

    def indicators(self, principal: AuthPrincipal, branch_id: UUID) -> CarwashIndicators:
        branch, workspace = self.scope(principal, branch_id)
        now = now_utc()
        today = now.astimezone(ZoneInfo(branch.timezone)).date()
        codes = AuthorizationService(self.session).permission_codes_for_branches(
            principal, {branch_id}
        )[branch_id]
        values = self.repository.indicators(
            principal.workspace_id,
            branch_id,
            *date_bounds(today, today, branch.timezone),
            commissions=bool({"carwash.commissions.read", "carwash.reports.read"} & codes),
        )
        return CarwashIndicators(
            branch_id=branch_id,
            currency=workspace.default_currency,
            timezone=branch.timezone,
            today=today,
            generated_at=now,
            **dict(values._mapping),
        )

    def reports(self, principal: AuthPrincipal, filters: CarwashReportFilters) -> CarwashReports:
        branch, workspace = self.scope(principal, filters.branch_id, reports=True)
        now = now_utc()
        today = now.astimezone(ZoneInfo(branch.timezone)).date()
        start = filters.date_from or today.replace(day=1)
        end = filters.date_to or today.replace(day=monthrange(today.year, today.month)[1])
        days = (end - start).days + 1
        if not 1 <= days <= 366:
            raise InvalidOperationError("Selecciona un período válido de hasta 366 días.", "dateTo")
        rows = self.repository.report(
            principal.workspace_id,
            branch.id,
            *date_bounds(start, end, branch.timezone),
            branch.timezone,
        )
        totals = CarwashReportTotals(
            washes=0,
            billed=ZERO,
            washer_commissions=ZERO,
            supervisor_commissions=ZERO,
            commissions=ZERO,
            service_count=0,
            employee_count=0,
        )
        daily = {
            (start + timedelta(days=offset)).isoformat(): CarwashDailyReport(
                date=start + timedelta(days=offset),
                washes=0,
                billed=ZERO,
                washer_commissions=ZERO,
                supervisor_commissions=ZERO,
            )
            for offset in range(days)
        }
        services = []
        employees = []
        for row in rows:
            if row.kind == "sales_total":
                totals.washes, totals.billed = row.count, money(row.billed)
            elif row.kind == "commission_total":
                totals.employee_count = row.count
                totals.washer_commissions, totals.supervisor_commissions = (
                    money(row.washer),
                    money(row.supervisor),
                )
                totals.commissions = money(row.washer + row.supervisor)
            elif row.kind == "service_total":
                totals.service_count = row.count
            elif row.kind == "sales_day":
                daily[row.key].washes, daily[row.key].billed = row.count, money(row.billed)
            elif row.kind == "commission_day":
                daily[row.key].washer_commissions, daily[row.key].supervisor_commissions = (
                    money(row.washer),
                    money(row.supervisor),
                )
            elif row.kind == "service":
                services.append(
                    CarwashServiceReport(item_id=row.key, name=row.name, count=row.count)
                )
            elif row.kind == "employee":
                employees.append(
                    CarwashEmployeeReport(
                        employee_id=row.key,
                        name=row.name,
                        washes=row.count,
                        washer_commissions=money(row.washer),
                        supervisor_commissions=money(row.supervisor),
                        commissions=money(row.washer + row.supervisor),
                    )
                )
        # UNION ALL does not promise the order of the independently limited result sets.
        services.sort(key=lambda row: (-row.count, str(row.item_id)))
        employees.sort(key=lambda row: (-row.commissions, str(row.employee_id)))
        remaining = totals.service_count - sum(row.count for row in services)
        if remaining:
            services.append(
                CarwashServiceReport(item_id=None, name="Otros servicios", count=remaining)
            )
        return CarwashReports(
            branch_id=branch.id,
            currency=workspace.default_currency,
            timezone=branch.timezone,
            date_from=start,
            date_to=end,
            generated_at=now,
            totals=totals,
            daily=list(daily.values()),
            services=services,
            employees=employees,
        )
