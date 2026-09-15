from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime
from decimal import Decimal
from math import ceil
from typing import Any
from uuid import UUID, uuid7

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.core.security import hash_password, normalize_email
from app.db.models import (
    AuditEntry,
    ModuleDefinition,
    PlatformUser,
    SubscriptionPlan,
    Workspace,
    WorkspaceMembership,
    WorkspaceSubscription,
)
from app.repositories.backoffice import (
    BackofficeOverviewRecord,
    BackofficeRepository,
    BackofficeUserPage,
    BackofficeUserRecord,
    BackofficeWorkspaceRecord,
)
from app.repositories.users import RoleAssignmentSpec, UsersRepository
from app.repositories.workspace_provisioning import WorkspaceProvisioningRepository
from app.services.errors import ConflictError, InvalidOperationError, ResourceNotFoundError
from app.services.platform_workspace import PLATFORM_WORKSPACE_SLUG
from app.services.subscription_plans import (
    PlanRecord,
    SubscriptionPlanRepository,
    WorkspaceEntitlementService,
)
from app.services.users import UsersService
from app.services.workspace_provisioning import (
    ProvisionedWorkspace,
    WorkspaceProvisioningService,
)

_WORKSPACE_SCOPED_ROLES = frozenset({"workspace_admin", "manager"})
_ALLOWED_ROLE_CODES = frozenset({"workspace_admin", "manager", "supervisor", "cashier", "seller"})


