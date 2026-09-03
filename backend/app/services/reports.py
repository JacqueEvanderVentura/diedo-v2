from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from math import ceil
from typing import Any, TypeVar
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.db.models import Branch
from app.repositories.reports import (
    AppointmentReportRecord,
    FinancialTransactionRecord,
    MembershipPurchaseRecord,
    ReportsRepository,
)
from app.schemas.administration import BranchDetails
from app.schemas.reports import (
    AgendaReportItemResponse,
    AgendaReportPeriod,
    AgendaReportSummaryResponse,
    AgendaWeeklyPoint,
    CountPoint,
    DistributionPoint,
    DividendReportItemResponse,
    DividendSummaryResponse,
    ExpenseCategoryResponse,
    GeneralReportSummaryResponse,
    GeneralSeriesPoint,
    GeneralTransactionResponse,
    InventoryCategoryOption,
    InventoryMarginPoint,
    InventoryReportItemResponse,
    InventoryReportSummaryResponse,
    InventoryStockPoint,
    InventoryValueCategory,
    MembershipGrowthPoint,
    MembershipReportItemResponse,
    MembershipStatus,
    MembershipSummaryResponse,
    PaginatedAgendaReportResponse,
    PaginatedDividendReportResponse,
    PaginatedExpenseCategoriesResponse,
    PaginatedGeneralTransactionsResponse,
    PaginatedInventoryReportResponse,
    PaginatedMembershipReportResponse,
    PersonalEmployeeResponse,
    PersonalIncidentMetricsResponse,
    PersonalReportResponse,
    PersonalSupplyUsageResponse,
    PersonalTotalsResponse,
    PersonalUserResponse,
    ReportMoneyTotals,
    ReportPeriod,
)
from app.services.authorization import PermissionGrant
from app.services.errors import ResourceNotFoundError

_T = TypeVar("_T")
_MONTHS = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")
_ATTENDED_STATUSES = {"completed", "attended"}
_EMPLOYEE_INCIDENT_NAMES = {
    "ausencia": "Ausencias",
    "vacaciones": "Vacaciones",
    "amonestacion": "Amonestaciones",
    "tardanza": "Tardanzas",
    "licencia_medica": "Licencias médicas",
    "otro": "Otros",
}
_MONEY = Decimal("0.01")
_PCT = Decimal("0.01")
_QUANTITY = Decimal("0.001")


@dataclass(frozen=True)
class ReportContext:
    period: ReportPeriod
    branch_id: UUID | None
    timezone: str
    local_today: date
    starts_on: date
    ends_on: date
    starts_at: datetime
    ends_at: datetime
    currency_code: str
    generated_at: datetime


@dataclass(frozen=True)
class _InventoryRow:
    response: InventoryReportItemResponse
    low_stock: bool


