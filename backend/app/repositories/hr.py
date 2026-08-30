from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.selectable import ScalarSelect

from app.db.models import (
    AuditEntry,
    Employee,
    EmployeeBranchAssignment,
    EmployeeDebt,
    EmployeeDebtPayment,
    EmployeeHrProfile,
    HrDocumentRecord,
    HrLeaveRequest,
)


@dataclass(frozen=True)
class ProfilePage:
    items: tuple[EmployeeHrProfile, ...]
    total_items: int


@dataclass(frozen=True)
class LeavePage:
    items: tuple[HrLeaveRequest, ...]
    total_items: int


@dataclass(frozen=True)
class DebtRecord:
    debt: EmployeeDebt
    payments: tuple[EmployeeDebtPayment, ...]


@dataclass(frozen=True)
class DebtPage:
    items: tuple[DebtRecord, ...]
    total_items: int


@dataclass(frozen=True)
class DocumentPage:
    items: tuple[HrDocumentRecord, ...]
    total_items: int


class HrRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    @staticmethod
    def _visible_employee_ids(
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> Select[tuple[UUID]]:
        query = (
            select(Employee.id)
            .join(
                EmployeeBranchAssignment,
                (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                & (EmployeeBranchAssignment.employee_id == Employee.id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                Employee.status != "archived",
                EmployeeBranchAssignment.status == "active",
            )
        )
        if allowed_branch_ids is not None:
            query = query.where(EmployeeBranchAssignment.branch_id.in_(allowed_branch_ids))
        return query.distinct()

    def list_profiles(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        page: int,
        page_size: int,
    ) -> ProfilePage:
        query = select(EmployeeHrProfile).where(
            EmployeeHrProfile.workspace_id == workspace_id,
            EmployeeHrProfile.employee_id.in_(
                self._visible_employee_ids(workspace_id, allowed_branch_ids)
            ),
        )
        total_items = int(
            self._session.scalar(select(func.count()).select_from(query.subquery())) or 0
        )
        rows = self._session.scalars(
            query.order_by(EmployeeHrProfile.employee_id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return ProfilePage(tuple(rows), total_items)

    def get_profile(
        self,
        workspace_id: UUID,
        employee_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> EmployeeHrProfile | None:
        query = select(EmployeeHrProfile).where(
            EmployeeHrProfile.workspace_id == workspace_id,
            EmployeeHrProfile.employee_id == employee_id,
            EmployeeHrProfile.employee_id.in_(
                self._visible_employee_ids(workspace_id, allowed_branch_ids)
            ),
        )
        if for_update:
            query = query.with_for_update(of=EmployeeHrProfile)
        return self._session.scalar(query.limit(1))

    def update_profile(
        self,
        *,
        profile: EmployeeHrProfile,
        changes: dict[str, object],
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> EmployeeHrProfile:
        field_map = {"salary": "current_salary"}
        for field, value in changes.items():
            setattr(profile, field_map.get(field, field), value)
        profile.updated_by_platform_user_id = actor_platform_user_id
        profile.version += 1
        self._add_audit(
            workspace_id=profile.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="hr.profile.update",
            target_type="employee",
            target_id=profile.employee_id,
            request_id=request_id,
            details={"changedFields": sorted(changes), "version": profile.version},
        )
        self._session.flush()
        return profile

    def employee_for_platform_user(
        self,
        workspace_id: UUID,
        platform_user_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> Employee | None:
        query = select(Employee).where(
            Employee.workspace_id == workspace_id,
            Employee.platform_user_id == platform_user_id,
            Employee.status != "archived",
            Employee.id.in_(self._visible_employee_ids(workspace_id, allowed_branch_ids)),
        )
        return self._session.scalar(query.limit(1))

    def get_employee(
        self,
        workspace_id: UUID,
        employee_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> Employee | None:
        return self._session.scalar(
            select(Employee)
            .where(
                Employee.workspace_id == workspace_id,
                Employee.id == employee_id,
                Employee.id.in_(self._visible_employee_ids(workspace_id, allowed_branch_ids)),
            )
            .limit(1)
        )

    def list_leave_requests(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        employee_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
    ) -> LeavePage:
        query = select(HrLeaveRequest).where(
            HrLeaveRequest.workspace_id == workspace_id,
            HrLeaveRequest.employee_id.in_(
                self._visible_employee_ids(workspace_id, allowed_branch_ids)
            ),
        )
        if employee_id is not None:
            query = query.where(HrLeaveRequest.employee_id == employee_id)
        if status is not None:
            query = query.where(HrLeaveRequest.status == status)
        total_items = int(
            self._session.scalar(select(func.count()).select_from(query.subquery())) or 0
        )
        rows = self._session.scalars(
            query.order_by(HrLeaveRequest.created_at.desc(), HrLeaveRequest.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return LeavePage(tuple(rows), total_items)

    def get_leave_request(
        self,
        workspace_id: UUID,
        request_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> HrLeaveRequest | None:
        query = select(HrLeaveRequest).where(
            HrLeaveRequest.workspace_id == workspace_id,
            HrLeaveRequest.id == request_id,
            HrLeaveRequest.employee_id.in_(
                self._visible_employee_ids(workspace_id, allowed_branch_ids)
            ),
        )
        if for_update:
            query = query.with_for_update(of=HrLeaveRequest)
        return self._session.scalar(query.limit(1))

    def approved_leave_days(
        self,
        workspace_id: UUID,
        employee_id: UUID,
        *,
        exclude_request_id: UUID | None = None,
    ) -> int:
        query = select(HrLeaveRequest.start_date, HrLeaveRequest.end_date).where(
            HrLeaveRequest.workspace_id == workspace_id,
            HrLeaveRequest.employee_id == employee_id,
            HrLeaveRequest.status == "aprobada",
        )
        if exclude_request_id is not None:
            query = query.where(HrLeaveRequest.id != exclude_request_id)
        return sum((row.end_date - row.start_date).days + 1 for row in self._session.execute(query))

    def has_overlapping_leave(
        self,
        workspace_id: UUID,
        employee_id: UUID,
        start_date: date,
        end_date: date,
    ) -> bool:
        return (
            self._session.scalar(
                select(HrLeaveRequest.id).where(
                    HrLeaveRequest.workspace_id == workspace_id,
                    HrLeaveRequest.employee_id == employee_id,
                    HrLeaveRequest.status.in_(("pendiente", "aprobada")),
                    HrLeaveRequest.start_date <= end_date,
                    HrLeaveRequest.end_date >= start_date,
                )
            )
            is not None
        )

    def create_leave_request(
        self,
        *,
        workspace_id: UUID,
        employee_id: UUID,
        start_date: date,
        end_date: date,
        reason: str,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> HrLeaveRequest:
        leave = HrLeaveRequest(
            workspace_id=workspace_id,
            employee_id=employee_id,
            start_date=start_date,
            end_date=end_date,
            reason=reason,
            requested_by_platform_user_id=actor_platform_user_id,
        )
        self._session.add(leave)
        self._session.flush()
        self._add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="hr.leave.create",
            target_type="hr_leave_request",
            target_id=leave.id,
            request_id=request_id,
            details={"employeeId": str(employee_id)},
        )
        self._session.flush()
        return leave

    def review_leave_request(
        self,
        *,
        leave: HrLeaveRequest,
        status: str,
        actor_platform_user_id: UUID,
        reviewed_at: datetime,
        request_id: str,
    ) -> HrLeaveRequest:
        leave.status = status
        leave.reviewed_by_platform_user_id = actor_platform_user_id
        leave.reviewed_at = reviewed_at
        leave.version += 1
        self._add_audit(
            workspace_id=leave.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="hr.leave.review",
            target_type="hr_leave_request",
            target_id=leave.id,
            request_id=request_id,
            details={"status": status, "version": leave.version},
        )
        self._session.flush()
        return leave

    def cancel_leave_request(
        self,
        *,
        leave: HrLeaveRequest,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> HrLeaveRequest:
        leave.status = "cancelada"
        leave.version += 1
        self._add_audit(
            workspace_id=leave.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="hr.leave.cancel",
            target_type="hr_leave_request",
            target_id=leave.id,
            request_id=request_id,
            details={"version": leave.version},
        )
        self._session.flush()
        return leave

    @staticmethod
    def _debt_paid_expression() -> ScalarSelect[Decimal]:
        return (
            select(func.coalesce(func.sum(EmployeeDebtPayment.amount), Decimal("0")))
            .where(
                EmployeeDebtPayment.workspace_id == EmployeeDebt.workspace_id,
                EmployeeDebtPayment.debt_id == EmployeeDebt.id,
            )
            .correlate(EmployeeDebt)
            .scalar_subquery()
        )

    def list_debts(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        search: str | None,
        employee_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
    ) -> DebtPage:
        query = (
            select(EmployeeDebt)
            .join(Employee, Employee.id == EmployeeDebt.employee_id)
            .where(
                EmployeeDebt.workspace_id == workspace_id,
                EmployeeDebt.employee_id.in_(
                    self._visible_employee_ids(workspace_id, allowed_branch_ids)
                ),
            )
        )
        if employee_id is not None:
            query = query.where(EmployeeDebt.employee_id == employee_id)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    Employee.normalized_name.ilike(pattern),
                    EmployeeDebt.concept.ilike(pattern),
                    EmployeeDebt.client_name.ilike(pattern),
                )
            )
        paid = self._debt_paid_expression()
        if status == "pagado":
            query = query.where(paid >= EmployeeDebt.amount)
        elif status == "parcial":
            query = query.where(paid > 0, paid < EmployeeDebt.amount)
        elif status == "pendiente":
            query = query.where(paid <= 0)
        total_items = int(
            self._session.scalar(select(func.count()).select_from(query.subquery())) or 0
        )
        debts = self._session.scalars(
            query.order_by(EmployeeDebt.created_at.desc(), EmployeeDebt.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return DebtPage(self._debt_records(debts), total_items)

    def all_visible_debts(
        self,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> tuple[DebtRecord, ...]:
        debts = self._session.scalars(
            select(EmployeeDebt).where(
                EmployeeDebt.workspace_id == workspace_id,
                EmployeeDebt.employee_id.in_(
                    self._visible_employee_ids(workspace_id, allowed_branch_ids)
                ),
            )
        ).all()
        return self._debt_records(debts)

    def get_debt(
        self,
        workspace_id: UUID,
        debt_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        *,
        for_update: bool = False,
    ) -> EmployeeDebt | None:
        query = select(EmployeeDebt).where(
            EmployeeDebt.workspace_id == workspace_id,
            EmployeeDebt.id == debt_id,
            EmployeeDebt.employee_id.in_(
                self._visible_employee_ids(workspace_id, allowed_branch_ids)
            ),
        )
        if for_update:
            query = query.with_for_update(of=EmployeeDebt)
        return self._session.scalar(query.limit(1))

    def debt_record(self, debt: EmployeeDebt) -> DebtRecord:
        return self._debt_records([debt])[0]

    def debt_by_idempotency_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> EmployeeDebt | None:
        return self._session.scalar(
            select(EmployeeDebt).where(
                EmployeeDebt.workspace_id == workspace_id,
                EmployeeDebt.idempotency_key == idempotency_key,
            )
        )

    def create_debt(
        self,
        *,
        workspace_id: UUID,
        employee_id: UUID,
        concept: str,
        client_name: str | None,
        amount: Decimal,
        idempotency_key: str,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> EmployeeDebt:
        debt = EmployeeDebt(
            workspace_id=workspace_id,
            employee_id=employee_id,
            concept=concept,
            client_name=client_name,
            amount=amount,
            idempotency_key=idempotency_key,
            created_by_platform_user_id=actor_platform_user_id,
        )
        self._session.add(debt)
        self._session.flush()
        self._add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="hr.debt.create",
            target_type="employee_debt",
            target_id=debt.id,
            request_id=request_id,
            details={"employeeId": str(employee_id), "amount": str(amount)},
        )
        self._session.flush()
        return debt

    def payment_by_idempotency_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> EmployeeDebtPayment | None:
        return self._session.scalar(
            select(EmployeeDebtPayment).where(
                EmployeeDebtPayment.workspace_id == workspace_id,
                EmployeeDebtPayment.idempotency_key == idempotency_key,
            )
        )

    def create_payment(
        self,
        *,
        debt: EmployeeDebt,
        amount: Decimal,
        paid_on: date,
        idempotency_key: str,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> EmployeeDebtPayment:
        payment = EmployeeDebtPayment(
            workspace_id=debt.workspace_id,
            debt_id=debt.id,
            amount=amount,
            paid_on=paid_on,
            idempotency_key=idempotency_key,
            received_by_platform_user_id=actor_platform_user_id,
        )
        self._session.add(payment)
        debt.version += 1
        self._session.flush()
        self._add_audit(
            workspace_id=debt.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="hr.debt.payment.create",
            target_type="employee_debt",
            target_id=debt.id,
            request_id=request_id,
            details={"paymentId": str(payment.id), "amount": str(amount)},
        )
        self._session.flush()
        return payment

    def _debt_records(self, debts: Sequence[EmployeeDebt]) -> tuple[DebtRecord, ...]:
        if not debts:
            return ()
        ids = {debt.id for debt in debts}
        payments_by_debt: dict[UUID, list[EmployeeDebtPayment]] = defaultdict(list)
        for payment in self._session.scalars(
            select(EmployeeDebtPayment)
            .where(EmployeeDebtPayment.debt_id.in_(ids))
            .order_by(EmployeeDebtPayment.paid_on, EmployeeDebtPayment.created_at)
        ):
            payments_by_debt[payment.debt_id].append(payment)
        return tuple(DebtRecord(debt, tuple(payments_by_debt.get(debt.id, []))) for debt in debts)

    def list_documents(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        employee_id: UUID | None,
        template_id: str | None,
        page: int,
        page_size: int,
    ) -> DocumentPage:
        query = select(HrDocumentRecord).where(
            HrDocumentRecord.workspace_id == workspace_id,
            HrDocumentRecord.employee_id.in_(
                self._visible_employee_ids(workspace_id, allowed_branch_ids)
            ),
        )
        if employee_id is not None:
            query = query.where(HrDocumentRecord.employee_id == employee_id)
        if template_id is not None:
            query = query.where(HrDocumentRecord.template_id == template_id)
        total_items = int(
            self._session.scalar(select(func.count()).select_from(query.subquery())) or 0
        )
        rows = self._session.scalars(
            query.order_by(HrDocumentRecord.created_at.desc(), HrDocumentRecord.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return DocumentPage(tuple(rows), total_items)

    def document_by_idempotency_key(
        self, workspace_id: UUID, idempotency_key: str
    ) -> HrDocumentRecord | None:
        return self._session.scalar(
            select(HrDocumentRecord).where(
                HrDocumentRecord.workspace_id == workspace_id,
                HrDocumentRecord.idempotency_key == idempotency_key,
            )
        )

    def create_document(
        self,
        *,
        workspace_id: UUID,
        employee_id: UUID,
        template_id: str,
        issue_date: date,
        include_salary: bool,
        reference_code: str,
        snapshot: dict[str, object],
        idempotency_key: str,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> HrDocumentRecord:
        document = HrDocumentRecord(
            workspace_id=workspace_id,
            employee_id=employee_id,
            template_id=template_id,
            issue_date=issue_date,
            include_salary=include_salary,
            reference_code=reference_code,
            snapshot=snapshot,
            idempotency_key=idempotency_key,
            created_by_platform_user_id=actor_platform_user_id,
        )
        self._session.add(document)
        self._session.flush()
        self._add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="hr.document.create",
            target_type="hr_document",
            target_id=document.id,
            request_id=request_id,
            details={"employeeId": str(employee_id), "templateId": template_id},
        )
        self._session.flush()
        return document

    def employee_counts(
        self,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> tuple[int, int]:
        visible = self._visible_employee_ids(workspace_id, allowed_branch_ids).subquery()
        total = int(self._session.scalar(select(func.count()).select_from(visible)) or 0)
        active = int(
            self._session.scalar(
                select(func.count(Employee.id)).where(
                    Employee.workspace_id == workspace_id,
                    Employee.status == "active",
                    Employee.id.in_(select(visible.c.id)),
                )
            )
            or 0
        )
        return total, active

    def leave_count(
        self,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        status: str,
    ) -> int:
        return int(
            self._session.scalar(
                select(func.count(HrLeaveRequest.id)).where(
                    HrLeaveRequest.workspace_id == workspace_id,
                    HrLeaveRequest.status == status,
                    HrLeaveRequest.employee_id.in_(
                        self._visible_employee_ids(workspace_id, allowed_branch_ids)
                    ),
                )
            )
            or 0
        )

    def _add_audit(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        action: str,
        target_type: str,
        target_id: UUID,
        request_id: str,
        details: dict[str, object],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=actor_platform_user_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=request_id,
                details=details,
            )
        )
