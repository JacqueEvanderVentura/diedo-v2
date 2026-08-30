from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import (
    AccessScope,
    Branch,
    Customer,
    CustomerBranchAssignment,
    DemoSeedRegistry,
    Employee,
    EmployeeBranchAssignment,
    EmployeeSchedule,
    EmployeeSupervisor,
    PaymentMethod,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    WorkspaceMembership,
)
from app.services.demo_manifest import DemoBundle, DemoEmployeeFixture, load_demo_bundle
from app.services.local_bootstrap import bootstrap_local_foundation

_DEMO_NAMESPACE = UUID("0b995e4e-d36a-5a4f-82b7-84a536c9fa59")


@dataclass(frozen=True)
class DemoSeedSummary:
    enabled: bool
    seed_version: str
    workspace_id: UUID | None
    branch_count: int
    demo_user_count: int
    payment_method_count: int
    customer_count: int = 0
    employee_count: int = 0


def seed_demo_data(
    session: Session,
    password_hash: str | None,
    *,
    enabled: bool | None = None,
) -> DemoSeedSummary:
    should_seed = settings.demo_seed_enabled if enabled is None else enabled
    bundle = load_demo_bundle()
    if not should_seed:
        return DemoSeedSummary(False, bundle.manifest.seed_version, None, 0, 0, 0, 0, 0)
    if settings.app_env not in {"development", "test"}:
        raise RuntimeError("Demo seeding is disabled outside development and test.")
    if password_hash is None:
        raise RuntimeError("A local demo password is required when demo seeding is enabled.")

    foundation = bootstrap_local_foundation(session, password_hash)
    _seed_role_permissions(session, bundle, foundation.workspace_id)
    branches = _seed_branches(
        session,
        bundle,
        foundation.workspace_id,
        foundation.legal_entity_id,
    )
    _seed_users(session, bundle, foundation.workspace_id, branches, password_hash)
    _seed_payment_methods(session, bundle, foundation.workspace_id)
    _seed_customers(session, bundle, foundation.workspace_id, branches)
    _seed_employees(session, bundle, foundation.workspace_id, branches)
    return DemoSeedSummary(
        True,
        bundle.manifest.seed_version,
        foundation.workspace_id,
        len(branches),
        len(bundle.iam.users),
        len(bundle.configuration.payment_methods),
        len(bundle.customers.items),
        len(bundle.employees.items),
    )


