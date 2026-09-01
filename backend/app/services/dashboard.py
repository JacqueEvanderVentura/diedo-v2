from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.db.models import Appointment, Branch
from app.repositories.dashboard import DashboardRepository, StockAlertRecord
from app.schemas.dashboard import DashboardPeriod
from app.services.authorization import PermissionGrant
from app.services.errors import ResourceNotFoundError

_DAY_NAMES = ("lun", "mar", "mié", "jue", "vie", "sáb", "dom")
_MONTH_NAMES = ("ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic")


@dataclass(frozen=True)
class DashboardContext:
    period: DashboardPeriod
    branch_id: UUID | None
    timezone: str
    local_today: date
    starts_at: datetime
    ends_at: datetime
    starts_on: date
    ends_on: date
    currency_code: str
    generated_at: datetime


@dataclass(frozen=True)
class DashboardSummary:
    context: DashboardContext
    revenue: Decimal
    appointments_today: int
    open_tasks: int


@dataclass(frozen=True)
class SalesTrendPoint:
    label: str
    value: Decimal


@dataclass(frozen=True)
class DashboardSalesTrend:
    context: DashboardContext
    total: Decimal
    points: tuple[SalesTrendPoint, ...]


@dataclass(frozen=True)
class ActivityItem:
    id: str
    branch_id: UUID
    title: str
    occurred_at: datetime
    source: str
    icon: str
    to: str


