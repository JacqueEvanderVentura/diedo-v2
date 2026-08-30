from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, cast
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    Attachment,
    AuditEntry,
    Branch,
    Customer,
    CustomerBranchAssignment,
    Employee,
    EmployeeBranchAssignment,
    EmployeeHrProfile,
    EmployeeSchedule,
    EmployeeSupervisor,
    WorkspaceMembership,
)


@dataclass(frozen=True)
class BranchRecord:
    id: UUID
    code: str
    name: str


@dataclass(frozen=True)
class ScheduleRecord:
    timezone: str
    weekly_schedule: dict[str, Any]
    version: int
    updated_at: datetime


@dataclass(frozen=True)
class CustomerRecord:
    id: UUID
    customer_type: str
    display_name: str
    first_name: str | None
    last_name: str | None
    business_name: str | None
    email: str | None
    phone: str | None
    branches: tuple[BranchRecord, ...]
    status: str
    version: int
    attachment_count: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class EmployeeRecord:
    id: UUID
    employee_number: str
    first_name: str
    last_name: str
    email: str | None
    phone: str | None
    position: str
    department: str | None
    contract_type: str | None
    hire_date: date
    platform_user_id: UUID | None
    branches: tuple[BranchRecord, ...]
    supervisor_ids: tuple[UUID, ...]
    schedule: ScheduleRecord
    status: str
    version: int
    attachment_count: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class AttachmentRecord:
    id: UUID
    original_filename: str
    storage_key: str
    content_type: str
    size_bytes: int
    checksum_sha256: str
    classification: str
    retention_until: date | None
    created_at: datetime


@dataclass(frozen=True)
class TimelineRecord:
    id: UUID
    action: str
    occurred_at: datetime


@dataclass(frozen=True)
class CustomerPage:
    items: tuple[CustomerRecord, ...]
    total_items: int


@dataclass(frozen=True)
class EmployeePage:
    items: tuple[EmployeeRecord, ...]
    total_items: int


class MasterDataRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_customers(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        search: str | None,
        name: str | None,
        phone: str | None,
        email: str | None,
        customer_type: str | None,
        status: str | None,
        branch_id: UUID | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> CustomerPage:
        query = (
            select(Customer)
            .join(
                CustomerBranchAssignment,
                (CustomerBranchAssignment.workspace_id == Customer.workspace_id)
                & (CustomerBranchAssignment.customer_id == Customer.id),
            )
            .where(
                Customer.workspace_id == workspace_id,
                CustomerBranchAssignment.status == "active",
            )
            .distinct()
        )
        if allowed_branch_ids is not None:
            query = query.where(CustomerBranchAssignment.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            query = query.where(CustomerBranchAssignment.branch_id == branch_id)
        if status is None:
            query = query.where(Customer.status != "archived")
        else:
            query = query.where(Customer.status == status)
        if customer_type is not None:
            query = query.where(Customer.customer_type == customer_type)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    Customer.normalized_name.ilike(pattern),
                    Customer.normalized_email.ilike(pattern),
                    Customer.normalized_phone.ilike(pattern),
                )
            )
        if name:
            query = query.where(Customer.normalized_name.ilike(f"%{name}%"))
        if phone:
            query = query.where(Customer.normalized_phone.ilike(f"%{phone}%"))
        if email:
            query = query.where(Customer.normalized_email.ilike(f"%{email}%"))

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total_items = int(self._session.scalar(count_query) or 0)
        sort_columns = {
            "name": Customer.normalized_name,
            "status": Customer.status,
            "createdAt": Customer.created_at,
            "updatedAt": Customer.updated_at,
        }
        sort_column = sort_columns[sort_by]
        order = sort_column.desc() if sort_direction == "desc" else sort_column.asc()
        rows = self._session.scalars(
            query.order_by(order, Customer.id).offset((page - 1) * page_size).limit(page_size)
        ).all()
        return CustomerPage(self._customer_records(rows), total_items)

    def get_customer(
        self,
        workspace_id: UUID,
        customer_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> Customer | None:
        query = (
            select(Customer)
            .join(
                CustomerBranchAssignment,
                (CustomerBranchAssignment.workspace_id == Customer.workspace_id)
                & (CustomerBranchAssignment.customer_id == Customer.id),
            )
            .where(
                Customer.workspace_id == workspace_id,
                Customer.id == customer_id,
                CustomerBranchAssignment.status == "active",
            )
        )
        if allowed_branch_ids is not None:
            query = query.where(CustomerBranchAssignment.branch_id.in_(allowed_branch_ids))
        return self._session.scalar(query.limit(1))

    def customer_record(self, customer: Customer) -> CustomerRecord:
        return self._customer_records([customer])[0]

    def create_customer(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        values: dict[str, object],
        branch_ids: set[UUID],
        request_id: str,
    ) -> CustomerRecord:
        customer = Customer(
            workspace_id=workspace_id,
            created_by_platform_user_id=actor_platform_user_id,
            updated_by_platform_user_id=actor_platform_user_id,
            **values,
        )
        self._session.add(customer)
        self._session.flush()
        self._session.add_all(
            CustomerBranchAssignment(
                workspace_id=workspace_id,
                customer_id=customer.id,
                branch_id=branch_id,
                status="active",
            )
            for branch_id in sorted(branch_ids)
        )
        self._add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="master_data.customer.create",
            target_type="customer",
            target_id=customer.id,
            request_id=request_id,
            details={"branchIds": [str(value) for value in sorted(branch_ids)]},
        )
        self._session.flush()
        return self.customer_record(customer)

    def update_customer(
        self,
        *,
        customer: Customer,
        changes: dict[str, object],
        branch_ids: set[UUID] | None,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> CustomerRecord:
        for field in (
            "customer_type",
            "display_name",
            "normalized_name",
            "first_name",
            "last_name",
            "business_name",
            "email",
            "normalized_email",
            "phone",
            "normalized_phone",
            "status",
        ):
            if field in changes:
                setattr(customer, field, changes[field])
        if branch_ids is not None:
            self._replace_customer_branches(customer.workspace_id, customer.id, branch_ids)
        customer.updated_by_platform_user_id = actor_platform_user_id
        customer.version += 1
        changed_fields = set(changes)
        changed_fields.discard("normalized_name")
        changed_fields.discard("normalized_email")
        changed_fields.discard("normalized_phone")
        if branch_ids is not None:
            changed_fields.add("branchIds")
        self._add_audit(
            workspace_id=customer.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="master_data.customer.update",
            target_type="customer",
            target_id=customer.id,
            request_id=request_id,
            details={"changedFields": sorted(changed_fields), "version": customer.version},
        )
        self._session.flush()
        return self.customer_record(customer)

    def customer_timeline(
        self, workspace_id: UUID, customer_id: UUID
    ) -> tuple[TimelineRecord, ...]:
        rows = self._session.scalars(
            select(AuditEntry)
            .where(
                AuditEntry.workspace_id == workspace_id,
                AuditEntry.target_type == "customer",
                AuditEntry.target_id == customer_id,
                AuditEntry.outcome == "success",
            )
            .order_by(AuditEntry.occurred_at.desc(), AuditEntry.id.desc())
        ).all()
        return tuple(TimelineRecord(row.id, row.action, row.occurred_at) for row in rows)

    def list_employees(
        self,
        *,
        workspace_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
        search: str | None,
        status: str | None,
        branch_id: UUID | None,
        department: str | None,
        page: int,
        page_size: int,
        sort_by: str,
        sort_direction: str,
    ) -> EmployeePage:
        query = (
            select(Employee)
            .join(
                EmployeeBranchAssignment,
                (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                & (EmployeeBranchAssignment.employee_id == Employee.id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                EmployeeBranchAssignment.status == "active",
            )
            .distinct()
        )
        if allowed_branch_ids is not None:
            query = query.where(EmployeeBranchAssignment.branch_id.in_(allowed_branch_ids))
        if branch_id is not None:
            query = query.where(EmployeeBranchAssignment.branch_id == branch_id)
        if status is None:
            query = query.where(Employee.status != "archived")
        else:
            query = query.where(Employee.status == status)
        if department:
            query = query.where(Employee.department.ilike(f"%{department}%"))
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(
                    Employee.normalized_name.ilike(pattern),
                    Employee.employee_number.ilike(pattern),
                    Employee.normalized_email.ilike(pattern),
                    Employee.normalized_phone.ilike(pattern),
                    Employee.position.ilike(pattern),
                )
            )
        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total_items = int(self._session.scalar(count_query) or 0)
        sort_columns = {
            "name": Employee.normalized_name,
            "employeeNumber": Employee.employee_number,
            "status": Employee.status,
            "createdAt": Employee.created_at,
            "updatedAt": Employee.updated_at,
        }
        sort_column = sort_columns[sort_by]
        order = sort_column.desc() if sort_direction == "desc" else sort_column.asc()
        rows = self._session.scalars(
            query.order_by(order, Employee.id).offset((page - 1) * page_size).limit(page_size)
        ).all()
        return EmployeePage(self._employee_records(rows), total_items)

    def get_employee(
        self,
        workspace_id: UUID,
        employee_id: UUID,
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> Employee | None:
        query = (
            select(Employee)
            .join(
                EmployeeBranchAssignment,
                (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                & (EmployeeBranchAssignment.employee_id == Employee.id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                Employee.id == employee_id,
                EmployeeBranchAssignment.status == "active",
            )
        )
        if allowed_branch_ids is not None:
            query = query.where(EmployeeBranchAssignment.branch_id.in_(allowed_branch_ids))
        return self._session.scalar(query.limit(1))

    def employee_record(self, employee: Employee) -> EmployeeRecord:
        return self._employee_records([employee])[0]

    def create_employee(
        self,
        *,
        workspace_id: UUID,
        actor_platform_user_id: UUID,
        values: dict[str, object],
        branch_ids: set[UUID],
        supervisor_ids: set[UUID],
        timezone: str,
        weekly_schedule: dict[str, Any],
        request_id: str,
    ) -> EmployeeRecord:
        employee = Employee(
            workspace_id=workspace_id,
            created_by_platform_user_id=actor_platform_user_id,
            updated_by_platform_user_id=actor_platform_user_id,
            **values,
        )
        self._session.add(employee)
        self._session.flush()
        self._session.add_all(
            EmployeeBranchAssignment(
                workspace_id=workspace_id,
                employee_id=employee.id,
                branch_id=branch_id,
                status="active",
            )
            for branch_id in sorted(branch_ids)
        )
        self._session.add_all(
            EmployeeSupervisor(
                workspace_id=workspace_id,
                employee_id=employee.id,
                supervisor_employee_id=supervisor_id,
                status="active",
            )
            for supervisor_id in sorted(supervisor_ids)
        )
        self._session.add(
            EmployeeSchedule(
                workspace_id=workspace_id,
                employee_id=employee.id,
                timezone=timezone,
                weekly_schedule=weekly_schedule,
                updated_by_platform_user_id=actor_platform_user_id,
            )
        )
        self._session.add(
            EmployeeHrProfile(
                workspace_id=workspace_id,
                employee_id=employee.id,
                updated_by_platform_user_id=actor_platform_user_id,
            )
        )
        self._add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="master_data.employee.create",
            target_type="employee",
            target_id=employee.id,
            request_id=request_id,
            details={"branchIds": [str(value) for value in sorted(branch_ids)]},
        )
        self._session.flush()
        return self.employee_record(employee)

    def update_employee(
        self,
        *,
        employee: Employee,
        changes: dict[str, object],
        branch_ids: set[UUID] | None,
        supervisor_ids: set[UUID] | None,
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> EmployeeRecord:
        for field in (
            "employee_number",
            "first_name",
            "last_name",
            "normalized_name",
            "email",
            "normalized_email",
            "phone",
            "normalized_phone",
            "position",
            "department",
            "contract_type",
            "hire_date",
            "platform_user_id",
            "status",
        ):
            if field in changes:
                setattr(employee, field, changes[field])
        if branch_ids is not None:
            self._replace_employee_branches(employee.workspace_id, employee.id, branch_ids)
        if supervisor_ids is not None:
            self._replace_supervisors(employee.workspace_id, employee.id, supervisor_ids)
        employee.updated_by_platform_user_id = actor_platform_user_id
        employee.version += 1
        changed_fields = set(changes)
        changed_fields -= {"normalized_name", "normalized_email", "normalized_phone"}
        if branch_ids is not None:
            changed_fields.add("branchIds")
        if supervisor_ids is not None:
            changed_fields.add("supervisorIds")
        self._add_audit(
            workspace_id=employee.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="master_data.employee.update",
            target_type="employee",
            target_id=employee.id,
            request_id=request_id,
            details={"changedFields": sorted(changed_fields), "version": employee.version},
        )
        self._session.flush()
        return self.employee_record(employee)

    def get_schedule(self, workspace_id: UUID, employee_id: UUID) -> EmployeeSchedule | None:
        return self._session.scalar(
            select(EmployeeSchedule).where(
                EmployeeSchedule.workspace_id == workspace_id,
                EmployeeSchedule.employee_id == employee_id,
            )
        )

    def update_schedule(
        self,
        *,
        schedule: EmployeeSchedule,
        timezone: str,
        weekly_schedule: dict[str, Any],
        actor_platform_user_id: UUID,
        request_id: str,
    ) -> ScheduleRecord:
        schedule.timezone = timezone
        schedule.weekly_schedule = weekly_schedule
        schedule.updated_by_platform_user_id = actor_platform_user_id
        schedule.version += 1
        self._add_audit(
            workspace_id=schedule.workspace_id,
            actor_platform_user_id=actor_platform_user_id,
            action="master_data.employee.schedule.update",
            target_type="employee",
            target_id=schedule.employee_id,
            request_id=request_id,
            details={"version": schedule.version},
        )
        self._session.flush()
        return self.schedule_record(schedule)

    def branches_exist(self, workspace_id: UUID, branch_ids: set[UUID]) -> bool:
        if not branch_ids:
            return False
        count = self._session.scalar(
            select(func.count(Branch.id)).where(
                Branch.workspace_id == workspace_id,
                Branch.id.in_(branch_ids),
                Branch.status == "active",
            )
        )
        return int(count or 0) == len(branch_ids)

    def employees_exist_and_visible(
        self,
        workspace_id: UUID,
        employee_ids: set[UUID],
        allowed_branch_ids: frozenset[UUID] | None,
    ) -> bool:
        if not employee_ids:
            return True
        query = (
            select(func.count(func.distinct(Employee.id)))
            .join(
                EmployeeBranchAssignment,
                (EmployeeBranchAssignment.workspace_id == Employee.workspace_id)
                & (EmployeeBranchAssignment.employee_id == Employee.id),
            )
            .where(
                Employee.workspace_id == workspace_id,
                Employee.id.in_(employee_ids),
                Employee.status != "archived",
                EmployeeBranchAssignment.status == "active",
            )
        )
        if allowed_branch_ids is not None:
            query = query.where(EmployeeBranchAssignment.branch_id.in_(allowed_branch_ids))
        return int(self._session.scalar(query) or 0) == len(employee_ids)

    def platform_user_is_workspace_member(self, workspace_id: UUID, platform_user_id: UUID) -> bool:
        return (
            self._session.scalar(
                select(WorkspaceMembership.id).where(
                    WorkspaceMembership.workspace_id == workspace_id,
                    WorkspaceMembership.platform_user_id == platform_user_id,
                    WorkspaceMembership.status.in_(("active", "invited")),
                )
            )
            is not None
        )

    def employee_number_exists(
        self, workspace_id: UUID, employee_number: str, exclude_id: UUID | None = None
    ) -> bool:
        query = select(Employee.id).where(
            Employee.workspace_id == workspace_id,
            Employee.employee_number == employee_number,
        )
        if exclude_id is not None:
            query = query.where(Employee.id != exclude_id)
        return self._session.scalar(query) is not None

    def platform_user_link_exists(
        self, workspace_id: UUID, platform_user_id: UUID, exclude_id: UUID | None = None
    ) -> bool:
        query = select(Employee.id).where(
            Employee.workspace_id == workspace_id,
            Employee.platform_user_id == platform_user_id,
        )
        if exclude_id is not None:
            query = query.where(Employee.id != exclude_id)
        return self._session.scalar(query) is not None

    def list_attachments(
        self, workspace_id: UUID, owner_type: str, owner_id: UUID
    ) -> tuple[AttachmentRecord, ...]:
        owner_column = (
            Attachment.customer_id if owner_type == "customer" else Attachment.employee_id
        )
        rows = self._session.scalars(
            select(Attachment)
            .where(Attachment.workspace_id == workspace_id, owner_column == owner_id)
            .order_by(Attachment.created_at.desc(), Attachment.id.desc())
        ).all()
        return tuple(self._attachment_record(row) for row in rows)

    def create_attachment(
        self,
        *,
        workspace_id: UUID,
        owner_type: str,
        owner_id: UUID,
        uploader_platform_user_id: UUID,
        original_filename: str,
        storage_key: str,
        content_type: str,
        size_bytes: int,
        checksum_sha256: str,
        classification: str,
        retention_until: date | None,
        request_id: str,
    ) -> AttachmentRecord:
        owner_values = (
            {"customer_id": owner_id, "employee_id": None}
            if owner_type == "customer"
            else {"customer_id": None, "employee_id": owner_id}
        )
        attachment = Attachment(
            workspace_id=workspace_id,
            uploaded_by_platform_user_id=uploader_platform_user_id,
            original_filename=original_filename,
            storage_key=storage_key,
            content_type=content_type,
            size_bytes=size_bytes,
            checksum_sha256=checksum_sha256,
            classification=classification,
            retention_until=retention_until,
            **owner_values,
        )
        self._session.add(attachment)
        self._session.flush()
        self._add_audit(
            workspace_id=workspace_id,
            actor_platform_user_id=uploader_platform_user_id,
            action=f"master_data.{owner_type}.attachment.create",
            target_type="attachment",
            target_id=attachment.id,
            request_id=request_id,
            details={
                "ownerType": owner_type,
                "ownerId": str(owner_id),
                "contentType": content_type,
                "sizeBytes": size_bytes,
                "classification": classification,
            },
        )
        self._session.flush()
        return self._attachment_record(attachment)

    def get_attachment(
        self,
        workspace_id: UUID,
        owner_type: str,
        owner_id: UUID,
        attachment_id: UUID,
    ) -> AttachmentRecord | None:
        owner_column = (
            Attachment.customer_id if owner_type == "customer" else Attachment.employee_id
        )
        row = self._session.scalar(
            select(Attachment).where(
                Attachment.workspace_id == workspace_id,
                Attachment.id == attachment_id,
                owner_column == owner_id,
            )
        )
        return self._attachment_record(row) if row is not None else None

    def _customer_records(self, customers: Sequence[Customer]) -> tuple[CustomerRecord, ...]:
        ids = {customer.id for customer in customers}
        branches = self._customer_branches(ids)
        counts = self._attachment_counts("customer", ids)
        return tuple(
            CustomerRecord(
                id=customer.id,
                customer_type=customer.customer_type,
                display_name=customer.display_name,
                first_name=customer.first_name,
                last_name=customer.last_name,
                business_name=customer.business_name,
                email=customer.email,
                phone=customer.phone,
                branches=branches.get(customer.id, ()),
                status=customer.status,
                version=customer.version,
                attachment_count=counts.get(customer.id, 0),
                created_at=customer.created_at,
                updated_at=customer.updated_at,
            )
            for customer in customers
        )

    def _employee_records(self, employees: Sequence[Employee]) -> tuple[EmployeeRecord, ...]:
        ids = {employee.id for employee in employees}
        branches = self._employee_branches(ids)
        supervisors = self._supervisor_ids(ids)
        schedules = self._schedules(ids)
        counts = self._attachment_counts("employee", ids)
        return tuple(
            EmployeeRecord(
                id=employee.id,
                employee_number=employee.employee_number,
                first_name=employee.first_name,
                last_name=employee.last_name,
                email=employee.email,
                phone=employee.phone,
                position=employee.position,
                department=employee.department,
                contract_type=employee.contract_type,
                hire_date=employee.hire_date,
                platform_user_id=employee.platform_user_id,
                branches=branches.get(employee.id, ()),
                supervisor_ids=supervisors.get(employee.id, ()),
                schedule=schedules[employee.id],
                status=employee.status,
                version=employee.version,
                attachment_count=counts.get(employee.id, 0),
                created_at=employee.created_at,
                updated_at=employee.updated_at,
            )
            for employee in employees
        )

    def _customer_branches(self, customer_ids: set[UUID]) -> dict[UUID, tuple[BranchRecord, ...]]:
        if not customer_ids:
            return {}
        rows = self._session.execute(
            select(CustomerBranchAssignment.customer_id, Branch.id, Branch.code, Branch.name)
            .join(
                Branch,
                (Branch.workspace_id == CustomerBranchAssignment.workspace_id)
                & (Branch.id == CustomerBranchAssignment.branch_id),
            )
            .where(
                CustomerBranchAssignment.customer_id.in_(customer_ids),
                CustomerBranchAssignment.status == "active",
            )
            .order_by(Branch.name, Branch.id)
        )
        result: defaultdict[UUID, list[BranchRecord]] = defaultdict(list)
        for customer_id, branch_id, code, name in rows:
            result[customer_id].append(BranchRecord(branch_id, code, name))
        return {key: tuple(value) for key, value in result.items()}

    def _employee_branches(self, employee_ids: set[UUID]) -> dict[UUID, tuple[BranchRecord, ...]]:
        if not employee_ids:
            return {}
        rows = self._session.execute(
            select(EmployeeBranchAssignment.employee_id, Branch.id, Branch.code, Branch.name)
            .join(
                Branch,
                (Branch.workspace_id == EmployeeBranchAssignment.workspace_id)
                & (Branch.id == EmployeeBranchAssignment.branch_id),
            )
            .where(
                EmployeeBranchAssignment.employee_id.in_(employee_ids),
                EmployeeBranchAssignment.status == "active",
            )
            .order_by(Branch.name, Branch.id)
        )
        result: defaultdict[UUID, list[BranchRecord]] = defaultdict(list)
        for employee_id, branch_id, code, name in rows:
            result[employee_id].append(BranchRecord(branch_id, code, name))
        return {key: tuple(value) for key, value in result.items()}

    def _supervisor_ids(self, employee_ids: set[UUID]) -> dict[UUID, tuple[UUID, ...]]:
        if not employee_ids:
            return {}
        rows = self._session.execute(
            select(EmployeeSupervisor.employee_id, EmployeeSupervisor.supervisor_employee_id)
            .where(
                EmployeeSupervisor.employee_id.in_(employee_ids),
                EmployeeSupervisor.status == "active",
            )
            .order_by(EmployeeSupervisor.supervisor_employee_id)
        )
        result: defaultdict[UUID, list[UUID]] = defaultdict(list)
        for employee_id, supervisor_id in rows:
            result[employee_id].append(supervisor_id)
        return {key: tuple(value) for key, value in result.items()}

    def _schedules(self, employee_ids: set[UUID]) -> dict[UUID, ScheduleRecord]:
        if not employee_ids:
            return {}
        rows = self._session.scalars(
            select(EmployeeSchedule).where(EmployeeSchedule.employee_id.in_(employee_ids))
        ).all()
        return {row.employee_id: self.schedule_record(row) for row in rows}

    def _attachment_counts(self, owner_type: str, owner_ids: set[UUID]) -> dict[UUID, int]:
        if not owner_ids:
            return {}
        owner_column = (
            Attachment.customer_id if owner_type == "customer" else Attachment.employee_id
        )
        rows = self._session.execute(
            select(owner_column, func.count(Attachment.id))
            .where(owner_column.in_(owner_ids))
            .group_by(owner_column)
        )
        return {cast(UUID, owner_id): int(count) for owner_id, count in rows}

    def _replace_customer_branches(
        self, workspace_id: UUID, customer_id: UUID, branch_ids: set[UUID]
    ) -> None:
        assignments = self._session.scalars(
            select(CustomerBranchAssignment).where(
                CustomerBranchAssignment.workspace_id == workspace_id,
                CustomerBranchAssignment.customer_id == customer_id,
            )
        ).all()
        by_branch = {assignment.branch_id: assignment for assignment in assignments}
        for assigned_id, assignment in by_branch.items():
            assignment.status = "active" if assigned_id in branch_ids else "inactive"
        self._session.add_all(
            CustomerBranchAssignment(
                workspace_id=workspace_id,
                customer_id=customer_id,
                branch_id=branch_id,
                status="active",
            )
            for branch_id in sorted(branch_ids - by_branch.keys())
        )

    def _replace_employee_branches(
        self, workspace_id: UUID, employee_id: UUID, branch_ids: set[UUID]
    ) -> None:
        assignments = self._session.scalars(
            select(EmployeeBranchAssignment).where(
                EmployeeBranchAssignment.workspace_id == workspace_id,
                EmployeeBranchAssignment.employee_id == employee_id,
            )
        ).all()
        by_branch = {assignment.branch_id: assignment for assignment in assignments}
        for assigned_id, assignment in by_branch.items():
            assignment.status = "active" if assigned_id in branch_ids else "inactive"
        self._session.add_all(
            EmployeeBranchAssignment(
                workspace_id=workspace_id,
                employee_id=employee_id,
                branch_id=branch_id,
                status="active",
            )
            for branch_id in sorted(branch_ids - by_branch.keys())
        )

    def _replace_supervisors(
        self, workspace_id: UUID, employee_id: UUID, supervisor_ids: set[UUID]
    ) -> None:
        assignments = self._session.scalars(
            select(EmployeeSupervisor).where(
                EmployeeSupervisor.workspace_id == workspace_id,
                EmployeeSupervisor.employee_id == employee_id,
            )
        ).all()
        by_supervisor = {
            assignment.supervisor_employee_id: assignment for assignment in assignments
        }
        for supervisor_id, assignment in by_supervisor.items():
            assignment.status = "active" if supervisor_id in supervisor_ids else "inactive"
        self._session.add_all(
            EmployeeSupervisor(
                workspace_id=workspace_id,
                employee_id=employee_id,
                supervisor_employee_id=supervisor_id,
                status="active",
            )
            for supervisor_id in sorted(supervisor_ids - by_supervisor.keys())
        )

    @staticmethod
    def schedule_record(schedule: EmployeeSchedule) -> ScheduleRecord:
        return ScheduleRecord(
            timezone=schedule.timezone,
            weekly_schedule=schedule.weekly_schedule,
            version=schedule.version,
            updated_at=schedule.updated_at,
        )

    @staticmethod
    def _attachment_record(attachment: Attachment) -> AttachmentRecord:
        return AttachmentRecord(
            id=attachment.id,
            original_filename=attachment.original_filename,
            storage_key=attachment.storage_key,
            content_type=attachment.content_type,
            size_bytes=attachment.size_bytes,
            checksum_sha256=attachment.checksum_sha256,
            classification=attachment.classification,
            retention_until=attachment.retention_until,
            created_at=attachment.created_at,
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
