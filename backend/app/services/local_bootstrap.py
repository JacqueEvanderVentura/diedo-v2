from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import (
    AccessScope,
    AppointmentResource,
    AssetCategory,
    Branch,
    CrmSettings,
    InventoryWarehouse,
    LegalEntity,
    ModuleDefinition,
    ModuleEntitlement,
    PaymentMethod,
    Permission,
    PlatformUser,
    PurchasingSettings,
    RegionalPack,
    Role,
    RoleAssignment,
    RolePermission,
    UnitOfMeasure,
    Workspace,
    WorkspaceMembership,
)
from app.db.models.agenda import DEFAULT_APPOINTMENT_RESOURCES
from app.db.models.inventory import DEFAULT_ASSET_CATEGORIES

_PERMISSIONS = (
    (
        "dashboard.read",
        "dashboard",
        "read",
        "Ver dashboard",
        "View branch-scoped business summaries and recent operational activity.",
        10,
    ),
    (
        "workspace.read",
        "foundation",
        "read",
        "Ver espacio de trabajo",
        "View workspace configuration.",
        10,
    ),
    (
        "workspace.update",
        "foundation",
        "update",
        "Editar espacio de trabajo",
        "Change workspace configuration.",
        20,
    ),
    (
        "legal_entity.read",
        "foundation",
        "read",
        "Ver entidades legales",
        "View legal entities.",
        30,
    ),
    (
        "legal_entity.manage",
        "foundation",
        "manage",
        "Gestionar entidades legales",
        "Create and change legal entities.",
        40,
    ),
    ("branch.read", "foundation", "read", "Ver sucursales", "View branches.", 50),
    (
        "branch.manage",
        "foundation",
        "manage",
        "Gestionar sucursales",
        "Create and change branches.",
        60,
    ),
    (
        "entitlement.read",
        "foundation",
        "read",
        "Ver módulos habilitados",
        "View enabled ERP modules.",
        70,
    ),
    ("audit.read", "foundation", "read", "Ver auditoría", "View workspace audit history.", 80),
    ("membership.read", "iam", "read", "Ver usuarios", "View workspace memberships.", 10),
    (
        "membership.manage",
        "iam",
        "manage",
        "Gestionar usuarios",
        "Invite and manage workspace memberships.",
        20,
    ),
    (
        "role.read",
        "iam",
        "read",
        "Ver roles y permisos",
        "View roles and permission assignments.",
        30,
    ),
    (
        "role.manage",
        "iam",
        "manage",
        "Gestionar roles y permisos",
        "Create roles and assign permissions.",
        40,
    ),
    (
        "catalog.read",
        "catalog",
        "read",
        "Ver catálogo",
        "View categories, units, and products in the authorized scope.",
        10,
    ),
    (
        "catalog.manage",
        "catalog",
        "manage",
        "Gestionar catálogo",
        "Create and change categories and products in the authorized scope.",
        20,
    ),
    (
        "customer.read",
        "crm",
        "read",
        "Ver clientes",
        "View customers in the authorized scope.",
        10,
    ),
    (
        "customer.manage",
        "crm",
        "manage",
        "Gestionar clientes",
        "Create, change, and archive customers in the authorized scope.",
        20,
    ),
    (
        "crm.read",
        "crm",
        "read",
        "Ver CRM",
        "View leads, pipeline, activities, customer commerce, and CRM summaries.",
        30,
    ),
    (
        "crm.manage",
        "crm",
        "manage",
        "Gestionar CRM",
        "Create and update leads, opportunities, activities, scoring, and conversions.",
        40,
    ),
    (
        "finance.read",
        "finance",
        "read",
        "Ver finanzas",
        "View branch-scoped financial overviews, income, expenses, liabilities, "
        "budgets, and accounts.",
        10,
    ),
    (
        "finance.manage",
        "finance",
        "manage",
        "Gestionar finanzas",
        "Create, update, archive, void, and pay operational financial records.",
        20,
    ),
    (
        "employee.read",
        "hr",
        "read",
        "Ver empleados básicos",
        "View basic employee records and schedules in the authorized scope.",
        10,
    ),
    (
        "employee.manage",
        "hr",
        "manage",
        "Gestionar empleados básicos",
        "Create, change, and archive basic employee records.",
        20,
    ),
    (
        "employee.schedule.manage",
        "hr",
        "manage",
        "Gestionar horarios",
        "Replace employee weekly schedules in the authorized scope.",
        30,
    ),
    (
        "hr.overview.read",
        "hr",
        "read",
        "Ver overview RRHH",
        "View HR overview metrics.",
        40,
    ),
    (
        "hr.profile.read",
        "hr",
        "read",
        "Ver fichas RRHH",
        "View sensitive employee HR profiles.",
        50,
    ),
    (
        "hr.profile.manage",
        "hr",
        "manage",
        "Gestionar fichas RRHH",
        "Change sensitive employee HR profiles.",
        60,
    ),
    (
        "hr.leave.request",
        "hr",
        "request",
        "Solicitar vacaciones",
        "Request and view own leave.",
        70,
    ),
    (
        "hr.leave.review",
        "hr",
        "review",
        "Aprobar vacaciones",
        "Review employee leave requests.",
        80,
    ),
    (
        "hr.debt.read",
        "hr",
        "read",
        "Ver cuentas por cobrar RRHH",
        "View employee receivables.",
        90,
    ),
    (
        "hr.debt.manage",
        "hr",
        "manage",
        "Gestionar cuentas por cobrar RRHH",
        "Create employee debts and register payments.",
        100,
    ),
    (
        "hr.document.read",
        "hr",
        "read",
        "Ver documentos RRHH",
        "View generated HR document history.",
        110,
    ),
    (
        "hr.document.manage",
        "hr",
        "manage",
        "Generar documentos RRHH",
        "Generate HR document records.",
        120,
    ),
    (
        "appointment.read",
        "appointments",
        "read",
        "Ver agenda",
        "View appointment resources, calendar, and appointment management.",
        10,
    ),
    (
        "appointment.manage",
        "appointments",
        "manage",
        "Gestionar citas",
        "Create, reschedule, update, and cancel appointments.",
        20,
    ),
    (
        "inventory.read",
        "inventory",
        "read",
        "Ver inventario",
        "View inventory summaries, items, movements, warehouses, and assets.",
        10,
    ),
    (
        "inventory.manage",
        "inventory",
        "manage",
        "Gestionar inventario y activos",
        "Create and update inventory items, asset categories, and assets.",
        20,
    ),
    (
        "inventory.move",
        "inventory",
        "move",
        "Registrar movimientos de inventario",
        "Register idempotent stock outputs and adjustments.",
        30,
    ),
    (
        "purchasing.read",
        "purchasing",
        "read",
        "Ver compras",
        "View suppliers, purchase requests, statistics, and settings.",
        10,
    ),
    (
        "purchasing.suppliers.manage",
        "purchasing",
        "suppliers.manage",
        "Gestionar proveedores",
        "Create, update, deactivate, and archive suppliers.",
        20,
    ),
    (
        "purchasing.requests.create",
        "purchasing",
        "requests.create",
        "Crear solicitudes de compra",
        "Create and edit pending purchase requests.",
        30,
    ),
    (
        "purchasing.requests.review",
        "purchasing",
        "requests.review",
        "Aprobar solicitudes de compra",
        "Approve, reject, and mark approved requests as delivered.",
        40,
    ),
    (
        "purchasing.settings.manage",
        "purchasing",
        "settings.manage",
        "Configurar compras",
        "Choose the designated approver and notification preference.",
        50,
    ),
    (
        "incidents.read",
        "incidents",
        "read",
        "Ver incidencias",
        "View branch-scoped incidents, activity, participants, and evidence.",
        10,
    ),
    (
        "incidents.create",
        "incidents",
        "create",
        "Reportar incidencias",
        "Create incidents in authorized branches.",
        20,
    ),
    (
        "incidents.manage",
        "incidents",
        "manage",
        "Gestionar incidencias",
        "Change status, comment, and attach image evidence.",
        30,
    ),
    (
        "sales.read",
        "sales",
        "read",
        "Ver ventas",
        "View posted sales and their immutable commercial snapshots.",
        10,
    ),
    (
        "sales.quote.manage",
        "sales",
        "quote.manage",
        "Gestionar cotizaciones",
        "Create, update, cancel, expire, and convert quotes or held carts.",
        20,
    ),
    (
        "pos.read",
        "pos",
        "read",
        "Ver Terminal POS",
        "View the POS catalog, register state, and recent operations.",
        10,
    ),
    (
        "pos.sell",
        "pos",
        "sell",
        "Registrar ventas",
        "Post idempotent sales in an authorized branch.",
        20,
    ),
    (
        "pos.discount.override",
        "pos",
        "discount.override",
        "Autorizar descuentos",
        "Override standard discounts while posting a sale.",
        30,
    ),
    (
        "pos.register.manage",
        "pos",
        "register.manage",
        "Gestionar turnos de caja",
        "Open and close branch cash-register sessions.",
        40,
    ),
    (
        "pos.cash.read",
        "pos",
        "cash.read",
        "Ver movimientos de caja",
        "View branch cash-register sessions and drawer movements.",
        50,
    ),
    (
        "pos.cash.manage",
        "pos",
        "cash.manage",
        "Gestionar movimientos de caja",
        "Register idempotent cash income, expenses, and reversals.",
        60,
    ),
    (
        "pos.receivables.read",
        "pos",
        "receivables.read",
        "Ver cuentas por cobrar",
        "View customer balances, payment history, and evidence.",
        70,
    ),
    (
        "pos.receivables.collect",
        "pos",
        "receivables.collect",
        "Cobrar cuentas",
        "Post and reverse customer receivable payments.",
        80,
    ),
    (
        "pos.receivables.manage",
        "pos",
        "receivables.manage",
        "Gestionar cuentas por cobrar",
        "Create, cancel, and administer customer receivables.",
        90,
    ),
    (
        "pos.void",
        "pos",
        "void",
        "Anular ventas",
        "Void posted sales and record their compensating movements.",
        100,
    ),
)