class BackofficeService:
    def __init__(self, session: Session, actor_id: UUID | None = None) -> None:
        self._session = session
        self._actor_id = actor_id
        self._repository = BackofficeRepository(session)
        self._plans = SubscriptionPlanRepository(session)
        self._entitlements = WorkspaceEntitlementService(session)

    def list_workspaces(self) -> tuple[BackofficeWorkspaceRecord, ...]:
        return tuple(
            self._repository.workspace_record(workspace)
            for workspace in self._repository.list_customer_workspaces()
        )

    def get_workspace(self, workspace_id: UUID) -> BackofficeWorkspaceRecord:
        workspace = self._require_customer_workspace(workspace_id)
        return self._repository.workspace_record(workspace)

    def overview(self) -> BackofficeOverviewRecord:
        return self._repository.overview()

    def list_users(
        self,
        *,
        search: str | None,
        workspace_id: UUID | None,
        status: str | None,
        page: int,
        page_size: int,
        platform_status: str | None = None,
    ) -> tuple[BackofficeUserPage, int]:
        page_size = min(max(page_size, 1), 100)
        page = max(page, 1)
        result = self._repository.list_users(
            platform_status=platform_status,
            search=search,
            workspace_id=workspace_id,
            status=status,
            page=page,
            page_size=page_size,
        )
        total_pages = ceil(result.total_items / page_size) if result.total_items else 0
        return result, total_pages

    def list_workspace_members(
        self, workspace_id: UUID, *, page: int = 1, page_size: int = 25
    ) -> tuple[BackofficeUserPage, int]:
        self._require_customer_workspace(workspace_id)
        return self.list_users(
            search=None, workspace_id=workspace_id, status=None, page=page, page_size=page_size
        )

    def get_member(self, workspace_id: UUID, membership_id: UUID) -> BackofficeUserRecord:
        self._require_customer_workspace(workspace_id)
        member = self._repository.get_member(workspace_id, membership_id)
        if member is None:
            raise ResourceNotFoundError("El miembro no existe.", "membershipId")
        return member

    def member_options(self, workspace_id: UUID) -> dict[str, Any]:
        self._require_customer_workspace(workspace_id)
        repo = UsersRepository(self._session)
        return {
            "roles": [asdict(item) for item in repo.list_roles(workspace_id)],
            "branches": [asdict(item) for item in repo.list_branches(workspace_id, None)],
            "legal_entities": [
                asdict(item) for item in repo.list_legal_entities(workspace_id, None)
            ],
        }

    def create_user(
        self,
        *,
        workspace_id: UUID,
        display_name: str,
        email: str,
        password: str | None,
        role_code: str = "seller",
        role_assignments: list[RoleAssignmentSpec] | None = None,
    ) -> BackofficeUserRecord:
        workspace = self._require_customer_workspace(workspace_id, lock=True)
        users_repo = UsersRepository(self._session)
        if role_assignments is None:
            normalized_role = role_code.strip().lower()
            if normalized_role not in _ALLOWED_ROLE_CODES:
                raise InvalidOperationError("El rol indicado no es válido.", "roleCode")
            role = self._repository.role_by_code(workspace.id, normalized_role)
            if role is None:
                raise InvalidOperationError("El rol no existe en esta compañía.", "roleCode")
            assignments = self._role_assignments(workspace.id, role.id, normalized_role)
        else:
            assignments, _ = UsersService(self._session).validate_workspace_assignments(
                workspace_id, role_assignments
            )
        normalized_email = normalize_email(email)
        provisioning_repo = WorkspaceProvisioningRepository(self._session)
        existing = provisioning_repo.platform_user_by_email(normalized_email)
        now = datetime.now(UTC)
        if existing is not None:
            if existing.is_platform_operator:
                raise InvalidOperationError("Un operador no puede ser usuario de cliente.", "email")
            if self._repository.membership_exists(workspace.id, existing.id):
                raise ConflictError(
                    "El usuario ya pertenece a esta compañía. "
                    "Busca su acceso y reactívalo si está suspendido.",
                    "email",
                )
            if password is not None:
                raise InvalidOperationError(
                    "La cuenta ya existe; omite la contraseña para conservarla.", "password"
                )
            if existing.status != "active" or not existing.password_hash:
                raise InvalidOperationError(
                    "La cuenta debe estar activa y tener una credencial utilizable.", "email"
                )
            user = existing
        else:
            if password is None:
                raise InvalidOperationError(
                    "Una cuenta nueva requiere una contraseña inicial.", "password"
                )
            user_id = uuid7()
            user = PlatformUser(
                id=user_id,
                external_subject=f"backoffice-user:{user_id}",
                email=normalized_email,
                normalized_email=normalized_email,
                display_name=display_name.strip(),
                password_hash=hash_password(password),
                password_changed_at=now,
                status="active",
                version=1,
            )
            self._session.add(user)
        membership = WorkspaceMembership(
            id=uuid7(),
            workspace_id=workspace.id,
            platform_user_id=user.id,
            status="active",
            invited_at=now,
            activated_at=now,
            is_default=not provisioning_repo.has_default_membership(user.id),
        )
        try:
            self._session.add(membership)
            self._session.flush()
            users_repo.replace_assignments(
                workspace_id=workspace.id,
                membership_id=membership.id,
                assignments=assignments,
                now=now,
            )
            self._audit(
                "user.backoffice_create",
                "platform_user",
                user.id,
                workspace.id,
                {
                    "membershipId": str(membership.id),
                    "existingIdentity": existing is not None,
                    "roleAssignments": self._assignment_details(assignments),
                },
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError(
                "No se pudo registrar el acceso; revisa si la cuenta ya pertenece a la compañía.",
                "email",
            ) from exc
        return self.get_member(workspace.id, membership.id)

    def update_platform_user(
        self,
        user_id: UUID,
        *,
        status: str,
        expected_version: int,
        actor_platform_user_id: UUID | None = None,
    ) -> BackofficeUserRecord:
        repo = UsersRepository(self._session)
        memberships = list(
            self._session.scalars(
                select(WorkspaceMembership)
                .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
                .where(
                    WorkspaceMembership.platform_user_id == user_id,
                    Workspace.slug != PLATFORM_WORKSPACE_SLUG,
                )
                .order_by(WorkspaceMembership.workspace_id)
            )
        )
        if not memberships:
            raise ResourceNotFoundError("El usuario no existe.", "userId")
        workspace_ids = {membership.workspace_id for membership in memberships}
        for workspace_id in sorted(workspace_ids):
            repo.lock_workspace(workspace_id)
        user = repo.platform_user(user_id, lock=True)
        if user is None or user.is_platform_operator:
            raise ResourceNotFoundError("El usuario no existe.", "userId")
        current_ids = set(
            self._session.scalars(
                select(WorkspaceMembership.workspace_id).where(
                    WorkspaceMembership.platform_user_id == user_id
                )
            )
        )
        if not current_ids <= workspace_ids:
            raise ConflictError(
                "Los accesos del usuario cambiaron. Recarga e intenta de nuevo.", "version"
            )
        self._check_version(user.version, expected_version)
        if status not in {"active", "disabled"}:
            raise InvalidOperationError("Estado no válido.", "status")
        if status == "disabled":
            for membership in memberships:
                self._protect_last_admin(repo, membership.workspace_id, membership.id)
        before = user.status
        user.status = status
        user.version += 1
        if status == "disabled":
            repo.revoke_platform_user_sessions(user.id, datetime.now(UTC))
        if actor_platform_user_id is not None:
            self._actor_id = actor_platform_user_id
        for workspace_id in workspace_ids:
            self._audit(
                "user.backoffice_update",
                "platform_user",
                user.id,
                workspace_id,
                {
                    "before": before,
                    "after": status,
                    "workspaceIds": [str(x) for x in sorted(workspace_ids)],
                },
            )
        self._session.commit()
        return self.get_member(memberships[0].workspace_id, memberships[0].id)

    def update_member(
        self,
        workspace_id: UUID,
        membership_id: UUID,
        *,
        expected_version: int,
        status: str | None,
        assignments: list[RoleAssignmentSpec] | None,
    ) -> BackofficeUserRecord:
        self._require_customer_workspace(workspace_id, lock=True)
        repo = UsersRepository(self._session)
        membership = repo.membership_for_update(workspace_id, membership_id)
        before = self.get_member(workspace_id, membership_id)
        if membership is None:
            raise ResourceNotFoundError("El miembro no existe.", "membershipId")
        self._check_version(membership.version, expected_version)
        if membership.status not in {"active", "suspended"}:
            raise ConflictError(
                "Este acceso requiere resolver su invitación o revocación antes de editarlo.",
                "status",
            )
        if status is not None and status not in {"active", "suspended"}:
            raise InvalidOperationError("Estado de acceso no válido.", "status")
        if assignments is not None:
            assignments, roles = UsersService(self._session).validate_workspace_assignments(
                workspace_id, assignments
            )
            keeps_admin = any(
                item.scope_type == "workspace" and roles[item.role_id].code == "workspace_admin"
                for item in assignments
            )
        else:
            keeps_admin = True
        if status == "suspended" or not keeps_admin:
            self._protect_last_admin(repo, workspace_id, membership_id)
        now = datetime.now(UTC)
        if status is not None:
            membership.status = status
            membership.revoked_at = now if status == "suspended" else None
            membership.activated_at = membership.activated_at or now
        if assignments is not None:
            repo.replace_assignments(
                workspace_id=workspace_id,
                membership_id=membership_id,
                assignments=assignments,
                now=now,
            )
        if status == "suspended" or assignments is not None:
            repo.revoke_membership_sessions(membership_id, now)
        membership.version += 1
        self._audit(
            "membership.backoffice_update",
            "workspace_membership",
            membership_id,
            workspace_id,
            {
                "userId": str(before.user_id),
                "before": {
                    "status": before.membership_status,
                    "roleAssignments": self._assignment_details(before.role_assignments),
                },
                "after": {
                    "status": membership.status,
                    "roleAssignments": self._assignment_details(
                        assignments if assignments is not None else before.role_assignments
                    ),
                },
            },
        )
        self._session.commit()
        return self.get_member(workspace_id, membership_id)

    @staticmethod
    def _assignment_details(assignments: Any) -> list[dict[str, str | None]]:
        return [
            {
                "roleId": str(item.role_id),
                "scopeType": item.scope_type,
                "legalEntityId": str(item.legal_entity_id) if item.legal_entity_id else None,
                "branchId": str(item.branch_id) if item.branch_id else None,
            }
            for item in assignments
        ]

    @staticmethod
    def _protect_last_admin(repo: UsersRepository, workspace_id: UUID, membership_id: UUID) -> None:
        if (
            repo.is_workspace_admin(workspace_id, membership_id)
            and repo.active_workspace_admin_count(workspace_id) <= 1
        ):
            raise ConflictError(
                "No se puede suspender o degradar al último administrador de una compañía."
            )

    @staticmethod
    def _check_version(actual: int, expected: int) -> None:
        if actual != expected:
            raise ConflictError(
                "Los datos cambiaron mientras los editabas. Recarga e intenta de nuevo.", "version"
            )

    def _audit(
        self,
        action: str,
        target_type: str,
        target_id: UUID,
        workspace_id: UUID | None,
        details: dict[str, Any],
    ) -> None:
        self._session.add(
            AuditEntry(
                workspace_id=workspace_id,
                actor_platform_user_id=self._actor_id,
                action=action,
                target_type=target_type,
                target_id=target_id,
                outcome="success",
                request_id=get_request_id() or None,
                details={**details, "actorType": "operator" if self._actor_id else "api_key"},
            )
        )

    def _role_assignments(
        self,
        workspace_id: UUID,
        role_id: UUID,
        role_code: str,
    ) -> list[RoleAssignmentSpec]:
        if role_code in _WORKSPACE_SCOPED_ROLES:
            return [RoleAssignmentSpec(role_id=role_id, scope_type="workspace")]
        branch_id = self._repository.primary_branch_id(workspace_id)
        if branch_id is None:
            raise InvalidOperationError(
                "La compañía no tiene sucursales activas para asignar el rol.",
                "roleCode",
            )
        from app.db.models import Branch

        branch = self._session.scalar(
            select(Branch).where(Branch.workspace_id == workspace_id, Branch.id == branch_id)
        )
        if branch is None:
            raise InvalidOperationError("No se encontró la sucursal principal.", "roleCode")
        return [
            RoleAssignmentSpec(
                role_id=role_id,
                scope_type="branch",
                branch_id=branch.id,
                legal_entity_id=branch.legal_entity_id,
            )
        ]

    def list_plans(self) -> tuple[PlanRecord, ...]:
        return tuple(self._plans.list_plans())

    def list_modules(self) -> tuple[tuple[str, str, list[str]], ...]:
        rows = self._session.execute(
            select(ModuleDefinition.code, ModuleDefinition.name, ModuleDefinition.dependency_codes)
            .where(ModuleDefinition.status == "available")
            .order_by(ModuleDefinition.code)
        )
        return tuple((code, name, list(dependencies or ())) for code, name, dependencies in rows)

    def update_plan(
        self,
        plan_id: UUID,
        *,
        name: str | None,
        description: str | None,
        module_codes: list[str] | None,
        status: str | None,
        expected_version: int,
    ) -> PlanRecord:
        plan = self._session.scalar(
            select(SubscriptionPlan).where(SubscriptionPlan.id == plan_id).with_for_update()
        )
        if plan is None:
            raise ResourceNotFoundError("El plan no existe.", "planId")
        before = {
            "name": plan.name,
            "description": plan.description,
            "moduleCodes": sorted(self._entitlements.plan_module_codes(plan)),
            "status": plan.status,
        }
        record = self._entitlements.update_plan(
            plan_id,
            name=name,
            description=description,
            module_codes=module_codes,
            status=status,
            expected_version=expected_version,
        )
        self._audit(
            "plan.backoffice_update",
            "subscription_plan",
            plan_id,
            None,
            {
                "before": before,
                "after": {
                    "name": record.name,
                    "description": record.description,
                    "moduleCodes": list(record.module_codes),
                    "status": record.status,
                },
            },
        )
        self._session.commit()
        return record

    def update_workspace(
        self,
        workspace_id: UUID,
        *,
        name: str | None,
        status: str | None,
        plan_code: str | None,
        enabled_modules: list[str] | None,
        expected_version: int,
    ) -> BackofficeWorkspaceRecord:
        workspace = self._require_customer_workspace(workspace_id, lock=True)
        subscription = self._plans.workspace_subscription(workspace_id)
        current_plan = self._plans.get_plan(subscription.plan_id) if subscription else None
        before = {
            "name": workspace.name,
            "status": workspace.status,
            "planCode": current_plan.code if current_plan else None,
            "configuredModules": sorted(
                self._entitlements.enabled_module_codes_for_workspace(workspace_id)
            ),
        }
        if workspace.version != expected_version:
            raise ConflictError(
                "El workspace cambió mientras lo editabas. Recarga e intenta de nuevo.",
                "version",
            )

        changed_fields: list[str] = []
        if name is not None and name != workspace.name:
            workspace.name = name
            changed_fields.append("name")
        if status is not None and status != workspace.status:
            if status not in {"active", "suspended"}:
                raise InvalidOperationError(
                    "Solo puedes activar o suspender la compañía.",
                    "status",
                )
            workspace.status = status
            changed_fields.append("status")

        if plan_code is not None:
            plan = self._entitlements.require_plan_code(plan_code)
            self._entitlements.assign_plan(workspace.id, plan)
            self._entitlements.sync_entitlements(
                workspace.id,
                self._entitlements.validate_module_codes(
                    self._entitlements.plan_module_codes(plan)
                ),
            )
            changed_fields.append("plan")

        if enabled_modules is not None:
            self._entitlements.sync_entitlements(
                workspace.id,
                self._entitlements.validate_module_codes(frozenset(enabled_modules)),
            )
            changed_fields.append("modules")

        if not changed_fields:
            return self._repository.workspace_record(workspace)

        workspace.version += 1
        self._audit(
            "workspace.backoffice_update",
            "workspace",
            workspace.id,
            workspace.id,
            {
                "fields": changed_fields,
                "before": before,
                "after": {
                    "name": workspace.name,
                    "status": workspace.status,
                    "planCode": plan_code if plan_code is not None else before["planCode"],
                    "configuredModules": sorted(
                        self._entitlements.enabled_module_codes_for_workspace(workspace.id)
                    ),
                },
            },
        )
        self._session.commit()
        self._session.refresh(workspace)
        return self._repository.workspace_record(workspace)

    def provision_workspace(
        self,
        *,
        slug: str,
        name: str,
        default_currency: str,
        timezone: str,
        locale: str,
        tax_default_rate: Decimal,
        owner_email: str,
        owner_display_name: str,
        owner_password: str | None,
        plan_code: str | None = None,
        enabled_modules: list[str] | None = None,
    ) -> ProvisionedWorkspace:
        enabled_module_codes = frozenset(enabled_modules) if enabled_modules is not None else None
        return WorkspaceProvisioningService(self._session).provision(
            slug=slug,
            name=name,
            default_currency=default_currency,
            timezone=timezone,
            locale=locale,
            tax_default_rate=tax_default_rate,
            owner_email=owner_email,
            owner_display_name=owner_display_name,
            owner_password=owner_password,
            plan_code=plan_code or "completo",
            enabled_module_codes=enabled_module_codes,
            actor_platform_user_id=self._actor_id,
        )

    def update_subscription(
        self,
        workspace_id: UUID,
        *,
        expected_version: int,
        status: str,
        started_at: datetime,
        ends_at: datetime | None,
        notes: str | None,
    ) -> BackofficeWorkspaceRecord:
        workspace = self._require_customer_workspace(workspace_id, lock=True)
        subscription = self._session.scalar(
            select(WorkspaceSubscription)
            .where(WorkspaceSubscription.workspace_id == workspace_id)
            .with_for_update()
        )
        if subscription is None:
            raise ConflictError("Asigna un plan antes de modificar la suscripción.", "planCode")
        self._check_version(subscription.version, expected_version)
        if status not in {"trial", "active", "cancelled", "expired"}:
            raise InvalidOperationError("Estado no válido.", "status")
        if ends_at is not None and ends_at < started_at:
            raise InvalidOperationError(
                "La fecha final no puede ser anterior a la inicial.", "endsAt"
            )

        def details() -> dict[str, Any]:
            return {
                "status": subscription.status,
                "startedAt": subscription.started_at.isoformat(),
                "endsAt": subscription.ends_at.isoformat() if subscription.ends_at else None,
                "notes": subscription.notes,
            }

        before = details()
        subscription.status, subscription.started_at, subscription.ends_at = (
            status,
            started_at,
            ends_at,
        )
        subscription.notes = notes
        subscription.version += 1
        self._audit(
            "subscription.backoffice_update",
            "workspace_subscription",
            subscription.id,
            workspace_id,
            {"before": before, "after": details()},
        )
        self._session.commit()
        return self._repository.workspace_record(workspace)

    def list_audit(
        self,
        *,
        workspace_id: UUID | None,
        actor_id: UUID | None,
        target_id: UUID | None,
        action: str | None,
        date_from: datetime | None,
        date_to: datetime | None,
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int]:
        if date_from and date_to and date_to < date_from:
            raise InvalidOperationError("El período no es válido.", "dateTo")
        query = (
            select(AuditEntry, PlatformUser.display_name)
            .outerjoin(PlatformUser, PlatformUser.id == AuditEntry.actor_platform_user_id)
            .where(
                AuditEntry.action.in_(
                    (
                        "workspace.provision",
                        "workspace.backoffice_update",
                        "user.backoffice_create",
                        "user.backoffice_update",
                        "membership.backoffice_update",
                        "plan.backoffice_update",
                        "subscription.backoffice_update",
                        "platform_operator.create",
                    )
                )
            )
        )
        if workspace_id:
            self._require_customer_workspace(workspace_id)
            query = query.where(AuditEntry.workspace_id == workspace_id)
        if actor_id:
            query = query.where(AuditEntry.actor_platform_user_id == actor_id)
        if target_id:
            query = query.where(AuditEntry.target_id == target_id)
        if action:
            query = query.where(AuditEntry.action == action)
        if date_from:
            query = query.where(AuditEntry.occurred_at >= date_from)
        if date_to:
            query = query.where(AuditEntry.occurred_at <= date_to)
        total = int(self._session.scalar(select(func.count()).select_from(query.subquery())) or 0)
        rows = self._session.execute(
            query.order_by(AuditEntry.occurred_at.desc(), AuditEntry.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return [
            {
                "id": entry.id,
                "workspace_id": entry.workspace_id,
                "actor_platform_user_id": entry.actor_platform_user_id,
                "actor_name": name,
                "actor_type": entry.details.get("actorType", "operator" if name else "unknown"),
                "action": entry.action,
                "target_type": entry.target_type,
                "target_id": entry.target_id,
                "occurred_at": entry.occurred_at,
                "request_id": entry.request_id,
                "details": entry.details,
            }
            for entry, name in rows
        ], total

    def _require_customer_workspace(self, workspace_id: UUID, *, lock: bool = False) -> Workspace:
        statement = select(Workspace).where(
            Workspace.id == workspace_id, Workspace.slug != PLATFORM_WORKSPACE_SLUG
        )
        if lock:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        workspace = self._session.scalar(statement)
        if workspace is None:
            raise ResourceNotFoundError("La compañía no existe.", "workspaceId")
        return workspace