def _seed_customers(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> None:
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    for fixture in bundle.customers.items:
        payload = fixture.model_dump(mode="json")
        customer_id = _stable_id(bundle.manifest.seed_version, "customer", fixture.seed_key)
        customer = _registered_entity(
            session,
            workspace_id,
            "customer",
            fixture.seed_key,
            customer_id,
            payload,
            Customer,
        )
        normalized_email = str(fixture.email).casefold() if fixture.email else None
        normalized_phone = (
            "".join(character for character in fixture.phone if character.isdigit())
            if fixture.phone
            else None
        )
        if customer is None:
            customer = Customer(
                id=customer_id,
                workspace_id=workspace_id,
                customer_type=fixture.customer_type,
                display_name=fixture.display_name,
                normalized_name=fixture.display_name.casefold(),
                first_name=fixture.first_name,
                last_name=fixture.last_name,
                business_name=fixture.business_name,
                email=str(fixture.email) if fixture.email else None,
                normalized_email=normalized_email,
                phone=fixture.phone,
                normalized_phone=normalized_phone,
                status=fixture.status,
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            session.add(customer)
            session.flush()
            _register(
                session,
                workspace_id,
                "customer",
                fixture.seed_key,
                customer_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            customer.customer_type = fixture.customer_type
            customer.display_name = fixture.display_name
            customer.normalized_name = fixture.display_name.casefold()
            customer.first_name = fixture.first_name
            customer.last_name = fixture.last_name
            customer.business_name = fixture.business_name
            customer.email = str(fixture.email) if fixture.email else None
            customer.normalized_email = normalized_email
            customer.phone = fixture.phone
            customer.normalized_phone = normalized_phone
            customer.status = fixture.status
            customer.updated_by_platform_user_id = actor_id
        _sync_customer_branches(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            customer,
            branches,
            fixture.branch_codes,
        )
    session.flush()


def _sync_customer_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    customer_seed_key: str,
    customer: Customer,
    branches: dict[str, Branch],
    branch_codes: list[str],
) -> None:
    existing = {
        row.branch_id: row
        for row in session.scalars(
            select(CustomerBranchAssignment).where(
                CustomerBranchAssignment.workspace_id == workspace_id,
                CustomerBranchAssignment.customer_id == customer.id,
            )
        )
    }
    selected_ids = {branches[code].id for code in branch_codes}
    for branch_id, assignment in existing.items():
        assignment.status = "active" if branch_id in selected_ids else "inactive"
    for code in branch_codes:
        branch = branches[code]
        if branch.id in existing:
            continue
        seed_key = f"{customer_seed_key}:{code}"
        payload = {"customerSeedKey": customer_seed_key, "branchCode": code}
        entity_id = _stable_id(bundle.manifest.seed_version, "customer_branch", seed_key)
        registered_assignment = _registered_entity(
            session,
            workspace_id,
            "customer_branch",
            seed_key,
            entity_id,
            payload,
            CustomerBranchAssignment,
        )
        if registered_assignment is None:
            session.add(
                CustomerBranchAssignment(
                    id=entity_id,
                    workspace_id=workspace_id,
                    customer_id=customer.id,
                    branch_id=branch.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "customer_branch",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _seed_employees(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
) -> None:
    actor_id = _stable_id(bundle.manifest.seed_version, "platform_user", "admin")
    employees: dict[str, Employee] = {}
    for fixture in bundle.employees.items:
        payload = fixture.model_dump(mode="json")
        employee_id = _stable_id(bundle.manifest.seed_version, "employee", fixture.seed_key)
        employee = _registered_entity(
            session,
            workspace_id,
            "employee",
            fixture.seed_key,
            employee_id,
            payload,
            Employee,
        )
        platform_user_id = (
            _stable_id(bundle.manifest.seed_version, "platform_user", fixture.user_seed_key)
            if fixture.user_seed_key
            else None
        )
        normalized_email = str(fixture.email).casefold() if fixture.email else None
        normalized_phone = (
            "".join(character for character in fixture.phone if character.isdigit())
            if fixture.phone
            else None
        )
        if employee is None:
            employee = Employee(
                id=employee_id,
                workspace_id=workspace_id,
                employee_number=fixture.employee_number,
                first_name=fixture.first_name,
                last_name=fixture.last_name,
                normalized_name=f"{fixture.first_name} {fixture.last_name}".casefold(),
                email=str(fixture.email) if fixture.email else None,
                normalized_email=normalized_email,
                phone=fixture.phone,
                normalized_phone=normalized_phone,
                position=fixture.position,
                department=fixture.department,
                contract_type=fixture.contract_type,
                hire_date=fixture.hire_date,
                platform_user_id=platform_user_id,
                status=fixture.status,
                created_by_platform_user_id=actor_id,
                updated_by_platform_user_id=actor_id,
            )
            session.add(employee)
            session.flush()
            _register(
                session,
                workspace_id,
                "employee",
                fixture.seed_key,
                employee_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            employee.employee_number = fixture.employee_number
            employee.first_name = fixture.first_name
            employee.last_name = fixture.last_name
            employee.normalized_name = f"{fixture.first_name} {fixture.last_name}".casefold()
            employee.email = str(fixture.email) if fixture.email else None
            employee.normalized_email = normalized_email
            employee.phone = fixture.phone
            employee.normalized_phone = normalized_phone
            employee.position = fixture.position
            employee.department = fixture.department
            employee.contract_type = fixture.contract_type
            employee.hire_date = fixture.hire_date
            employee.platform_user_id = platform_user_id
            employee.status = fixture.status
            employee.updated_by_platform_user_id = actor_id
        employees[fixture.seed_key] = employee
        _sync_employee_branches(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            employee,
            branches,
            fixture.branch_codes,
        )
        _sync_employee_schedule(session, bundle, workspace_id, fixture, employee, actor_id)

    for fixture in bundle.employees.items:
        _sync_employee_supervisors(
            session,
            bundle,
            workspace_id,
            fixture.seed_key,
            employees[fixture.seed_key],
            employees,
            fixture.supervisor_seed_keys,
        )
    session.flush()


def _sync_employee_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    employee_seed_key: str,
    employee: Employee,
    branches: dict[str, Branch],
    branch_codes: list[str],
) -> None:
    existing = {
        row.branch_id: row
        for row in session.scalars(
            select(EmployeeBranchAssignment).where(
                EmployeeBranchAssignment.workspace_id == workspace_id,
                EmployeeBranchAssignment.employee_id == employee.id,
            )
        )
    }
    selected_ids = {branches[code].id for code in branch_codes}
    for branch_id, assignment in existing.items():
        assignment.status = "active" if branch_id in selected_ids else "inactive"
    for code in branch_codes:
        branch = branches[code]
        if branch.id in existing:
            continue
        seed_key = f"{employee_seed_key}:{code}"
        payload = {"employeeSeedKey": employee_seed_key, "branchCode": code}
        entity_id = _stable_id(bundle.manifest.seed_version, "employee_branch", seed_key)
        if (
            _registered_entity(
                session,
                workspace_id,
                "employee_branch",
                seed_key,
                entity_id,
                payload,
                EmployeeBranchAssignment,
            )
            is None
        ):
            session.add(
                EmployeeBranchAssignment(
                    id=entity_id,
                    workspace_id=workspace_id,
                    employee_id=employee.id,
                    branch_id=branch.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "employee_branch",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _sync_employee_schedule(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    fixture: DemoEmployeeFixture,
    employee: Employee,
    actor_id: UUID,
) -> None:
    payload = {"timezone": fixture.timezone, "workSchedule": fixture.work_schedule}
    entity_id = _stable_id(bundle.manifest.seed_version, "employee_schedule", fixture.seed_key)
    schedule = _registered_entity(
        session,
        workspace_id,
        "employee_schedule",
        fixture.seed_key,
        entity_id,
        payload,
        EmployeeSchedule,
    )
    if schedule is None:
        schedule = EmployeeSchedule(
            id=entity_id,
            workspace_id=workspace_id,
            employee_id=employee.id,
            timezone=fixture.timezone,
            weekly_schedule=fixture.work_schedule,
            updated_by_platform_user_id=actor_id,
        )
        session.add(schedule)
        session.flush()
        _register(
            session,
            workspace_id,
            "employee_schedule",
            fixture.seed_key,
            entity_id,
            bundle.manifest.seed_version,
            payload,
        )
    else:
        schedule.timezone = fixture.timezone
        schedule.weekly_schedule = fixture.work_schedule
        schedule.updated_by_platform_user_id = actor_id


def _sync_employee_supervisors(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    employee_seed_key: str,
    employee: Employee,
    employees: dict[str, Employee],
    supervisor_seed_keys: list[str],
) -> None:
    existing = {
        row.supervisor_employee_id: row
        for row in session.scalars(
            select(EmployeeSupervisor).where(
                EmployeeSupervisor.workspace_id == workspace_id,
                EmployeeSupervisor.employee_id == employee.id,
            )
        )
    }
    selected_ids = {employees[key].id for key in supervisor_seed_keys}
    for supervisor_id, assignment in existing.items():
        assignment.status = "active" if supervisor_id in selected_ids else "inactive"
    for supervisor_seed_key in supervisor_seed_keys:
        supervisor = employees[supervisor_seed_key]
        if supervisor.id in existing:
            continue
        seed_key = f"{employee_seed_key}:{supervisor_seed_key}"
        payload = {"employeeSeedKey": employee_seed_key, "supervisorSeedKey": supervisor_seed_key}
        entity_id = _stable_id(bundle.manifest.seed_version, "employee_supervisor", seed_key)
        if (
            _registered_entity(
                session,
                workspace_id,
                "employee_supervisor",
                seed_key,
                entity_id,
                payload,
                EmployeeSupervisor,
            )
            is None
        ):
            session.add(
                EmployeeSupervisor(
                    id=entity_id,
                    workspace_id=workspace_id,
                    employee_id=employee.id,
                    supervisor_employee_id=supervisor.id,
                    status="active",
                )
            )
            session.flush()
            _register(
                session,
                workspace_id,
                "employee_supervisor",
                seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )


def _seed_branches(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    legal_entity_id: UUID,
) -> dict[str, Branch]:
    branches = {
        branch.code: branch
        for branch in session.scalars(select(Branch).where(Branch.workspace_id == workspace_id))
    }
    for fixture in bundle.foundation.branches:
        payload = fixture.model_dump(mode="json")
        entity_id = _stable_id(bundle.manifest.seed_version, "branch", fixture.seed_key)
        branch = _registered_entity(
            session, workspace_id, "branch", fixture.seed_key, entity_id, payload, Branch
        )
        if branch is None:
            branch = Branch(
                id=entity_id,
                workspace_id=workspace_id,
                legal_entity_id=legal_entity_id,
                code=fixture.code,
                name=fixture.name,
                status="active",
                timezone=fixture.timezone,
                configuration={},
            )
            session.add(branch)
            session.flush()
            _register(
                session,
                workspace_id,
                "branch",
                fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            branch.code = fixture.code
            branch.name = fixture.name
            branch.timezone = fixture.timezone
            branch.status = "active"
        branches[branch.code] = branch

    for branch in branches.values():
        scope = session.scalar(
            select(AccessScope).where(
                AccessScope.workspace_id == workspace_id,
                AccessScope.scope_type == "branch",
                AccessScope.branch_id == branch.id,
            )
        )
        if scope is None:
            session.add(
                AccessScope(
                    workspace_id=workspace_id,
                    scope_type="branch",
                    legal_entity_id=branch.legal_entity_id,
                    branch_id=branch.id,
                )
            )
    session.flush()
    return branches


def _seed_role_permissions(session: Session, bundle: DemoBundle, workspace_id: UUID) -> None:
    roles = {
        role.code: role
        for role in session.scalars(select(Role).where(Role.workspace_id == workspace_id))
    }
    permissions = {
        permission.code: permission
        for permission in session.scalars(
            select(Permission).where(Permission.is_platform_only.is_(False))
        )
    }
    for role_code, permission_codes in bundle.iam.role_permissions.items():
        role = roles.get(role_code)
        if role is None:
            raise RuntimeError(f"Demo role {role_code!r} is not installed.")
        for permission_code in permission_codes:
            permission = permissions.get(permission_code)
            if permission is None:
                raise RuntimeError(f"Demo permission {permission_code!r} is not installed.")
            if (
                session.scalar(
                    select(RolePermission.id).where(
                        RolePermission.workspace_id == workspace_id,
                        RolePermission.role_id == role.id,
                        RolePermission.permission_id == permission.id,
                    )
                )
                is None
            ):
                session.add(
                    RolePermission(
                        workspace_id=workspace_id,
                        role_id=role.id,
                        permission_id=permission.id,
                    )
                )
    session.flush()


def _seed_users(
    session: Session,
    bundle: DemoBundle,
    workspace_id: UUID,
    branches: dict[str, Branch],
    password_hash: str,
) -> None:
    now = datetime.now(UTC)
    roles = {
        role.code: role
        for role in session.scalars(select(Role).where(Role.workspace_id == workspace_id))
    }
    workspace_scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == "workspace",
        )
    )
    if workspace_scope is None:
        raise RuntimeError("The demo workspace scope is missing.")

    for fixture in bundle.iam.users:
        payload = fixture.model_dump(mode="json")
        user_id = _stable_id(bundle.manifest.seed_version, "platform_user", fixture.seed_key)
        user = _registered_entity(
            session,
            workspace_id,
            "platform_user",
            fixture.seed_key,
            user_id,
            payload,
            PlatformUser,
        )
        email = str(fixture.email).casefold()
        if user is None:
            user = PlatformUser(
                id=user_id,
                external_subject=f"demo:{bundle.manifest.seed_version}:{fixture.seed_key}",
                email=email,
                normalized_email=email,
                display_name=fixture.display_name,
                password_hash=password_hash,
                password_changed_at=now,
                status="active",
            )
            session.add(user)
            session.flush()
            _register(
                session,
                workspace_id,
                "platform_user",
                fixture.seed_key,
                user_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            user.email = email
            user.normalized_email = email
            user.display_name = fixture.display_name
            user.password_hash = password_hash
            user.password_changed_at = now
            user.status = "active"

        membership_id = _stable_id(bundle.manifest.seed_version, "membership", fixture.seed_key)
        membership = _registered_entity(
            session,
            workspace_id,
            "membership",
            fixture.seed_key,
            membership_id,
            payload,
            WorkspaceMembership,
        )
        if membership is None:
            membership = WorkspaceMembership(
                id=membership_id,
                workspace_id=workspace_id,
                platform_user_id=user.id,
                status=fixture.status,
                invited_at=now,
                activated_at=now if fixture.status == "active" else None,
                is_default=True,
            )
            session.add(membership)
            session.flush()
            _register(
                session,
                workspace_id,
                "membership",
                fixture.seed_key,
                membership_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            membership.status = fixture.status
            membership.is_default = True

        role = roles.get(fixture.role_code)
        if role is None:
            raise RuntimeError(f"Demo role {fixture.role_code!r} is not installed.")
        scopes = (
            [workspace_scope]
            if fixture.workspace_wide
            else [
                _branch_scope(session, workspace_id, branches[code].id)
                for code in fixture.branch_codes
            ]
        )
        for scope in scopes:
            assignment_key = f"{fixture.seed_key}:{scope.id}"
            assignment_payload = {"roleCode": role.code, "scopeId": str(scope.id)}
            assignment_id = _stable_id(
                bundle.manifest.seed_version,
                "role_assignment",
                assignment_key,
            )
            assignment = _registered_entity(
                session,
                workspace_id,
                "role_assignment",
                assignment_key,
                assignment_id,
                assignment_payload,
                RoleAssignment,
            )
            if assignment is None:
                session.add(
                    RoleAssignment(
                        id=assignment_id,
                        workspace_id=workspace_id,
                        membership_id=membership.id,
                        role_id=role.id,
                        access_scope_id=scope.id,
                        status="active",
                        valid_from=now,
                    )
                )
                session.flush()
                _register(
                    session,
                    workspace_id,
                    "role_assignment",
                    assignment_key,
                    assignment_id,
                    bundle.manifest.seed_version,
                    assignment_payload,
                )
    session.flush()


def _seed_payment_methods(session: Session, bundle: DemoBundle, workspace_id: UUID) -> None:
    for fixture in bundle.configuration.payment_methods:
        payload = fixture.model_dump(mode="json")
        entity_id = _stable_id(bundle.manifest.seed_version, "payment_method", fixture.seed_key)
        method = _registered_entity(
            session,
            workspace_id,
            "payment_method",
            fixture.seed_key,
            entity_id,
            payload,
            PaymentMethod,
        )
        if method is None:
            method = PaymentMethod(
                id=entity_id,
                workspace_id=workspace_id,
                code=fixture.code,
                name=fixture.name,
                icon=fixture.icon,
                status="active" if fixture.enabled else "inactive",
                is_system=fixture.system,
            )
            session.add(method)
            session.flush()
            _register(
                session,
                workspace_id,
                "payment_method",
                fixture.seed_key,
                entity_id,
                bundle.manifest.seed_version,
                payload,
            )
        else:
            method.code = fixture.code
            method.name = fixture.name
            method.icon = fixture.icon
            method.status = "active" if fixture.enabled else "inactive"
            method.is_system = fixture.system
    session.flush()


def _branch_scope(session: Session, workspace_id: UUID, branch_id: UUID) -> AccessScope:
    scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == workspace_id,
            AccessScope.scope_type == "branch",
            AccessScope.branch_id == branch_id,
        )
    )
    if scope is None:
        raise RuntimeError("The demo branch scope is missing.")
    return scope


def _registered_entity[ModelT](
    session: Session,
    workspace_id: UUID,
    entity_type: str,
    seed_key: str,
    entity_id: UUID,
    payload: Mapping[str, object],
    model: type[ModelT],
) -> ModelT | None:
    registry = session.scalar(
        select(DemoSeedRegistry).where(
            DemoSeedRegistry.workspace_id == workspace_id,
            DemoSeedRegistry.entity_type == entity_type,
            DemoSeedRegistry.seed_key == seed_key,
        )
    )
    if registry is None:
        if session.get(model, entity_id) is not None:
            raise RuntimeError("A demo UUID exists without a seed registry claim.")
        return None
    if registry.entity_id != entity_id:
        raise RuntimeError("The registered demo UUID does not match the manifest identity.")
    checksum = _checksum(payload)
    if registry.checksum != checksum:
        registry.checksum = checksum
        registry.version += 1
    entity = session.get(model, entity_id)
    if entity is None:
        raise RuntimeError("A registered demo entity is missing.")
    return entity


def _register(
    session: Session,
    workspace_id: UUID,
    entity_type: str,
    seed_key: str,
    entity_id: UUID,
    seed_version: str,
    payload: Mapping[str, object],
) -> None:
    session.add(
        DemoSeedRegistry(
            workspace_id=workspace_id,
            entity_type=entity_type,
            seed_key=seed_key,
            entity_id=entity_id,
            seed_version=seed_version,
            checksum=_checksum(payload),
        )
    )
    session.flush()


def _stable_id(seed_version: str, entity_type: str, seed_key: str) -> UUID:
    return uuid5(_DEMO_NAMESPACE, f"{seed_version}:{entity_type}:{seed_key}")


def _checksum(payload: Mapping[str, object]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