class DashboardService:
    def __init__(self, session: Session) -> None:
        self._repository = DashboardRepository(session)

    def summary(
        self,
        grant: PermissionGrant,
        *,
        period: DashboardPeriod,
        branch_id: UUID | None,
        now: datetime | None = None,
    ) -> DashboardSummary:
        context = self._context(grant, period=period, branch_id=branch_id, now=now)
        return DashboardSummary(
            context=context,
            revenue=self._repository.revenue_total(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
                starts_at=context.starts_at,
                ends_at=context.ends_at,
            ),
            appointments_today=self._repository.appointment_count_today(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
                scheduled_date=context.local_today,
            ),
            open_tasks=self._repository.open_task_count(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
                starts_at=context.starts_at,
                ends_at=context.ends_at,
            ),
        )

    def sales_trend(
        self,
        grant: PermissionGrant,
        *,
        period: DashboardPeriod,
        branch_id: UUID | None,
        now: datetime | None = None,
    ) -> DashboardSalesTrend:
        context = self._context(grant, period=period, branch_id=branch_id, now=now)
        if period == "today":
            values = dict(
                self._repository.sales_by_local_hour(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    allowed_branch_ids=grant.allowed_branch_ids,
                    starts_at=context.starts_at,
                    ends_at=context.ends_at,
                    timezone=context.timezone,
                )
            )
            slots = {hour: Decimal("0") for hour in range(0, 24, 2)}
            for hour, value in values.items():
                slots[(hour // 2) * 2] += value
            points = tuple(
                SalesTrendPoint(label=self._hour_label(hour), value=value)
                for hour, value in slots.items()
            )
        else:
            values_by_date = dict(
                self._repository.sales_by_local_date(
                    workspace_id=grant.workspace_id,
                    branch_id=branch_id,
                    allowed_branch_ids=grant.allowed_branch_ids,
                    starts_at=context.starts_at,
                    ends_at=context.ends_at,
                    timezone=context.timezone,
                )
            )
            points = self._date_points(context, values_by_date)
        return DashboardSalesTrend(
            context=context,
            total=sum((point.value for point in points), start=Decimal("0")),
            points=points,
        )

    def stock_alerts(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        limit: int,
    ) -> tuple[StockAlertRecord, ...]:
        self._validate_branch(grant, branch_id)
        return self._repository.stock_alerts(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            limit=limit,
        )

    def appointments_today(
        self,
        grant: PermissionGrant,
        *,
        branch_id: UUID | None,
        limit: int,
        now: datetime | None = None,
    ) -> tuple[date, tuple[Appointment, ...]]:
        context = self._context(grant, period="today", branch_id=branch_id, now=now)
        return (
            context.local_today,
            self._repository.appointments_today(
                workspace_id=grant.workspace_id,
                branch_id=branch_id,
                allowed_branch_ids=grant.allowed_branch_ids,
                scheduled_date=context.local_today,
                limit=limit,
            ),
        )

    def recent_activity(
        self,
        grant: PermissionGrant,
        *,
        period: DashboardPeriod,
        branch_id: UUID | None,
        limit: int,
        now: datetime | None = None,
    ) -> tuple[ActivityItem, ...]:
        context = self._context(grant, period=period, branch_id=branch_id, now=now)
        activity: list[ActivityItem] = []
        for sale in self._repository.recent_sales(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
            limit=limit,
        ):
            if sale.status == "voided":
                title = f"Venta anulada: {sale.sale_number}"
                icon = "FileX"
            else:
                title = f"Ingreso registrado por {self._money_label(sale.total)}"
                icon = "FileText"
            activity.append(
                ActivityItem(
                    id=f"sale:{sale.id}",
                    branch_id=sale.branch_id,
                    title=title,
                    occurred_at=sale.voided_at or sale.completed_at,
                    source="POS",
                    icon=icon,
                    to="/pos/caja",
                )
            )
        for register_record in self._repository.recent_registers(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
            limit=limit,
        ):
            activity.append(
                ActivityItem(
                    id=f"register:{register_record.register.id}",
                    branch_id=register_record.register.branch_id,
                    title=f"Caja abierta en {register_record.branch.name}",
                    occurred_at=register_record.register.opened_at,
                    source="POS",
                    icon="Store",
                    to="/pos/caja",
                )
            )
        movement_names = {
            "opening": "Inventario inicial registrado",
            "inbound": "Entrada de inventario registrada",
            "outbound": "Salida de inventario registrada",
            "adjustment": "Ajuste de inventario registrado",
        }
        for inventory_record in self._repository.recent_inventory_movements(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
            limit=limit,
        ):
            movement_label = movement_names.get(
                inventory_record.movement.movement_type, "Movimiento de inventario"
            )
            activity.append(
                ActivityItem(
                    id=f"inventory:{inventory_record.movement.id}",
                    branch_id=inventory_record.movement.branch_id,
                    title=f"{movement_label} en {inventory_record.branch.name}",
                    occurred_at=inventory_record.movement.created_at,
                    source="Inventario",
                    icon="Package",
                    to="/inventarios",
                )
            )
        for appointment in self._repository.recent_appointments(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
            limit=limit,
        ):
            activity.append(
                ActivityItem(
                    id=f"appointment:{appointment.id}",
                    branch_id=appointment.branch_id,
                    title=f"Cita agendada: {appointment.customer_name}",
                    occurred_at=appointment.created_at,
                    source="Agenda",
                    icon="CalendarClock",
                    to="/agenda/calendario",
                )
            )
        for task in self._repository.recent_tasks(
            workspace_id=grant.workspace_id,
            branch_id=branch_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            starts_at=context.starts_at,
            ends_at=context.ends_at,
            limit=limit,
        ):
            activity.append(
                ActivityItem(
                    id=f"task:{task.id}",
                    branch_id=task.branch_id,
                    title=f"Tarea abierta: {task.title}",
                    occurred_at=task.created_at,
                    source="Tareas",
                    icon="ClipboardList",
                    to=task.source_route,
                )
            )
        activity.sort(key=lambda item: (item.occurred_at, item.id), reverse=True)
        return tuple(activity[:limit])

    def _context(
        self,
        grant: PermissionGrant,
        *,
        period: DashboardPeriod,
        branch_id: UUID | None,
        now: datetime | None,
    ) -> DashboardContext:
        branch = self._validate_branch(grant, branch_id)
        workspace = self._repository.workspace(grant.workspace_id)
        if workspace is None:
            raise ResourceNotFoundError("El espacio de trabajo no existe.")
        timezone = branch.timezone if branch is not None else workspace.timezone
        try:
            zone = ZoneInfo(timezone)
        except ZoneInfoNotFoundError as exc:
            raise ResourceNotFoundError("La zona horaria del negocio no es válida.") from exc
        instant = now or datetime.now(UTC)
        if instant.tzinfo is None:
            instant = instant.replace(tzinfo=UTC)
        instant = instant.astimezone(UTC)
        local_now = instant.astimezone(zone)
        starts_on, ends_on = self._period_dates(period, local_now.date())
        starts_at = datetime.combine(starts_on, time.min, tzinfo=zone).astimezone(UTC)
        ends_at = datetime.combine(ends_on, time.min, tzinfo=zone).astimezone(UTC)
        return DashboardContext(
            period=period,
            branch_id=branch_id,
            timezone=timezone,
            local_today=local_now.date(),
            starts_at=starts_at,
            ends_at=ends_at,
            starts_on=starts_on,
            ends_on=ends_on,
            currency_code=workspace.default_currency,
            generated_at=instant,
        )

    def _validate_branch(self, grant: PermissionGrant, branch_id: UUID | None) -> Branch | None:
        if branch_id is None:
            return None
        if grant.allowed_branch_ids is not None and branch_id not in grant.allowed_branch_ids:
            raise ResourceNotFoundError(
                "La sucursal no existe o está fuera de tu alcance.", "branchId"
            )
        branch = self._repository.branch(grant.workspace_id, branch_id)
        if branch is None:
            raise ResourceNotFoundError(
                "La sucursal no existe o está fuera de tu alcance.", "branchId"
            )
        return branch

    @staticmethod
    def _period_dates(period: DashboardPeriod, today: date) -> tuple[date, date]:
        if period == "today":
            return today, today + timedelta(days=1)
        if period == "week":
            start = today - timedelta(days=today.weekday())
            return start, start + timedelta(days=7)
        if period == "month":
            start = today.replace(day=1)
            if start.month == 12:
                return start, date(start.year + 1, 1, 1)
            return start, date(start.year, start.month + 1, 1)
        quarter_month = ((today.month - 1) // 3) * 3 + 1
        start = date(today.year, quarter_month, 1)
        if quarter_month == 10:
            return start, date(today.year + 1, 1, 1)
        return start, date(today.year, quarter_month + 3, 1)

    @staticmethod
    def _hour_label(hour: int) -> str:
        suffix = "AM" if hour < 12 else "PM"
        value = hour % 12 or 12
        return f"{value} {suffix}"

    @staticmethod
    def _date_points(
        context: DashboardContext,
        values_by_date: dict[date, Decimal],
    ) -> tuple[SalesTrendPoint, ...]:
        if context.period == "week":
            return tuple(
                SalesTrendPoint(
                    label=f"{_DAY_NAMES[index]} {current.day}",
                    value=values_by_date.get(current, Decimal("0")),
                )
                for index in range(7)
                for current in (context.starts_on + timedelta(days=index),)
            )
        if context.period == "month":
            week_count = (monthrange(context.starts_on.year, context.starts_on.month)[1] + 6) // 7
            month_totals = [Decimal("0") for _ in range(week_count)]
            for current, value in values_by_date.items():
                month_totals[(current.day - 1) // 7] += value
            return tuple(
                SalesTrendPoint(label=f"Sem {index + 1}", value=value)
                for index, value in enumerate(month_totals)
            )
        quarter_totals: dict[tuple[int, int], Decimal] = {}
        for current, value in values_by_date.items():
            key = (current.year, current.month)
            quarter_totals[key] = quarter_totals.get(key, Decimal("0")) + value
        points: list[SalesTrendPoint] = []
        current = context.starts_on
        while current < context.ends_on:
            points.append(
                SalesTrendPoint(
                    label=_MONTH_NAMES[current.month - 1].title(),
                    value=quarter_totals.get((current.year, current.month), Decimal("0")),
                )
            )
            current = (
                date(current.year + 1, 1, 1)
                if current.month == 12
                else date(current.year, current.month + 1, 1)
            )
        return tuple(points)

    @staticmethod
    def _money_label(value: Decimal) -> str:
        if value == value.to_integral_value():
            return f"RD$ {value:,.0f}"
        return f"RD$ {value:,.2f}"
