from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from math import ceil
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.db.models import EmployeeHrProfile, HrDocumentRecord, HrLeaveRequest
from app.repositories.hr import DebtRecord, HrRepository
from app.services.auth import AuthPrincipal
from app.services.authorization import PermissionGrant
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError


@dataclass(frozen=True)
class PageResult:
    items: tuple[object, ...]
    page: int
    page_size: int
    total_items: int
    total_pages: int


@dataclass(frozen=True)
class LeaveBalance:
    employee_id: UUID
    vacation_days: int
    used_days: int
    available_days: int
    items: tuple[HrLeaveRequest, ...]


@dataclass(frozen=True)
class DebtStats:
    total_debt: Decimal
    total_paid: Decimal
    pending: Decimal
    employees_with_debt: int


@dataclass(frozen=True)
class Overview:
    total_employees: int
    active_employees: int
    approved_vacations: int
    pending_approvals: int
    debt: DebtStats
    recent_requests: tuple[HrLeaveRequest, ...]


class HrService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = HrRepository(session)

    @staticmethod
    def _page(items: tuple[object, ...], page: int, page_size: int, total: int) -> PageResult:
        return PageResult(
            items=items,
            page=page,
            page_size=page_size,
            total_items=total,
            total_pages=ceil(total / page_size) if total else 0,
        )

    def list_profiles(self, grant: PermissionGrant, *, page: int, page_size: int) -> PageResult:
        result = self._repository.list_profiles(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            page=page,
            page_size=page_size,
        )
        return self._page(result.items, page, page_size, result.total_items)

    def update_profile(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        employee_id: UUID,
        expected_version: int,
        changes: dict[str, object],
    ) -> EmployeeHrProfile:
        profile = self._repository.get_profile(
            grant.workspace_id,
            employee_id,
            grant.allowed_branch_ids,
            for_update=True,
        )
        if profile is None:
            raise ResourceNotFoundError("La ficha de RRHH no existe.", "employeeId")
        if profile.version != expected_version:
            raise ConflictError("La ficha cambió desde la última lectura.", "version")
        try:
            record = self._repository.update_profile(
                profile=profile,
                changes=changes,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return record
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No fue posible actualizar la ficha de RRHH.") from exc

    def own_leave_balance(self, principal: AuthPrincipal, grant: PermissionGrant) -> LeaveBalance:
        employee = self._repository.employee_for_platform_user(
            grant.workspace_id,
            principal.platform_user_id,
            grant.allowed_branch_ids,
        )
        if employee is None:
            raise ResourceNotFoundError(
                "Tu usuario no está vinculado a un empleado visible.", "employeeId"
            )
        profile = self._repository.get_profile(
            grant.workspace_id, employee.id, grant.allowed_branch_ids
        )
        if profile is None:
            raise ResourceNotFoundError("La ficha de RRHH no existe.", "employeeId")
        result = self._repository.list_leave_requests(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            employee_id=employee.id,
            status=None,
            page=1,
            page_size=1_000,
        )
        used = self._repository.approved_leave_days(grant.workspace_id, employee.id)
        return LeaveBalance(
            employee_id=employee.id,
            vacation_days=profile.vacation_days,
            used_days=used,
            available_days=max(0, profile.vacation_days - used),
            items=result.items,
        )

    def list_leave_requests(
        self,
        grant: PermissionGrant,
        *,
        employee_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
    ) -> PageResult:
        if (
            employee_id is not None
            and self._repository.get_employee(
                grant.workspace_id, employee_id, grant.allowed_branch_ids
            )
            is None
        ):
            raise ResourceNotFoundError("El empleado no existe.", "employeeId")
        result = self._repository.list_leave_requests(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            employee_id=employee_id,
            status=status,
            page=page,
            page_size=page_size,
        )
        return self._page(result.items, page, page_size, result.total_items)

    def create_leave_request(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        start_date: date,
        end_date: date,
        reason: str,
    ) -> HrLeaveRequest:
        employee = self._repository.employee_for_platform_user(
            grant.workspace_id,
            principal.platform_user_id,
            grant.allowed_branch_ids,
        )
        if employee is None:
            raise ResourceNotFoundError(
                "Tu usuario no está vinculado a un empleado visible.", "employeeId"
            )
        profile = self._repository.get_profile(
            grant.workspace_id, employee.id, grant.allowed_branch_ids, for_update=True
        )
        if profile is None:
            raise ResourceNotFoundError("La ficha de RRHH no existe.", "employeeId")
        requested_days = (end_date - start_date).days + 1
        used_days = self._repository.approved_leave_days(grant.workspace_id, employee.id)
        if requested_days > max(0, profile.vacation_days - used_days):
            raise InvalidOperationError(
                "No tienes suficientes días de vacaciones disponibles.", "endDate"
            )
        if self._repository.has_overlapping_leave(
            grant.workspace_id, employee.id, start_date, end_date
        ):
            raise ConflictError(
                "Ya existe una solicitud pendiente o aprobada que se solapa con esas fechas.",
                "startDate",
            )
        try:
            leave = self._repository.create_leave_request(
                workspace_id=grant.workspace_id,
                employee_id=employee.id,
                start_date=start_date,
                end_date=end_date,
                reason=reason,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return leave
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No fue posible crear la solicitud.") from exc

    def review_leave_request(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        leave_request_id: UUID,
        status: str,
        expected_version: int,
    ) -> HrLeaveRequest:
        leave = self._repository.get_leave_request(
            grant.workspace_id,
            leave_request_id,
            grant.allowed_branch_ids,
            for_update=True,
        )
        if leave is None:
            raise ResourceNotFoundError("La solicitud no existe.", "leaveRequestId")
        if leave.version != expected_version:
            raise ConflictError("La solicitud cambió desde la última lectura.", "version")
        if leave.status != "pendiente":
            raise InvalidOperationError("Sólo una solicitud pendiente puede revisarse.", "status")
        if status == "aprobada":
            profile = self._repository.get_profile(
                grant.workspace_id,
                leave.employee_id,
                grant.allowed_branch_ids,
                for_update=True,
            )
            if profile is None:
                raise ResourceNotFoundError("La ficha de RRHH no existe.", "employeeId")
            used_days = self._repository.approved_leave_days(
                grant.workspace_id, leave.employee_id, exclude_request_id=leave.id
            )
            requested_days = (leave.end_date - leave.start_date).days + 1
            if used_days + requested_days > profile.vacation_days:
                raise InvalidOperationError(
                    "La solicitud excede el saldo vacacional disponible.", "status"
                )
        reviewed = self._repository.review_leave_request(
            leave=leave,
            status=status,
            actor_platform_user_id=principal.platform_user_id,
            reviewed_at=datetime.now(UTC),
            request_id=get_request_id(),
        )
        self._session.commit()
        return reviewed

    def cancel_leave_request(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        leave_request_id: UUID,
        expected_version: int,
    ) -> HrLeaveRequest:
        employee = self._repository.employee_for_platform_user(
            grant.workspace_id,
            principal.platform_user_id,
            grant.allowed_branch_ids,
        )
        if employee is None:
            raise ResourceNotFoundError(
                "Tu usuario no está vinculado a un empleado visible.", "employeeId"
            )
        leave = self._repository.get_leave_request(
            grant.workspace_id,
            leave_request_id,
            grant.allowed_branch_ids,
            for_update=True,
        )
        if leave is None or leave.employee_id != employee.id:
            raise ResourceNotFoundError("La solicitud no existe.", "leaveRequestId")
        if leave.version != expected_version:
            raise ConflictError("La solicitud cambió desde la última lectura.", "version")
        if leave.status != "pendiente":
            raise InvalidOperationError("Sólo una solicitud pendiente puede cancelarse.", "status")
        cancelled = self._repository.cancel_leave_request(
            leave=leave,
            actor_platform_user_id=principal.platform_user_id,
            request_id=get_request_id(),
        )
        self._session.commit()
        return cancelled

    def list_debts(
        self,
        grant: PermissionGrant,
        *,
        search: str | None,
        employee_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
    ) -> PageResult:
        result = self._repository.list_debts(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            search=" ".join(search.split()) if search else None,
            employee_id=employee_id,
            status=status,
            page=page,
            page_size=page_size,
        )
        return self._page(result.items, page, page_size, result.total_items)

    def debt_stats(self, grant: PermissionGrant) -> DebtStats:
        return self._calculate_debt_stats(
            self._repository.all_visible_debts(grant.workspace_id, grant.allowed_branch_ids)
        )

    @staticmethod
    def _calculate_debt_stats(records: tuple[DebtRecord, ...]) -> DebtStats:
        total_debt = sum((record.debt.amount for record in records), Decimal("0"))
        total_paid = sum(
            (payment.amount for record in records for payment in record.payments),
            Decimal("0"),
        )
        pending_by_employee: set[UUID] = set()
        pending = Decimal("0")
        for record in records:
            paid = sum((payment.amount for payment in record.payments), Decimal("0"))
            balance = max(Decimal("0"), record.debt.amount - paid)
            pending += balance
            if balance > 0:
                pending_by_employee.add(record.debt.employee_id)
        return DebtStats(total_debt, total_paid, pending, len(pending_by_employee))

    def create_debt(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        employee_id: UUID,
        concept: str,
        client_name: str | None,
        amount: Decimal,
        idempotency_key: str,
    ) -> DebtRecord:
        employee = self._repository.get_employee(
            grant.workspace_id, employee_id, grant.allowed_branch_ids
        )
        if employee is None:
            raise ResourceNotFoundError("El empleado no existe.", "employeeId")
        existing = self._repository.debt_by_idempotency_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            if (
                existing.employee_id != employee_id
                or existing.concept != concept
                or existing.client_name != client_name
                or existing.amount != amount
            ):
                raise ConflictError("La clave de idempotencia ya fue utilizada.")
            return self._repository.debt_record(existing)
        try:
            debt = self._repository.create_debt(
                workspace_id=grant.workspace_id,
                employee_id=employee_id,
                concept=concept,
                client_name=client_name,
                amount=amount,
                idempotency_key=idempotency_key,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self._repository.debt_record(debt)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No fue posible registrar la deuda.") from exc

    def create_payment(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        debt_id: UUID,
        amount: Decimal,
        paid_on: date,
        idempotency_key: str,
    ) -> DebtRecord:
        debt = self._repository.get_debt(
            grant.workspace_id,
            debt_id,
            grant.allowed_branch_ids,
            for_update=True,
        )
        if debt is None:
            raise ResourceNotFoundError("La deuda no existe.", "debtId")
        existing = self._repository.payment_by_idempotency_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            if (
                existing.debt_id != debt_id
                or existing.amount != amount
                or existing.paid_on != paid_on
            ):
                raise ConflictError("La clave de idempotencia ya fue utilizada.")
            return self._repository.debt_record(debt)
        record = self._repository.debt_record(debt)
        paid = sum((payment.amount for payment in record.payments), Decimal("0"))
        balance = max(Decimal("0"), debt.amount - paid)
        if amount > balance:
            raise InvalidOperationError("El pago excede el saldo pendiente.", "amount")
        try:
            self._repository.create_payment(
                debt=debt,
                amount=amount,
                paid_on=paid_on,
                idempotency_key=idempotency_key,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return self._repository.debt_record(debt)
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No fue posible registrar el pago.") from exc

    def list_documents(
        self,
        grant: PermissionGrant,
        *,
        employee_id: UUID | None,
        template_id: str | None,
        page: int,
        page_size: int,
    ) -> PageResult:
        result = self._repository.list_documents(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            employee_id=employee_id,
            template_id=template_id,
            page=page,
            page_size=page_size,
        )
        return self._page(result.items, page, page_size, result.total_items)

    def create_document(
        self,
        *,
        principal: AuthPrincipal,
        grant: PermissionGrant,
        employee_id: UUID,
        template_id: str,
        issue_date: date,
        include_salary: bool,
        idempotency_key: str,
    ) -> HrDocumentRecord:
        employee = self._repository.get_employee(
            grant.workspace_id, employee_id, grant.allowed_branch_ids
        )
        if employee is None:
            raise ResourceNotFoundError("El empleado no existe.", "employeeId")
        profile = self._repository.get_profile(
            grant.workspace_id, employee_id, grant.allowed_branch_ids
        )
        if profile is None:
            raise ResourceNotFoundError("La ficha de RRHH no existe.", "employeeId")
        existing = self._repository.document_by_idempotency_key(grant.workspace_id, idempotency_key)
        if existing is not None:
            if (
                existing.employee_id != employee_id
                or existing.template_id != template_id
                or existing.issue_date != issue_date
                or existing.include_salary != include_salary
            ):
                raise ConflictError("La clave de idempotencia ya fue utilizada.")
            return existing
        reference_code = f"RRHH-{issue_date.year}-{uuid7().hex[:10].upper()}"
        snapshot: dict[str, object] = {
            "employeeName": f"{employee.first_name} {employee.last_name}".strip(),
            "employeeNumber": employee.employee_number,
            "position": employee.position,
            "department": employee.department,
            "hireDate": employee.hire_date.isoformat(),
            "vacationDays": profile.vacation_days,
        }
        if include_salary:
            snapshot["salary"] = str(profile.current_salary)
        try:
            document = self._repository.create_document(
                workspace_id=grant.workspace_id,
                employee_id=employee_id,
                template_id=template_id,
                issue_date=issue_date,
                include_salary=include_salary,
                reference_code=reference_code,
                snapshot=snapshot,
                idempotency_key=idempotency_key,
                actor_platform_user_id=principal.platform_user_id,
                request_id=get_request_id(),
            )
            self._session.commit()
            return document
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No fue posible registrar el documento.") from exc

    def overview(self, grant: PermissionGrant) -> Overview:
        total, active = self._repository.employee_counts(
            grant.workspace_id, grant.allowed_branch_ids
        )
        recent = self._repository.list_leave_requests(
            workspace_id=grant.workspace_id,
            allowed_branch_ids=grant.allowed_branch_ids,
            employee_id=None,
            status=None,
            page=1,
            page_size=3,
        )
        return Overview(
            total_employees=total,
            active_employees=active,
            approved_vacations=self._repository.leave_count(
                grant.workspace_id, grant.allowed_branch_ids, "aprobada"
            ),
            pending_approvals=self._repository.leave_count(
                grant.workspace_id, grant.allowed_branch_ids, "pendiente"
            ),
            debt=self.debt_stats(grant),
            recent_requests=recent.items,
        )


def debt_values(record: DebtRecord) -> tuple[Decimal, Decimal, str]:
    paid = sum((payment.amount for payment in record.payments), Decimal("0"))
    balance = max(Decimal("0"), record.debt.amount - paid)
    status = "pagado" if balance <= 0 else "parcial" if paid > 0 else "pendiente"
    return paid, balance, status