class ReportsService:
    def __init__(self, session: Session) -> None:
        self._repository = ReportsRepository(session)

    def general_summary(
        self,
        grant: PermissionGrant,
        *,
        period: ReportPeriod,
        branch_id: UUID | None,
        now: datetime | None = None,
    ) -> GeneralReportSummaryResponse:
        context = self._context(grant, period=period, branch_id=branch_id, now=now)
        rows = self._financial_rows(grant, context)
        income = sum(
            (row.amount for row in rows if row.transaction_type == "ingreso"), Decimal("0")
        )
        expenses = sum(
            (row.amount for row in rows if row.transaction_type == "gasto"), Decimal("0")
        )
        return GeneralReportSummaryResponse(
            period=period,
            branch_id=branch_id,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
            currency_code=context.currency_code,
            totals=ReportMoneyTotals(
                income=self._money(income),
                expenses=self._money(expenses),
                balance=self._money(income - expenses),
            ),
            series=self._financial_series(rows, context),
            income_distribution=self._income_distribution(rows),
            generated_at=context.generated_at,
        )

    def general_transactions(
        self,
        grant: PermissionGrant,
        *,
        period: ReportPeriod,
        branch_id: UUID | None,
        transaction_type: str | None,
        search: str | None,
        page: int,
        page_size: int,
        sort_key: str,
        sort_direction: str,
        now: datetime | None = None,
    ) -> PaginatedGeneralTransactionsResponse:
        context = self._context(grant, period=period, branch_id=branch_id, now=now)
        query = (search or "").casefold().strip()
        rows = [
            row
            for row in self._financial_rows(grant, context)
            if (not transaction_type or row.transaction_type == transaction_type)
            and (not query or query in f"{row.category} {row.branch_name}".casefold())
        ]
        accessors: dict[str, Callable[[FinancialTransactionRecord], Any]] = {
            "date": lambda row: row.occurred_at,
            "category": lambda row: row.category.casefold(),
            "branchId": lambda row: row.branch_name.casefold(),
            "type": lambda row: row.transaction_type,
            "amount": lambda row: row.amount,
        }
        rows = self._sort(rows, accessors[sort_key], sort_direction)
        selected, safe_page, total_pages = self._page(rows, page, page_size)
        return PaginatedGeneralTransactionsResponse(
            items=[
                GeneralTransactionResponse(
                    id=row.id,
                    date=row.occurred_at,
                    type=row.transaction_type,  # type: ignore[arg-type]
                    category=row.category,
                    branch_id=row.branch_id,
                    branch_name=row.branch_name,
                    amount=self._money(row.amount),
                )
                for row in selected
            ],
            page=safe_page,
            page_size=page_size,
            total_items=len(rows),
            total_pages=total_pages,
        )

    def expense_categories(
        self,
        grant: PermissionGrant,
        *,
        period: ReportPeriod,
        branch_id: UUID | None,
        search: str | None,
        page: int,
        page_size: int,
        sort_key: str,
        sort_direction: str,
        now: datetime | None = None,
    ) -> PaginatedExpenseCategoriesResponse:
        context = self._context(grant, period=period, branch_id=branch_id, now=now)
        amounts: dict[str, Decimal] = defaultdict(Decimal)
        for row in self._financial_rows(grant, context):
            if row.transaction_type == "gasto":
                amounts[row.category] += row.amount
        total = sum(amounts.values(), Decimal("0"))
        query = (search or "").casefold().strip()
        rows = [
            ExpenseCategoryResponse(
                name=name,
                amount=self._money(amount),
                pct=self._percent(amount, total),
            )
            for name, amount in amounts.items()
            if not query or query in name.casefold()
        ]
        accessors: dict[str, Callable[[ExpenseCategoryResponse], Any]] = {
            "name": lambda row: row.name.casefold(),
            "amount": lambda row: row.amount,
            "pct": lambda row: row.pct,
        }
        rows = self._sort(rows, accessors[sort_key], sort_direction)
        selected, safe_page, total_pages = self._page(rows, page, page_size)
        return PaginatedExpenseCategoriesResponse(
            items=selected,
            page=safe_page,
            page_size=page_size,
            total_items=len(rows),
            total_pages=total_pages,
        )

    def memberships(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        status: MembershipStatus | None,
        plan: str | None,
        search: str | None,
        page: int,
        page_size: int,
        sort_key: str,
        sort_direction: str,
        now: datetime | None = None,
    ) -> PaginatedMembershipReportResponse:
        context = self._context(grant, period="month", branch_id=branch_id, now=now)
        purchases = self._repository.membership_purchases(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
        )
        all_rows = self._membership_rows(purchases, context)
        query = (search or "").casefold().strip()
        rows = [
            row
            for row in all_rows
            if (not status or row.status == status)
            and (not plan or row.plan == plan)
            and (not query or query in f"{row.client_name} {row.plan}".casefold())
        ]
        accessors: dict[str, Callable[[MembershipReportItemResponse], Any]] = {
            "clientName": lambda row: row.client_name.casefold(),
            "plan": lambda row: row.plan.casefold(),
            "branchId": lambda row: row.branch_name.casefold(),
            "amount": lambda row: row.amount,
            "status": lambda row: row.status,
            "lastPayment": lambda row: row.last_payment_at,
        }
        rows = self._sort(rows, accessors[sort_key], sort_direction)
        selected, safe_page, total_pages = self._page(rows, page, page_size)
        return PaginatedMembershipReportResponse(
            items=selected,
            page=safe_page,
            page_size=page_size,
            total_items=len(rows),
            total_pages=total_pages,
            summary=self._membership_summary(all_rows, purchases, context),
        )

    def agenda_summary(
        self,
        grant: PermissionGrant,
        *,
        period: AgendaReportPeriod,
        branch_id: UUID | None,
        status: str | None,
        search: str | None,
        now: datetime | None = None,
    ) -> AgendaReportSummaryResponse:
        context = self._agenda_context(grant, period=period, branch_id=branch_id, now=now)
        records = self._appointment_rows(
            grant,
            context,
            status=status,
            search=search,
            all_dates=period == "all",
        )
        counts: dict[str, int] = defaultdict(int)
        for record in records:
            counts[record.appointment.status] += 1
        attended = sum(counts[item] for item in _ATTENDED_STATUSES)
        no_show = counts["no_show"]
        denominator = attended + no_show
        by_employee: dict[str, int] = defaultdict(int)
        for record in records:
            if record.employee_name and record.appointment.status in _ATTENDED_STATUSES:
                by_employee[record.employee_name] += 1
        staff = sum(record.appointment.source != "self" for record in records)
        self_booked = len(records) - staff
        status_names = {
            "completed": "Cumplidas",
            "attended": "Asistió",
            "confirmed": "Confirmadas",
            "pending": "Pendientes",
            "no_show": "No-show",
            "cancelled": "Canceladas",
            "delayed": "Retrasadas",
            "rescheduled": "Reprogramadas",
        }
        return AgendaReportSummaryResponse(
            period=period,
            branch_id=branch_id,
            total_appointments=len(records),
            attended_count=attended,
            no_show_count=no_show,
            cancelled_count=counts["cancelled"],
            self_booking_count=self_booked,
            attendance_rate=self._percent(Decimal(attended), Decimal(denominator)),
            status_distribution=[
                CountPoint(id=key, name=status_names[key], value=counts[key])
                for key in status_names
                if counts[key]
            ],
            weekly=self._agenda_weekly(grant, branch_id, context.generated_at),
            by_employee=[
                CountPoint(name=name, value=value)
                for name, value in sorted(
                    by_employee.items(), key=lambda item: (-item[1], item[0].casefold())
                )[:8]
            ],
            by_source=[
                CountPoint(id="staff", name="Equipo", value=staff),
                CountPoint(id="self", name="Auto-agendado", value=self_booked),
            ],
        )

    def agenda_items(
        self,
        grant: PermissionGrant,
        *,
        period: AgendaReportPeriod,
        branch_id: UUID | None,
        status: str | None,
        search: str | None,
        page: int,
        page_size: int,
        sort_key: str,
        sort_direction: str,
        now: datetime | None = None,
    ) -> PaginatedAgendaReportResponse:
        context = self._agenda_context(grant, period=period, branch_id=branch_id, now=now)
        rows = self._appointment_rows(
            grant,
            context,
            status=status,
            search=search,
            all_dates=period == "all",
        )
        accessors: dict[str, Callable[[AppointmentReportRecord], Any]] = {
            "date": lambda row: row.appointment.starts_at,
            "time": lambda row: row.appointment.scheduled_time,
            "customerName": lambda row: row.appointment.customer_name.casefold(),
            "employeeName": lambda row: (row.employee_name or "").casefold(),
            "serviceName": lambda row: row.appointment.service_name.casefold(),
            "branchId": lambda row: row.branch_name.casefold(),
            "status": lambda row: row.appointment.status,
            "createdBy": lambda row: row.created_by_name.casefold(),
            "updatedBy": lambda row: row.updated_by_name.casefold(),
        }
        rows = self._sort(rows, accessors[sort_key], sort_direction)
        selected, safe_page, total_pages = self._page(rows, page, page_size)
        return PaginatedAgendaReportResponse(
            items=[self._agenda_item(row) for row in selected],
            page=safe_page,
            page_size=page_size,
            total_items=len(rows),
            total_pages=total_pages,
        )

    def inventory_summary(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        category_id: UUID | None,
        search: str | None,
    ) -> InventoryReportSummaryResponse:
        category_rows = self._inventory_rows(
            grant, branch_id=branch_id, category_id=None, search=None
        )
        rows = self._inventory_rows(
            grant, branch_id=branch_id, category_id=category_id, search=search
        )
        categories = {
            (row.response.category_id, row.response.category_name) for row in category_rows
        }
        value_by_category: dict[tuple[UUID, str], Decimal] = defaultdict(Decimal)
        for row in rows:
            value_by_category[(row.response.category_id, row.response.category_name)] += (
                row.response.stock_value_cost
            )
        return InventoryReportSummaryResponse(
            branch_id=branch_id,
            products_with_stock=sum(row.response.stock > 0 for row in rows),
            value_at_cost=self._money(
                sum((row.response.stock_value_cost for row in rows), Decimal("0"))
            ),
            value_at_sale=self._money(
                sum((row.response.stock_value_sale for row in rows), Decimal("0"))
            ),
            low_stock_count=sum(row.low_stock for row in rows),
            stock=[
                InventoryStockPoint(
                    label=self._short_label(row.response.name), value=row.response.stock
                )
                for row in sorted(rows, key=lambda item: item.response.stock, reverse=True)
                if row.response.stock > 0
            ][:8],
            value_by_category=[
                InventoryValueCategory(id=key[0], name=key[1], value=self._money(value))
                for key, value in sorted(
                    value_by_category.items(), key=lambda item: item[1], reverse=True
                )
                if value > 0
            ],
            margins=[
                InventoryMarginPoint(
                    label=self._short_label(row.response.name),
                    margin=row.response.margin_pct,
                )
                for row in sorted(rows, key=lambda item: item.response.margin_pct, reverse=True)
                if row.response.price > 0
            ][:8],
            categories=[
                InventoryCategoryOption(id=category[0], name=category[1])
                for category in sorted(categories, key=lambda item: item[1].casefold())
            ],
        )

    def inventory_items(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        category_id: UUID | None,
        search: str | None,
        page: int,
        page_size: int,
        sort_key: str,
        sort_direction: str,
    ) -> PaginatedInventoryReportResponse:
        rows = [
            row.response
            for row in self._inventory_rows(
                grant, branch_id=branch_id, category_id=category_id, search=search
            )
        ]
        accessors: dict[str, Callable[[InventoryReportItemResponse], Any]] = {
            "name": lambda row: row.name.casefold(),
            "category": lambda row: row.category_name.casefold(),
            "cost": lambda row: row.cost,
            "price": lambda row: row.price,
            "stock": lambda row: row.stock,
            "stockValueCost": lambda row: row.stock_value_cost,
            "stockValueSale": lambda row: row.stock_value_sale,
            "sold": lambda row: row.sold,
            "revenue": lambda row: row.revenue,
            "profit": lambda row: row.profit,
            "marginPct": lambda row: row.margin_pct,
        }
        rows = self._sort(rows, accessors[sort_key], sort_direction)
        selected, safe_page, total_pages = self._page(rows, page, page_size)
        return PaginatedInventoryReportResponse(
            items=selected,
            page=safe_page,
            page_size=page_size,
            total_items=len(rows),
            total_pages=total_pages,
        )

    def dividends(
        self,
        grant: PermissionGrant,
        *,
        period: ReportPeriod,
        branch_id: UUID | None,
        search: str | None,
        page: int,
        page_size: int,
        sort_key: str,
        sort_direction: str,
        now: datetime | None = None,
    ) -> PaginatedDividendReportResponse:
        context = self._context(grant, period=period, branch_id=branch_id, now=now)
        transactions = self._financial_rows(grant, context)
        profit_by_branch: dict[UUID, Decimal] = defaultdict(Decimal)
        for row in transactions:
            sign = Decimal("1") if row.transaction_type == "ingreso" else Decimal("-1")
            profit_by_branch[row.branch_id] += sign * row.amount
        for payment in self._repository.fixed_expense_payments(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_on=context.starts_on,
            ends_on=context.ends_on,
        ):
            profit_by_branch[payment.branch_id] -= payment.amount

        query = (search or "").casefold().strip()
        rows: list[DividendReportItemResponse] = []
        total_profit = Decimal("0")
        for branch in self._repository.branches(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
        ):
            profit = max(Decimal("0"), profit_by_branch[branch.id])
            details = BranchDetails.model_validate(branch.configuration or {})
            total_profit += profit
            for index, partner in enumerate(details.partners):
                if query and query not in f"{partner.name} {branch.name}".casefold():
                    continue
                rows.append(
                    DividendReportItemResponse(
                        id=f"{branch.id}:{index}",
                        partner_name=partner.name,
                        document=partner.document,
                        branch_id=branch.id,
                        branch_name=branch.name,
                        share=partner.share,
                        dividend=self._money(profit * partner.share / Decimal("100")),
                        total_branch_profit=self._money(profit),
                    )
                )
        accessors: dict[str, Callable[[DividendReportItemResponse], Any]] = {
            "partnerName": lambda row: row.partner_name.casefold(),
            "branchName": lambda row: row.branch_name.casefold(),
            "share": lambda row: row.share,
            "dividend": lambda row: row.dividend,
        }
        rows = self._sort(rows, accessors[sort_key], sort_direction)
        distributed = sum((row.dividend for row in rows), Decimal("0"))
        selected, safe_page, total_pages = self._page(rows, page, page_size)
        return PaginatedDividendReportResponse(
            items=selected,
            page=safe_page,
            page_size=page_size,
            total_items=len(rows),
            total_pages=total_pages,
            summary=DividendSummaryResponse(
                partners=len(rows),
                branches=len({row.branch_id for row in rows}),
                total_dividends=self._money(distributed),
                undistributed_profit=self._money(max(Decimal("0"), total_profit - distributed)),
            ),
        )

    def personal(
        self,
        grant: PermissionGrant,
        *,
        period: ReportPeriod,
        branch_id: UUID | None,
        search: str | None,
        now: datetime | None = None,
    ) -> PersonalReportResponse:
        context = self._context(grant, period=period, branch_id=branch_id, now=now)
        sales = self._repository.sales(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
        )
        appointments = self._repository.appointments(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_on=context.starts_on,
            ends_on=context.ends_on,
        )
        query = (search or "").casefold().strip()
        roles_by_user: dict[UUID, set[str]] = defaultdict(set)
        users: dict[UUID, tuple[UUID, str]] = {}
        for user_record in self._repository.users_with_roles(grant.workspace_id):
            users[user_record.user.id] = (
                user_record.membership.id,
                user_record.user.display_name,
            )
            roles_by_user[user_record.user.id].add(user_record.role_name)
        sales_by_user: dict[UUID, list[Any]] = defaultdict(list)
        appointments_by_creator: dict[UUID, int] = defaultdict(int)
        for sale in sales:
            sales_by_user[sale.sold_by_platform_user_id].append(sale)
        for creator_record in appointments:
            appointments_by_creator[creator_record.appointment.created_by_platform_user_id] += 1
        by_user: list[PersonalUserResponse] = []
        for user_id, (_membership_id, name) in users.items():
            user_sales = sales_by_user[user_id]
            sales_total = sum((sale.total for sale in user_sales), Decimal("0"))
            created = appointments_by_creator[user_id]
            role = ", ".join(sorted(roles_by_user[user_id])) or "Sin rol"
            if query:
                if query not in f"{name} {role}".casefold():
                    continue
            elif not user_sales and not created:
                continue
            by_user.append(
                PersonalUserResponse(
                    id=user_id,
                    name=name,
                    role=role,
                    sales_count=len(user_sales),
                    sales_total=self._money(sales_total),
                    appointments_created=created,
                    avg_ticket=self._money(
                        sales_total / len(user_sales) if user_sales else Decimal("0")
                    ),
                )
            )
        by_user.sort(key=lambda row: (-row.sales_total, row.name.casefold()))

        employee_metrics: dict[UUID, dict[str, Any]] = defaultdict(
            lambda: {"attended": 0, "no_show": 0, "revenue": Decimal("0")}
        )
        for appointment_record in appointments:
            scheduled = appointment_record.appointment
            if scheduled.employee_id is None:
                continue
            if scheduled.status in _ATTENDED_STATUSES:
                employee_metrics[scheduled.employee_id]["attended"] += 1
                employee_metrics[scheduled.employee_id]["revenue"] += scheduled.price
            elif scheduled.status == "no_show":
                employee_metrics[scheduled.employee_id]["no_show"] += 1
        employees = {
            employee.id: employee
            for employee in self._repository.employees(
                workspace_id=grant.workspace_id,
                allowed_branch_ids=grant.allowed_branch_ids,
            )
        }
        usage_records = self._repository.supply_usage(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
        )
        employee_incident_records = self._repository.employee_incidents(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
            starts_on=context.starts_on,
            ends_on=context.ends_on,
        )

        supply_by_employee: dict[UUID, Decimal] = defaultdict(Decimal)
        for usage_record in usage_records:
            supply_by_employee[usage_record.employee_id] += usage_record.quantity

        incident_by_employee: dict[UUID, dict[str, Any]] = defaultdict(
            lambda: {
                "name": "",
                "total": 0,
                "open": 0,
                "vacation_days": 0,
                "kinds": defaultdict(int),
            }
        )
        incident_distribution_counts: dict[str, int] = defaultdict(int)
        for incident_record in employee_incident_records:
            current = incident_by_employee[incident_record.employee_id]
            current["name"] = incident_record.employee_name
            current["total"] += incident_record.count
            current["vacation_days"] += incident_record.days
            current["kinds"][incident_record.kind] += incident_record.count
            incident_distribution_counts[incident_record.kind] += incident_record.count
            if incident_record.status in {"abierta", "en_proceso"}:
                current["open"] += incident_record.count

        attended_total = sum(
            record.appointment.status in _ATTENDED_STATUSES for record in appointments
        )
        service_employee_ids = {
            employee_id
            for employee_id, metrics in employee_metrics.items()
            if metrics["attended"] or metrics["no_show"]
        }
        team_average = (
            Decimal(attended_total) / Decimal(len(service_employee_ids))
            if service_employee_ids
            else Decimal("0")
        )
        relevant_employee_ids = (
            set(employee_metrics) | set(supply_by_employee) | set(incident_by_employee)
        )
        by_employee: list[PersonalEmployeeResponse] = []
        for employee_id in relevant_employee_ids:
            employee = employees.get(employee_id)
            if employee is None:
                continue
            metrics = employee_metrics[employee_id]
            name = f"{employee.first_name} {employee.last_name}".strip()
            position = employee.position or "Especialista"
            department = employee.department or "Operaciones"
            if query and query not in f"{name} {position} {department}".casefold():
                continue
            attended = int(metrics["attended"])
            revenue = Decimal(metrics["revenue"])
            by_employee.append(
                PersonalEmployeeResponse(
                    id=employee.id,
                    name=name,
                    position=position,
                    department=department,
                    appointments_attended=attended,
                    attendance_vs_team_pct=self._percent(Decimal(attended), team_average),
                    no_shows=int(metrics["no_show"]),
                    incident_count=int(incident_by_employee[employee_id]["total"]),
                    supply_quantity=self._quantity(supply_by_employee[employee_id]),
                    revenue=self._money(revenue),
                    avg_ticket=self._money(revenue / attended if attended else Decimal("0")),
                )
            )
        by_employee.sort(
            key=lambda row: (-row.appointments_attended, -row.revenue, row.name.casefold())
        )

        incident_metrics: list[PersonalIncidentMetricsResponse] = []
        for employee_id, data in incident_by_employee.items():
            employee = employees.get(employee_id)
            if employee is None:
                continue
            name = f"{employee.first_name} {employee.last_name}".strip()
            if (
                query
                and query
                not in f"{name} {employee.position} {employee.department or ''}".casefold()
            ):
                continue
            kinds: dict[str, int] = data["kinds"]
            incident_metrics.append(
                PersonalIncidentMetricsResponse(
                    employee_id=employee_id,
                    employee_name=name,
                    total=int(data["total"]),
                    open_count=int(data["open"]),
                    absences=kinds["ausencia"],
                    vacations=kinds["vacaciones"],
                    vacation_days=int(data["vacation_days"]),
                    warnings=kinds["amonestacion"],
                    lateness=kinds["tardanza"],
                    medical_leave=kinds["licencia_medica"],
                    other=kinds["otro"],
                )
            )
        incident_metrics.sort(key=lambda row: (-row.total, row.employee_name.casefold()))

        attended_by_employee = {
            employee_id: int(metrics["attended"])
            for employee_id, metrics in employee_metrics.items()
        }
        usage: dict[tuple[UUID, UUID], dict[str, Any]] = {}
        for usage_record in usage_records:
            if (
                query
                and query
                not in (f"{usage_record.employee_name} {usage_record.supply_name}").casefold()
            ):
                continue
            key = (usage_record.employee_id, usage_record.supply_id)
            current = usage.setdefault(
                key,
                {
                    "employee_name": usage_record.employee_name,
                    "supply_name": usage_record.supply_name,
                    "quantity": Decimal("0"),
                },
            )
            current["quantity"] += usage_record.quantity
        supply_usage: list[PersonalSupplyUsageResponse] = []
        for (employee_id, supply_id), data in usage.items():
            appointments_count = attended_by_employee.get(employee_id, 0)
            quantity = Decimal(data["quantity"])
            per_appointment = quantity / appointments_count if appointments_count else None
            summary = (
                f"{self._quantity_label(quantity)} {data['supply_name']} en "
                f"{appointments_count} citas (~{self._quantity_label(per_appointment)} por cita)"
                if per_appointment is not None
                else f"{self._quantity_label(quantity)} {data['supply_name']} (sin citas contadas)"
            )
            supply_usage.append(
                PersonalSupplyUsageResponse(
                    employee_id=employee_id,
                    employee_name=data["employee_name"],
                    supply_id=supply_id,
                    supply_name=data["supply_name"],
                    qty=quantity,
                    appointments_count=appointments_count,
                    per_appointment=per_appointment,
                    summary=summary,
                )
            )
        supply_usage.sort(key=lambda row: (-row.qty, row.employee_name.casefold()))
        sales_total = sum((sale.total for sale in sales), Decimal("0"))
        return PersonalReportResponse(
            period=period,
            branch_id=branch_id,
            totals=PersonalTotalsResponse(
                sales_total=self._money(sales_total),
                sales_count=len(sales),
                appointments_attended=attended_total,
                appointments_created=len(appointments),
                transactions=len(sales),
                employee_incidents=sum(record.count for record in employee_incident_records),
                vacation_days=sum(record.days for record in employee_incident_records),
                supplies_used=self._quantity(
                    sum((record.quantity for record in usage_records), Decimal("0"))
                ),
                team_average_attended=self._quantity(team_average),
            ),
            by_user=by_user,
            by_employee=by_employee,
            incident_metrics=incident_metrics,
            incident_distribution=[
                CountPoint(
                    id=kind,
                    name=_EMPLOYEE_INCIDENT_NAMES[kind],
                    value=incident_distribution_counts[kind],
                )
                for kind in _EMPLOYEE_INCIDENT_NAMES
                if incident_distribution_counts[kind]
            ],
            supply_usage=supply_usage,
        )

    def _context(
        self,
        grant: PermissionGrant,
        *,
        period: ReportPeriod,
        branch_id: UUID | None,
        now: datetime | None,
    ) -> ReportContext:
        workspace = self._repository.workspace(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El workspace no existe.")
        timezone_name = workspace.timezone
        if branch_id is not None:
            branch = self._validate_branch(grant, branch_id)
            timezone_name = branch.timezone
        try:
            timezone = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError:
            timezone = ZoneInfo("UTC")
            timezone_name = "UTC"
        generated_at = now or datetime.now(UTC)
        if generated_at.tzinfo is None:
            generated_at = generated_at.replace(tzinfo=UTC)
        local_today = generated_at.astimezone(timezone).date()
        starts_on, ends_on = self._period_dates(period, local_today)
        return ReportContext(
            period=period,
            branch_id=branch_id,
            timezone=timezone_name,
            local_today=local_today,
            starts_on=starts_on,
            ends_on=ends_on,
            starts_at=datetime.combine(starts_on, time.min, timezone).astimezone(UTC),
            ends_at=datetime.combine(ends_on, time.min, timezone).astimezone(UTC),
            currency_code=workspace.default_currency,
            generated_at=generated_at,
        )

    def _agenda_context(
        self,
        grant: PermissionGrant,
        *,
        period: AgendaReportPeriod,
        branch_id: UUID | None,
        now: datetime | None,
    ) -> ReportContext:
        effective_period: ReportPeriod = "quarter" if period == "all" else period
        context = self._context(grant, period=effective_period, branch_id=branch_id, now=now)
        return context

    def _validate_branch(self, grant: PermissionGrant, branch_id: UUID) -> Branch:
        branch = self._repository.branch(grant.workspace_id, branch_id)
        if branch is None:
            raise ResourceNotFoundError("La sucursal no existe.", "branchId")
        if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
            raise ResourceNotFoundError("La sucursal está fuera de tu alcance.", "branchId")
        return branch

    @staticmethod
    def _period_dates(period: ReportPeriod, today: date) -> tuple[date, date]:
        if period == "today":
            return today, today + timedelta(days=1)
        if period == "week":
            start = today - timedelta(days=today.weekday())
            return start, start + timedelta(days=7)
        if period == "month":
            start = today.replace(day=1)
            end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
            return start, end
        quarter_month = ((today.month - 1) // 3) * 3 + 1
        start = today.replace(month=quarter_month, day=1)
        if quarter_month == 10:
            return start, date(today.year + 1, 1, 1)
        return start, date(today.year, quarter_month + 3, 1)

    def _financial_rows(
        self, grant: PermissionGrant, context: ReportContext
    ) -> tuple[FinancialTransactionRecord, ...]:
        return self._repository.financial_transactions(
            workspace_id=grant.workspace_id,
            branch_id=context.branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
            starts_on=context.starts_on,
            ends_on=context.ends_on,
        )

    def _financial_series(
        self,
        rows: tuple[FinancialTransactionRecord, ...],
        context: ReportContext,
    ) -> list[GeneralSeriesPoint]:
        timezone = ZoneInfo(context.timezone)
        weekly = (context.ends_on - context.starts_on).days > 31
        step = 7 if weekly else 1
        starts = list(
            context.starts_on + timedelta(days=offset)
            for offset in range(0, (context.ends_on - context.starts_on).days, step)
        )
        values: dict[int, dict[str, Decimal]] = defaultdict(
            lambda: {"ingreso": Decimal("0"), "gasto": Decimal("0")}
        )
        for row in rows:
            local_date = row.occurred_at.astimezone(timezone).date()
            bucket = max(0, (local_date - context.starts_on).days // step)
            values[bucket][row.transaction_type] += row.amount
        return [
            GeneralSeriesPoint(
                label=f"{start.day:02d} {_MONTHS[start.month - 1]}",
                income=self._money(values[index]["ingreso"]),
                expenses=self._money(values[index]["gasto"]),
            )
            for index, start in enumerate(starts)
        ]

    def _income_distribution(
        self, rows: tuple[FinancialTransactionRecord, ...]
    ) -> list[DistributionPoint]:
        amounts: dict[str, Decimal] = defaultdict(Decimal)
        for row in rows:
            if row.transaction_type == "ingreso":
                amounts[row.category] += row.amount
        total = sum(amounts.values(), Decimal("0"))
        return [
            DistributionPoint(
                name=name,
                value=self._money(value),
                pct=self._percent(value, total),
            )
            for name, value in sorted(amounts.items(), key=lambda item: item[1], reverse=True)
        ]

    def _membership_rows(
        self,
        purchases: tuple[MembershipPurchaseRecord, ...],
        context: ReportContext,
    ) -> list[MembershipReportItemResponse]:
        subscriptions: dict[tuple[UUID, UUID | None], dict[str, Any]] = {}
        timezone = ZoneInfo(context.timezone)
        for source_purchase in purchases:
            key = (source_purchase.customer_id, source_purchase.plan_id)
            purchased_on = source_purchase.completed_at.astimezone(timezone).date()
            current = subscriptions.get(key)
            previous_expiry = current["expires_on"] if current else purchased_on
            starts_on = max(previous_expiry, purchased_on)
            duration = max(1, ceil(float(source_purchase.quantity))) * 30
            subscriptions[key] = {
                "purchase": source_purchase,
                "expires_on": starts_on + timedelta(days=duration),
            }
        rows: list[MembershipReportItemResponse] = []
        for (customer_id, plan_id), subscription in subscriptions.items():
            latest_purchase: MembershipPurchaseRecord = subscription["purchase"]
            expires_on: date = subscription["expires_on"]
            status = self._membership_status(
                expires_on, context.local_today, latest_purchase.customer_status
            )
            rows.append(
                MembershipReportItemResponse(
                    id=f"{customer_id}:{plan_id or latest_purchase.plan_name}",
                    customer_id=customer_id,
                    client_name=latest_purchase.customer_name,
                    plan_id=plan_id,
                    plan=latest_purchase.plan_name,
                    branch_id=latest_purchase.branch_id,
                    branch_name=latest_purchase.branch_name,
                    amount=self._money(latest_purchase.unit_price),
                    last_payment_at=latest_purchase.completed_at,
                    expires_on=expires_on,
                    status=status,
                )
            )
        return rows

    @staticmethod
    def _membership_status(expires_on: date, today: date, customer_status: str) -> MembershipStatus:
        if customer_status != "active":
            return "inactivo"
        remaining = (expires_on - today).days
        if remaining < -30:
            return "inactivo"
        if remaining < 0:
            return "vencido"
        if remaining <= 7:
            return "proximo"
        return "activo"

    def _membership_summary(
        self,
        rows: list[MembershipReportItemResponse],
        purchases: tuple[MembershipPurchaseRecord, ...],
        context: ReportContext,
    ) -> MembershipSummaryResponse:
        active = [row for row in rows if row.status == "activo"]
        mrr = sum((row.amount for row in active), Decimal("0"))
        current_start = context.local_today.replace(day=1)
        previous_end = current_start
        previous_start = (current_start - timedelta(days=1)).replace(day=1)
        timezone = ZoneInfo(context.timezone)
        current_count = sum(
            current_start <= row.completed_at.astimezone(timezone).date() < context.ends_on
            for row in purchases
        )
        previous_count = sum(
            previous_start <= row.completed_at.astimezone(timezone).date() < previous_end
            for row in purchases
        )
        growth_pct = (
            (Decimal(current_count - previous_count) / Decimal(previous_count) * Decimal("100"))
            if previous_count
            else Decimal("100")
            if current_count
            else Decimal("0")
        )
        month_starts: list[date] = []
        cursor = current_start
        for _ in range(6):
            month_starts.append(cursor)
            cursor = (cursor - timedelta(days=1)).replace(day=1)
        month_starts.reverse()
        growth: list[MembershipGrowthPoint] = []
        for start in month_starts:
            end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
            value = sum(
                (
                    purchase.unit_price * purchase.quantity
                    for purchase in purchases
                    if start <= purchase.completed_at.astimezone(timezone).date() < end
                ),
                Decimal("0"),
            )
            growth.append(
                MembershipGrowthPoint(label=_MONTHS[start.month - 1], value=self._money(value))
            )
        return MembershipSummaryResponse(
            active_count=len(active),
            mrr=self._money(mrr),
            avg_ticket=self._money(mrr / len(active) if active else Decimal("0")),
            upcoming=sum(row.status == "proximo" for row in rows),
            expired=sum(row.status == "vencido" for row in rows),
            inactive=sum(row.status == "inactivo" for row in rows),
            new_this_month=current_count,
            growth_pct=growth_pct.quantize(_PCT, rounding=ROUND_HALF_UP),
            growth=growth,
            plans=sorted({row.plan for row in rows}),
        )

    def _appointment_rows(
        self,
        grant: PermissionGrant,
        context: ReportContext,
        *,
        status: str | None,
        search: str | None,
        all_dates: bool,
    ) -> list[AppointmentReportRecord]:
        starts_on = None if all_dates else context.starts_on
        ends_on = None if all_dates else context.ends_on
        records = self._repository.appointments(
            workspace_id=grant.workspace_id,
            branch_id=context.branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_on=starts_on,
            ends_on=ends_on,
        )
        query = (search or "").casefold().strip()
        return [
            record
            for record in records
            if (not status or record.appointment.status == status)
            and (
                not query
                or query
                in (
                    f"{record.appointment.customer_name} "
                    f"{record.appointment.service_name} {record.employee_name or ''}"
                ).casefold()
            )
        ]

    def _agenda_weekly(
        self,
        grant: PermissionGrant,
        branch_id: UUID | None,
        generated_at: datetime,
    ) -> list[AgendaWeeklyPoint]:
        context = self._context(grant, period="week", branch_id=branch_id, now=generated_at)
        start = context.local_today - timedelta(days=6)
        records = self._repository.appointments(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_on=start,
            ends_on=context.local_today + timedelta(days=1),
        )
        by_date: dict[date, dict[str, int]] = defaultdict(lambda: {"completed": 0, "no_show": 0})
        for record in records:
            status = record.appointment.status
            if status in _ATTENDED_STATUSES:
                by_date[record.appointment.scheduled_date]["completed"] += 1
            elif status == "no_show":
                by_date[record.appointment.scheduled_date]["no_show"] += 1
        return [
            AgendaWeeklyPoint(
                label=f"{current.day:02d} {_MONTHS[current.month - 1]}",
                completed=by_date[current]["completed"],
                no_show=by_date[current]["no_show"],
            )
            for current in (start + timedelta(days=index) for index in range(7))
        ]

    @staticmethod
    def _agenda_item(record: AppointmentReportRecord) -> AgendaReportItemResponse:
        appointment = record.appointment
        return AgendaReportItemResponse(
            id=appointment.id,
            branch_id=appointment.branch_id,
            branch_name=record.branch_name,
            employee_id=appointment.employee_id,
            employee_name=record.employee_name,
            date=appointment.scheduled_date,
            time=appointment.scheduled_time.strftime("%H:%M"),
            customer_name=appointment.customer_name,
            service_name=appointment.service_name,
            status=appointment.status,  # type: ignore[arg-type]
            source=appointment.source,  # type: ignore[arg-type]
            created_by=record.created_by_name,
            updated_by=record.updated_by_name,
            created_at=appointment.created_at,
            updated_at=appointment.updated_at,
        )

    def _inventory_rows(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        category_id: UUID | None,
        search: str | None,
    ) -> list[_InventoryRow]:
        stocks = self._repository.inventory_stock(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
        )
        sales = self._repository.inventory_sales(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
        )
        stock_by_item: dict[UUID, dict[str, Any]] = {}
        for record in stocks:
            current = stock_by_item.setdefault(
                record.item.id,
                {
                    "item": record.item,
                    "category": record.category,
                    "profile": record.profile,
                    "stock": Decimal("0"),
                    "minimum": Decimal("0"),
                    "low": False,
                },
            )
            current["stock"] += record.balance.quantity
            current["minimum"] += record.balance.minimum_quantity
            current["low"] = current["low"] or (
                record.balance.minimum_quantity > 0
                and record.balance.quantity <= record.balance.minimum_quantity
            )
        sold_by_item: dict[UUID, dict[str, Decimal]] = defaultdict(
            lambda: {"quantity": Decimal("0"), "revenue": Decimal("0"), "cost": Decimal("0")}
        )
        for sale in sales:
            sold_by_item[sale.item_id]["quantity"] += sale.quantity
            sold_by_item[sale.item_id]["revenue"] += sale.revenue
            sold_by_item[sale.item_id]["cost"] += sale.cost
        query = (search or "").casefold().strip()
        rows: list[_InventoryRow] = []
        for item_id, data in stock_by_item.items():
            item = data["item"]
            category = data["category"]
            if category_id and category.id != category_id:
                continue
            if query and query not in f"{item.name} {category.name}".casefold():
                continue
            profile = data["profile"]
            cost = profile.unit_cost or Decimal("0")
            price = profile.sale_price or Decimal("0")
            stock = Decimal(data["stock"])
            sold = sold_by_item[item_id]
            profit = sold["revenue"] - sold["cost"]
            margin = (price - cost) / price * Decimal("100") if price > 0 else Decimal("0")
            rows.append(
                _InventoryRow(
                    response=InventoryReportItemResponse(
                        id=item.id,
                        name=item.name,
                        category_id=category.id,
                        category_name=category.name,
                        cost=self._money(cost),
                        price=self._money(price),
                        stock=stock,
                        minimum_stock=Decimal(data["minimum"]),
                        stock_value_cost=self._money(cost * stock),
                        stock_value_sale=self._money(price * stock),
                        sold=sold["quantity"],
                        revenue=self._money(sold["revenue"]),
                        profit=self._money(profit),
                        margin_pct=margin.quantize(_PCT, rounding=ROUND_HALF_UP),
                    ),
                    low_stock=bool(data["low"]),
                )
            )
        return rows

    @staticmethod
    def _short_label(value: str) -> str:
        return f"{value[:14]}…" if len(value) > 14 else value

    @staticmethod
    def _quantity_label(value: Decimal | None) -> str:
        if value is None:
            return "0"
        normalized = value.normalize()
        return format(normalized, "f")

    @staticmethod
    def _money(value: Decimal) -> Decimal:
        return value.quantize(_MONEY, rounding=ROUND_HALF_UP)

    @staticmethod
    def _quantity(value: Decimal) -> Decimal:
        return value.quantize(_QUANTITY, rounding=ROUND_HALF_UP)

    @staticmethod
    def _percent(value: Decimal, total: Decimal) -> Decimal:
        if total <= 0:
            return Decimal("0.00")
        return (value / total * Decimal("100")).quantize(_PCT, rounding=ROUND_HALF_UP)

    @staticmethod
    def _sort(rows: list[_T], accessor: Callable[[_T], Any], direction: str) -> list[_T]:
        return sorted(rows, key=accessor, reverse=direction == "desc")

    @staticmethod
    def _page(rows: list[_T], page: int, page_size: int) -> tuple[list[_T], int, int]:
        total_pages = max(1, ceil(len(rows) / page_size))
        safe_page = min(page, total_pages)
        start = (safe_page - 1) * page_size
        return rows[start : start + page_size], safe_page, total_pages
