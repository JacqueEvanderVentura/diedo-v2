from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid7

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.request_context import get_request_id
from app.core.security import hash_password, normalize_email
from app.db.models import (
    AccessScope,
    AuditEntry,
    CrmSettings,
    ModuleEntitlement,
    PaymentMethod,
    PlatformUser,
    PurchasingSettings,
    Role,
    RoleAssignment,
    RolePermission,
    UnitOfMeasure,
    Workspace,
    WorkspaceMembership,
)
from app.repositories.workspace_provisioning import WorkspaceProvisioningRepository
from app.services.errors import (
    ConflictError,
    InvalidOperationError,
    ServiceUnavailableError,
)

_ROLE_TEMPLATES = (
    ("workspace_admin", "Administrador"),
    ("manager", "Gerente"),
    ("supervisor", "Supervisor"),
    ("cashier", "Cajero"),
    ("seller", "Vendedor"),
)

_ROLE_PERMISSION_CODES = {
    "manager": frozenset(
        {
            "dashboard.read",
            "crm.read",
            "crm.manage",
            "finance.read",
            "finance.manage",
            "membership.read",
            "membership.manage",
            "report.read",
        }
    ),
    "cashier": frozenset(
        {
            "dashboard.read",
            "sales.read",
            "pos.read",
            "pos.sell",
            "pos.register.manage",
            "pos.cash.read",
            "pos.cash.manage",
            "pos.receivables.read",
            "pos.receivables.collect",
        }
    ),
    "supervisor": frozenset(
        {
            "dashboard.read",
            "crm.read",
            "crm.manage",
            "finance.read",
            "report.read",
            "sales.read",
            "pos.read",
            "pos.cash.read",
            "pos.receivables.read",
            "pos.receivables.collect",
            "pos.void",
        }
    ),
    "seller": frozenset(
        {
            "dashboard.read",
            "crm.read",
            "crm.manage",
            "sales.read",
            "sales.quote.manage",
            "pos.read",
            "pos.sell",
        }
    ),
}

_PAYMENT_METHODS = (
    ("cash", "Efectivo", "Banknote", "cash", "immediate", True, False),
    ("card", "Tarjeta", "CreditCard", "card", "immediate", False, False),
    (
        "transfer",
        "Transferencia",
        "Landmark",
        "bank_transfer",
        "pending_confirmation",
        False,
        True,
    ),
    (
        "payment_link",
        "Link de pago",
        "Link2",
        "payment_link",
        "pending_confirmation",
        False,
        True,
    ),
    ("credit", "Cuenta por cobrar", "Clock", "credit", "receivable", False, False),
)

_UNITS_OF_MEASURE = (
    ("unit", "Unidad", "ud"),
    ("kg", "Kilogramo", "kg"),
    ("g", "Gramo", "g"),
    ("lb", "Libra", "lb"),
    ("l", "Litro", "L"),
    ("ml", "Mililitro", "mL"),
    ("m", "Metro", "m"),
    ("cm", "Centímetro", "cm"),
)

_CRM_SCORING_WEIGHTS = {
    "pos": 1,
    "agenda": 1,
    "inventarios": 1,
    "finanzas": 1,
    "crm": 1,
    "incidencias": 0.8,
    "config": 0.6,
}

_REQUIRED_MODULES = frozenset({"foundation", "iam"})
_REQUIRED_ADMIN_PERMISSIONS = frozenset(
    {"membership.read", "membership.manage", "role.read", "role.manage"}
)


@dataclass(frozen=True)
class ProvisionedOwner:
    user_id: UUID
    membership_id: UUID
    email: str
    display_name: str
    existing_identity: bool
    is_default_workspace: bool


@dataclass(frozen=True)
class ProvisionedWorkspace:
    workspace_id: UUID
    slug: str
    name: str
    owner: ProvisionedOwner
    administrator_role_id: UUID
    enabled_modules: tuple[str, ...]