_TERMINAL_POS_PERMISSION_CODES = tuple(
    permission[0] for permission in _PERMISSIONS if permission[1] in {"sales", "pos"}
)

_ROLE_PERMISSION_TEMPLATES = {
    "workspace_admin": _TERMINAL_POS_PERMISSION_CODES
    + ("dashboard.read", "crm.read", "crm.manage", "finance.read", "finance.manage"),
    "manager": _TERMINAL_POS_PERMISSION_CODES
    + ("dashboard.read", "crm.read", "crm.manage", "finance.read", "finance.manage"),
    "cashier": (
        "dashboard.read",
        "sales.read",
        "pos.read",
        "pos.sell",
        "pos.register.manage",
        "pos.cash.read",
        "pos.cash.manage",
        "pos.receivables.read",
        "pos.receivables.collect",
    ),
    "supervisor": (
        "dashboard.read",
        "crm.read",
        "crm.manage",
        "finance.read",
        "sales.read",
        "pos.read",
        "pos.cash.read",
        "pos.receivables.read",
        "pos.receivables.collect",
        "pos.void",
    ),
    "seller": (
        "dashboard.read",
        "crm.read",
        "crm.manage",
        "sales.read",
        "sales.quote.manage",
        "pos.read",
        "pos.sell",
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

_ROLE_TEMPLATES = (
    ("workspace_admin", "Administrador", True),
    ("manager", "Gerente", True),
    ("supervisor", "Supervisor", True),
    ("cashier", "Cajero", True),
    ("seller", "Vendedor", True),
)

_LOCAL_OWNER_EMAIL = "owner@erp.dev"

_MODULES: tuple[tuple[str, str, str, str, tuple[str, ...]], ...] = (
    ("foundation", "Foundation", "core", "available", ()),
    ("dashboard", "Dashboard", "optional", "available", ("foundation",)),
    ("iam", "Identity and access", "core", "available", ("foundation",)),
    ("crm", "Customer relationship management", "optional", "available", ("foundation",)),
    ("catalog", "Product and service catalog", "optional", "available", ("foundation",)),
    ("sales", "Sales", "optional", "available", ("crm", "catalog")),
    ("purchasing", "Purchasing", "optional", "available", ("foundation", "catalog")),
    ("inventory", "Inventory and assets", "optional", "available", ("foundation", "catalog")),
    ("incidents", "Incidents", "optional", "available", ("foundation",)),
    ("finance", "Finanzas", "optional", "available", ("foundation",)),
    ("accounting", "Accounting", "optional", "planned", ("sales", "purchasing")),
    ("hr", "Human resources", "optional", "available", ("foundation",)),
    ("payroll", "Payroll", "optional", "planned", ("hr", "accounting")),
    ("pos", "Point of sale", "optional", "available", ("sales", "inventory")),
    ("appointments", "Appointments", "optional", "available", ("crm", "catalog", "hr")),
    ("lodging", "Lodging", "optional", "planned", ("crm", "catalog", "sales")),
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


@dataclass(frozen=True)
class BootstrapSummary:
    workspace_id: UUID
    legal_entity_id: UUID
    branch_id: UUID
    platform_user_id: UUID
    membership_id: UUID
    enabled_modules: tuple[str, ...]


def bootstrap_local_foundation(
    session: Session,
    owner_password_hash: str | None = None,
) -> BootstrapSummary:
    """Install deterministic local catalogs and a non-sensitive development workspace."""

    now = datetime.now(UTC)
    _upsert_catalogs(session)

    _insert_do_nothing(
        session,
        Workspace,
        {
            "slug": "local-erp",
            "name": "Local ERP Workspace",
            "status": "active",
            "default_currency": "DOP",
            "timezone": "America/Santo_Domingo",
            "locale": "es-DO",
        },
    )
    workspace = session.scalar(select(Workspace).where(Workspace.slug == "local-erp"))
    if workspace is None:
        raise RuntimeError("Local workspace could not be loaded after bootstrap.")
    _upsert_units_of_measure(session, workspace.id)
    _upsert_payment_methods(session, workspace.id)

    _insert_do_nothing(
        session,
        PlatformUser,
        {
            "external_subject": "local:owner",
            "email": _LOCAL_OWNER_EMAIL,
            "normalized_email": _LOCAL_OWNER_EMAIL,
            "display_name": "Local Owner",
            "password_hash": owner_password_hash,
            "password_changed_at": now if owner_password_hash is not None else None,
            "status": "active",
        },
    )
    user = session.scalar(
        select(PlatformUser).where(PlatformUser.external_subject == "local:owner")
    )
    if user is None:
        raise RuntimeError("Local platform user could not be loaded after bootstrap.")
    if user.normalized_email == "owner@erp.local.test":
        user.email = _LOCAL_OWNER_EMAIL
        user.normalized_email = _LOCAL_OWNER_EMAIL
    if owner_password_hash is not None:
        user.password_hash = owner_password_hash
        user.password_changed_at = now

    _insert_do_nothing(
        session,
        LegalEntity,
        {
            "workspace_id": workspace.id,
            "code": "MAIN",
            "legal_name": "Local ERP Company",
            "display_name": "Local ERP",
            "status": "active",
        },
    )
    legal_entity = session.scalar(
        select(LegalEntity).where(
            LegalEntity.workspace_id == workspace.id,
            LegalEntity.code == "MAIN",
        )
    )
    if legal_entity is None:
        raise RuntimeError("Local legal entity could not be loaded after bootstrap.")

    _insert_do_nothing(
        session,
        Branch,
        {
            "workspace_id": workspace.id,
            "legal_entity_id": legal_entity.id,
            "code": "HQ",
            "name": "Main Branch",
            "status": "active",
            "timezone": workspace.timezone,
        },
    )
    branch = session.scalar(
        select(Branch).where(Branch.workspace_id == workspace.id, Branch.code == "HQ")
    )
    if branch is None:
        raise RuntimeError("Local branch could not be loaded after bootstrap.")
    _upsert_appointment_resources(session, workspace.id, branch.id)
    active_branch_ids = session.scalars(
        select(Branch.id).where(
            Branch.workspace_id == workspace.id,
            Branch.status == "active",
        )
    ).all()
    for active_branch_id in active_branch_ids:
        _upsert_inventory_defaults(session, workspace.id, active_branch_id)

    _insert_do_nothing(
        session,
        WorkspaceMembership,
        {
            "workspace_id": workspace.id,
            "platform_user_id": user.id,
            "status": "active",
            "activated_at": now,
            "is_default": True,
        },
    )
    membership = session.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace.id,
            WorkspaceMembership.platform_user_id == user.id,
        )
    )
    if membership is None:
        raise RuntimeError("Local membership could not be loaded after bootstrap.")
    membership.status = "active"
    membership.revoked_at = None
    membership.activated_at = membership.activated_at or now
    membership.is_default = True

    for role_code, role_name, is_system in _ROLE_TEMPLATES:
        _insert_do_nothing(
            session,
            Role,
            {
                "workspace_id": workspace.id,
                "code": role_code,
                "name": role_name,
                "status": "active",
                "is_system": is_system,
            },
        )
    _grant_role_template_permissions(session, workspace.id)
    role = session.scalar(
        select(Role).where(Role.workspace_id == workspace.id, Role.code == "workspace_admin")
    )
    if role is None:
        raise RuntimeError("Local administrator role could not be loaded after bootstrap.")

    _insert_do_nothing(
        session,
        AccessScope,
        {"workspace_id": workspace.id, "scope_type": "workspace"},
    )
    scope = session.scalar(
        select(AccessScope).where(
            AccessScope.workspace_id == workspace.id,
            AccessScope.scope_type == "workspace",
        )
    )
    if scope is None:
        raise RuntimeError("Local workspace scope could not be loaded after bootstrap.")

    permission_ids = session.scalars(
        select(Permission.id).where(Permission.is_platform_only.is_(False))
    ).all()
    for permission_id in permission_ids:
        _insert_do_nothing(
            session,
            RolePermission,
            {
                "workspace_id": workspace.id,
                "role_id": role.id,
                "permission_id": permission_id,
            },
        )

    _insert_do_nothing(
        session,
        RoleAssignment,
        {
            "workspace_id": workspace.id,
            "membership_id": membership.id,
            "role_id": role.id,
            "access_scope_id": scope.id,
            "status": "active",
            "valid_from": now,
        },
    )

    enabled_modules = (
        "foundation",
        "dashboard",
        "iam",
        "catalog",
        "crm",
        "sales",
        "hr",
        "appointments",
        "inventory",
        "pos",
        "purchasing",
        "incidents",
        "finance",
    )
    for module_code in enabled_modules:
        module_id = session.scalar(
            select(ModuleDefinition.id).where(ModuleDefinition.code == module_code)
        )
        if module_id is None:
            raise RuntimeError(f"Module {module_code!r} was not installed.")
        _insert_do_nothing(
            session,
            ModuleEntitlement,
            {
                "workspace_id": workspace.id,
                "module_definition_id": module_id,
                "status": "enabled",
                "effective_from": now,
            },
        )

    _insert_do_nothing(
        session,
        PurchasingSettings,
        {
            "workspace_id": workspace.id,
            "approver_membership_id": membership.id,
            "notify_on_request": True,
            "updated_by_platform_user_id": user.id,
        },
    )
    _insert_do_nothing(
        session,
        CrmSettings,
        {
            "workspace_id": workspace.id,
            "scoring_weights": {
                "pos": 1,
                "agenda": 1,
                "inventarios": 1,
                "finanzas": 1,
                "crm": 1,
                "incidencias": 0.8,
                "config": 0.6,
            },
            "updated_by_platform_user_id": user.id,
        },
    )

    return BootstrapSummary(
        workspace_id=workspace.id,
        legal_entity_id=legal_entity.id,
        branch_id=branch.id,
        platform_user_id=user.id,
        membership_id=membership.id,
        enabled_modules=enabled_modules,
    )


def _upsert_catalogs(session: Session) -> None:
    for code, name, kind, status, dependencies in _MODULES:
        statement = (
            insert(ModuleDefinition)
            .values(
                code=code,
                name=name,
                kind=kind,
                status=status,
                dependency_codes=list(dependencies),
            )
            .on_conflict_do_update(
                index_elements=[ModuleDefinition.code],
                set_={
                    "name": name,
                    "kind": kind,
                    "status": status,
                    "dependency_codes": list(dependencies),
                    "updated_at": func.now(),
                },
            )
        )
        session.execute(statement)

    for code, module_code, action, name, description, sort_order in _PERMISSIONS:
        statement = (
            insert(Permission)
            .values(
                code=code,
                module_code=module_code,
                action=action,
                name=name,
                description=description,
                sort_order=sort_order,
                is_platform_only=False,
            )
            .on_conflict_do_update(
                index_elements=[Permission.code],
                set_={
                    "module_code": module_code,
                    "action": action,
                    "name": name,
                    "description": description,
                    "sort_order": sort_order,
                    "is_platform_only": False,
                    "updated_at": func.now(),
                },
            )
        )
        session.execute(statement)

    session.execute(
        insert(RegionalPack)
        .values(
            code="do",
            name="Dominican Republic",
            jurisdiction_code="DO",
            status="planned",
        )
        .on_conflict_do_update(
            index_elements=[RegionalPack.code],
            set_={
                "name": "Dominican Republic",
                "jurisdiction_code": "DO",
                "status": "planned",
                "updated_at": func.now(),
            },
        )
    )


def _grant_role_template_permissions(session: Session, workspace_id: UUID) -> None:
    for role_code, permission_codes in _ROLE_PERMISSION_TEMPLATES.items():
        role_id = session.scalar(
            select(Role.id).where(
                Role.workspace_id == workspace_id,
                Role.code == role_code,
                Role.status == "active",
            )
        )
        if role_id is None:
            continue
        permission_ids = session.scalars(
            select(Permission.id).where(Permission.code.in_(permission_codes))
        ).all()
        for permission_id in permission_ids:
            _insert_do_nothing(
                session,
                RolePermission,
                {
                    "workspace_id": workspace_id,
                    "role_id": role_id,
                    "permission_id": permission_id,
                },
            )


def _upsert_payment_methods(session: Session, workspace_id: UUID) -> None:
    for (
        code,
        name,
        icon,
        channel,
        settlement_policy,
        affects_cash_drawer,
        requires_evidence,
    ) in _PAYMENT_METHODS:
        session.execute(
            insert(PaymentMethod)
            .values(
                workspace_id=workspace_id,
                code=code,
                name=name,
                icon=icon,
                status="active",
                is_system=True,
                channel=channel,
                settlement_policy=settlement_policy,
                affects_cash_drawer=affects_cash_drawer,
                requires_evidence=requires_evidence,
            )
            .on_conflict_do_update(
                constraint="uq_payment_methods_workspace_code",
                set_={
                    "name": name,
                    "icon": icon,
                    "status": "active",
                    "is_system": True,
                    "channel": channel,
                    "settlement_policy": settlement_policy,
                    "affects_cash_drawer": affects_cash_drawer,
                    "requires_evidence": requires_evidence,
                    "updated_at": func.now(),
                },
            )
        )


def _upsert_units_of_measure(session: Session, workspace_id: UUID) -> None:
    for code, name, symbol in _UNITS_OF_MEASURE:
        statement = (
            insert(UnitOfMeasure)
            .values(
                workspace_id=workspace_id,
                code=code,
                name=name,
                symbol=symbol,
                status="active",
            )
            .on_conflict_do_update(
                constraint="uq_units_of_measure_workspace_code",
                set_={
                    "name": name,
                    "symbol": symbol,
                    "status": "active",
                    "updated_at": func.now(),
                },
            )
        )
        session.execute(statement)


def _upsert_appointment_resources(session: Session, workspace_id: UUID, branch_id: UUID) -> None:
    for code, name in DEFAULT_APPOINTMENT_RESOURCES:
        statement = (
            insert(AppointmentResource)
            .values(
                workspace_id=workspace_id,
                branch_id=branch_id,
                code=code,
                name=name,
                resource_type="room",
                status="active",
            )
            .on_conflict_do_update(
                constraint="uq_appointment_resources_scope_code",
                set_={
                    "name": name,
                    "resource_type": "room",
                    "status": "active",
                    "updated_at": func.now(),
                },
            )
        )
        session.execute(statement)


def _upsert_inventory_defaults(session: Session, workspace_id: UUID, branch_id: UUID) -> None:
    session.execute(
        insert(InventoryWarehouse)
        .values(
            workspace_id=workspace_id,
            branch_id=branch_id,
            code="main",
            name="Almacén principal",
            is_default=True,
            status="active",
        )
        .on_conflict_do_update(
            constraint="uq_inventory_warehouses_scope_code",
            set_={
                "name": "Almacén principal",
                "is_default": True,
                "status": "active",
                "updated_at": func.now(),
            },
        )
    )
    for code, name in DEFAULT_ASSET_CATEGORIES:
        session.execute(
            insert(AssetCategory)
            .values(
                workspace_id=workspace_id,
                code=code,
                name=name,
                normalized_name=name.casefold(),
                status="active",
            )
            .on_conflict_do_update(
                constraint="uq_asset_categories_workspace_code",
                set_={
                    "name": name,
                    "normalized_name": name.casefold(),
                    "status": "active",
                    "updated_at": func.now(),
                },
            )
        )


def _insert_do_nothing(session: Session, model: type, values: dict[str, object]) -> None:
    session.execute(insert(model).values(**values).on_conflict_do_nothing())
