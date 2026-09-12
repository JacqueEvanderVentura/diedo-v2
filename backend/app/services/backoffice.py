from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from math import ceil
from uuid import UUID, uuid7

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.core.security import hash_password, normalize_email
from app.db.models import AuditEntry, PlatformUser, Workspace, WorkspaceMembership
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
from app.services.workspace_provisioning import (
    ProvisionedWorkspace,
    WorkspaceProvisioningService,
)

_WORKSPACE_SCOPED_ROLES = frozenset({"workspace_admin", "manager"})
_ALLOWED_ROLE_CODES = frozenset({"workspace_admin", "manager", "supervisor", "cashier", "seller"})


class BackofficeService:
    def __init__(self, session: Session) -> None:
        self._session = session
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
    ) -> tuple[BackofficeUserPage, int]:
        page_size = min(max(page_size, 1), 100)
        page = max(page, 1)
        result = self._repository.list_users(
            search=search,
            workspace_id=workspace_id,
            status=status,
            page=page,
            page_size=page_size,
        )
        total_pages = ceil(result.total_items / page_size) if result.total_items else 0
        return result, total_pages

    def list_workspace_members(self, workspace_id: UUID) -> tuple[BackofficeUserRecord, ...]:
        self._require_customer_workspace(workspace_id)
        return self._repository.list_workspace_members(workspace_id)

    def create_user(
        self,
        *,
        workspace_id: UUID,
        display_name: str,
        email: str,
        password: str,
        role_code: str,
    ) -> BackofficeUserRecord:
        workspace = self._require_customer_workspace(workspace_id)
        normalized_role = role_code.strip().lower()
        if normalized_role not in _ALLOWED_ROLE_CODES:
            raise InvalidOperationError("El rol indicado no es válido.", "roleCode")
        role = self._repository.role_by_code(workspace.id, normalized_role)
        if role is None:
            raise InvalidOperationError("El rol no existe en esta compañía.", "roleCode")

        assignments = self._role_assignments(workspace.id, role.id, normalized_role)
        normalized_email = normalize_email(email)
        provisioning_repo = WorkspaceProvisioningRepository(self._session)
        users_repo = UsersRepository(self._session)
        now = datetime.now(UTC)

        existing = provisioning_repo.platform_user_by_email(normalized_email)
        if existing is not None:
            if existing.is_platform_operator:
                raise InvalidOperationError(
                    "No puedes asignar un operador de plataforma como usuario de cliente.",
                    "email",
                )
            if self._repository.membership_exists(workspace.id, existing.id):
                raise ConflictError("El usuario ya pertenece a esta compañía.", "email")
            if existing.status != "active":
                raise InvalidOperationError(
                    "La identidad está deshabilitada. Reactívala antes de asignarla.",
                    "email",
                )
            membership_id = uuid7()
            membership = WorkspaceMembership(
                id=membership_id,
                workspace_id=workspace.id,
                platform_user_id=existing.id,
                status="active",
                invited_at=now,
                activated_at=now,
                is_default=not provisioning_repo.has_default_membership(existing.id),
            )
            self._session.add(membership)
            self._session.flush()
            users_repo.replace_assignments(
                workspace_id=workspace.id,
                membership_id=membership_id,
                assignments=assignments,
                now=now,
            )
            target_workspace_id = workspace.id
            target_membership_id = membership_id
            target_user_id = existing.id
        else:
            platform_user_id = uuid7()
            membership_id = uuid7()
            user = PlatformUser(
                id=platform_user_id,
                external_subject=f"backoffice-user:{platform_user_id}",
                email=normalized_email,
                normalized_email=normalized_email,
                display_name=display_name.strip(),
                password_hash=hash_password(password),
                password_changed_at=now,
                status="active",
                version=1,
            )
            membership = WorkspaceMembership(
                id=membership_id,
                workspace_id=workspace.id,
                platform_user_id=platform_user_id,
                status="active",
                invited_at=now,
                activated_at=now,
                is_default=True,
            )
            self._session.add_all([user, membership])
            self._session.flush()
            users_repo.replace_assignments(
                workspace_id=workspace.id,
                membership_id=membership_id,
                assignments=assignments,
                now=now,
            )
            target_workspace_id = workspace.id
            target_membership_id = membership_id
            target_user_id = platform_user_id

        self._session.add(
            AuditEntry(
                workspace_id=target_workspace_id,
                actor_platform_user_id=None,
                action="user.backoffice_create",
                target_type="platform_user",
                target_id=target_user_id,
                outcome="success",
                request_id=get_request_id() or None,
                details={
                    "membershipId": str(target_membership_id),
                    "roleCode": normalized_role,
                    "existingIdentity": existing is not None,
                },
            )
        )
        try:
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("No se pudo crear el usuario.") from exc
        members = self._repository.list_workspace_members(workspace.id)
        for member in members:
            if member.membership_id == target_membership_id:
                return member
        raise ResourceNotFoundError("El usuario no existe.", "membershipId")

    def update_platform_user(
        self,
        user_id: UUID,
        *,
        status: str,
        expected_version: int,
        actor_platform_user_id: UUID | None,
    ) -> BackofficeUserRecord:
        user = self._repository.get_platform_user(user_id)
        if user is None or user.is_platform_operator:
            raise ResourceNotFoundError("El usuario no existe.", "userId")
        if actor_platform_user_id is not None and actor_platform_user_id == user.id:
            raise InvalidOperationError(
                "No puedes modificar tu propia cuenta desde aquí.",
                "userId",
            )
        if status not in {"active", "disabled"}:
            raise InvalidOperationError("Estado no válido.", "status")
        if user.version != expected_version:
            raise ConflictError(
                "El usuario cambió mientras lo editabas. Recarga e intenta de nuevo.",
                "version",
            )

        now = datetime.now(UTC)
        user.status = status
        user.version += 1
        users_repo = UsersRepository(self._session)
        if status == "disabled":
            users_repo.revoke_platform_user_sessions(user.id, now)

        membership_row = self._session.execute(
            select(WorkspaceMembership.workspace_id, WorkspaceMembership.id)
            .join(Workspace, Workspace.id == WorkspaceMembership.workspace_id)
            .where(
                WorkspaceMembership.platform_user_id == user.id,
                Workspace.slug != PLATFORM_WORKSPACE_SLUG,
            )
            .order_by(WorkspaceMembership.activated_at.desc().nulls_last())
            .limit(1)
        ).one_or_none()
        audit_workspace_id = membership_row[0] if membership_row is not None else None

        if audit_workspace_id is not None:
            self._session.add(
                AuditEntry(
                    workspace_id=audit_workspace_id,
                    actor_platform_user_id=actor_platform_user_id,
                    action="user.backoffice_update",
                    target_type="platform_user",
                    target_id=user.id,
                    outcome="success",
                    request_id=get_request_id() or None,
                    details={"status": status},
                )
            )
        self._session.commit()
        self._session.refresh(user)

        page = self._repository.list_users(
            search=user.email,
            workspace_id=None,
            status=None,
            page=1,
            page_size=20,
        )
        for item in page.items:
            if item.user_id == user.id:
                return item
        raise ResourceNotFoundError("El usuario no existe.", "userId")

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

    def list_modules(self) -> tuple[tuple[str, str], ...]:
        from sqlalchemy import select

        from app.db.models import ModuleDefinition

        rows = self._session.execute(
            select(ModuleDefinition.code, ModuleDefinition.name)
            .where(ModuleDefinition.status == "available")
            .order_by(ModuleDefinition.code)
        )
        return tuple(rows.tuples())

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
        record = self._entitlements.update_plan(
            plan_id,
            name=name,
            description=description,
            module_codes=module_codes,
            status=status,
            expected_version=expected_version,
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
        workspace = self._require_customer_workspace(workspace_id)
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
                self._entitlements.plan_module_codes(plan),
            )
            changed_fields.append("plan")

        if enabled_modules is not None:
            self._entitlements.sync_entitlements(
                workspace.id,
                self._entitlements.resolve_enabled_modules(frozenset(enabled_modules)),
            )
            changed_fields.append("modules")

        if not changed_fields:
            return self._repository.workspace_record(workspace)

        workspace.version += 1
        self._session.add(
            AuditEntry(
                workspace_id=workspace.id,
                actor_platform_user_id=None,
                action="workspace.backoffice_update",
                target_type="workspace",
                target_id=workspace.id,
                outcome="success",
                request_id=get_request_id() or None,
                details={"fields": changed_fields},
            )
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
        )

    def _require_customer_workspace(self, workspace_id: UUID) -> Workspace:
        workspace = self._repository.get_customer_workspace(workspace_id)
        if workspace is None:
            existing = self._session.get(Workspace, workspace_id)
            if existing is not None and existing.slug == PLATFORM_WORKSPACE_SLUG:
                raise ResourceNotFoundError("La compañía no existe.", "workspaceId")
            raise ResourceNotFoundError("La compañía no existe.", "workspaceId")
        return workspace