class WorkspaceProvisioningService:
    """Create an isolated tenant and its owner as one transaction."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._repository = WorkspaceProvisioningRepository(session)

    def provision(
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
    ) -> ProvisionedWorkspace:
        if self._repository.workspace_by_slug(slug) is not None:
            raise ConflictError("Ya existe un workspace con este slug.", "slug")

        normalized_email = normalize_email(owner_email)
        owner = self._repository.platform_user_by_email(normalized_email)
        existing_identity = owner is not None
        if owner is None and owner_password is None:
            raise InvalidOperationError(
                "Una identidad nueva debe recibir una contraseña inicial.",
                "owner.password",
            )
        if owner is not None and owner_password is not None:
            raise InvalidOperationError(
                "La identidad ya existe; omite password para conservar su credencial global.",
                "owner.password",
            )
        if owner is not None and owner.status != "active":
            raise ConflictError("La identidad propietaria está deshabilitada.", "owner.email")
        if owner is not None and owner.password_hash is None:
            raise ConflictError(
                "La identidad propietaria todavía no tiene una credencial activa.",
                "owner.email",
            )

        modules = self._repository.available_modules()
        module_codes = frozenset(module.code for module in modules)
        if not _REQUIRED_MODULES.issubset(module_codes):
            raise ServiceUnavailableError(
                "El catálogo global de módulos no está listo para crear workspaces."
            )
        permissions = self._repository.assignable_permissions()
        permission_codes = frozenset(permission.code for permission in permissions)
        if not _REQUIRED_ADMIN_PERMISSIONS.issubset(permission_codes):
            raise ServiceUnavailableError(
                "El catálogo global de permisos no está listo para crear workspaces."
            )

        now = datetime.now(UTC)
        workspace = Workspace(
            slug=slug,
            name=name,
            status="active",
            default_currency=default_currency,
            timezone=timezone,
            locale=locale,
            tax_default_rate=tax_default_rate,
        )
        try:
            self._session.add(workspace)
            self._session.flush()

            if owner is None:
                if owner_password is None:
                    raise RuntimeError("A new owner must have an initial password.")
                owner_id = uuid7()
                owner = PlatformUser(
                    id=owner_id,
                    external_subject=f"backoffice:{owner_id}",
                    email=normalized_email,
                    normalized_email=normalized_email,
                    display_name=owner_display_name,
                    password_hash=hash_password(owner_password),
                    password_changed_at=now,
                    status="active",
                )
                self._session.add(owner)
                self._session.flush()

            is_default_workspace = not self._repository.has_default_membership(owner.id)
            membership = WorkspaceMembership(
                workspace_id=workspace.id,
                platform_user_id=owner.id,
                status="active",
                activated_at=now,
                is_default=is_default_workspace,
            )
            self._session.add(membership)

            roles = {
                code: Role(
                    workspace_id=workspace.id,
                    code=code,
                    name=role_name,
                    status="active",
                    is_system=True,
                )
                for code, role_name in _ROLE_TEMPLATES
            }
            self._session.add_all(roles.values())
            workspace_scope = AccessScope(
                workspace_id=workspace.id,
                scope_type="workspace",
                legal_entity_id=None,
                branch_id=None,
            )
            self._session.add(workspace_scope)
            self._session.flush()

            self._session.add(
                RoleAssignment(
                    workspace_id=workspace.id,
                    membership_id=membership.id,
                    role_id=roles["workspace_admin"].id,
                    access_scope_id=workspace_scope.id,
                    status="active",
                    valid_from=now,
                )
            )
            for permission in permissions:
                self._session.add(
                    RolePermission(
                        workspace_id=workspace.id,
                        role_id=roles["workspace_admin"].id,
                        permission_id=permission.id,
                    )
                )
                for role_code, allowed_codes in _ROLE_PERMISSION_CODES.items():
                    if permission.code in allowed_codes or (
                        role_code == "manager" and permission.module_code in {"sales", "pos"}
                    ):
                        self._session.add(
                            RolePermission(
                                workspace_id=workspace.id,
                                role_id=roles[role_code].id,
                                permission_id=permission.id,
                            )
                        )

            self._session.add_all(
                ModuleEntitlement(
                    workspace_id=workspace.id,
                    module_definition_id=module.id,
                    status="enabled",
                    effective_from=now,
                )
                for module in modules
            )
            self._session.add_all(
                PaymentMethod(
                    workspace_id=workspace.id,
                    code=code,
                    name=method_name,
                    icon=icon,
                    status="active",
                    is_system=True,
                    channel=channel,
                    settlement_policy=settlement_policy,
                    affects_cash_drawer=affects_cash_drawer,
                    requires_evidence=requires_evidence,
                )
                for (
                    code,
                    method_name,
                    icon,
                    channel,
                    settlement_policy,
                    affects_cash_drawer,
                    requires_evidence,
                ) in _PAYMENT_METHODS
            )
            self._session.add_all(
                UnitOfMeasure(
                    workspace_id=workspace.id,
                    code=code,
                    name=unit_name,
                    symbol=symbol,
                    status="active",
                )
                for code, unit_name, symbol in _UNITS_OF_MEASURE
            )
            if "purchasing" in module_codes:
                self._session.add(
                    PurchasingSettings(
                        workspace_id=workspace.id,
                        approver_membership_id=membership.id,
                        notify_on_request=True,
                        updated_by_platform_user_id=owner.id,
                    )
                )
            if "crm" in module_codes:
                self._session.add(
                    CrmSettings(
                        workspace_id=workspace.id,
                        scoring_weights=dict(_CRM_SCORING_WEIGHTS),
                        updated_by_platform_user_id=owner.id,
                    )
                )
            self._session.add(
                AuditEntry(
                    workspace_id=workspace.id,
                    actor_platform_user_id=None,
                    action="workspace.provision",
                    target_type="workspace",
                    target_id=workspace.id,
                    outcome="success",
                    request_id=get_request_id() or None,
                    details={
                        "ownerPlatformUserId": str(owner.id),
                        "existingIdentity": existing_identity,
                        "enabledModules": sorted(module_codes),
                    },
                )
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            constraint_name = self._integrity_constraint(exc)
            if constraint_name == "uq_workspaces_slug":
                raise ConflictError("Ya existe un workspace con este slug.", "slug") from exc
            if constraint_name in {
                "uq_platform_users_email",
                "uq_platform_users_normalized_email",
            }:
                raise ConflictError(
                    "Ya existe una identidad con el email indicado.",
                    "owner.email",
                ) from exc
            raise ConflictError("No se pudo crear el workspace por un conflicto de datos.") from exc

        return ProvisionedWorkspace(
            workspace_id=workspace.id,
            slug=workspace.slug,
            name=workspace.name,
            owner=ProvisionedOwner(
                user_id=owner.id,
                membership_id=membership.id,
                email=owner.email,
                display_name=owner.display_name,
                existing_identity=existing_identity,
                is_default_workspace=is_default_workspace,
            ),
            administrator_role_id=roles["workspace_admin"].id,
            enabled_modules=tuple(sorted(module_codes)),
        )

    @staticmethod
    def _integrity_constraint(exc: IntegrityError) -> str | None:
        diagnostic = getattr(exc.orig, "diag", None)
        return getattr(diagnostic, "constraint_name", None)
