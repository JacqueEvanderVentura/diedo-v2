"""Persistence model registry used by Alembic metadata discovery."""

from app.db.models.administration import DemoSeedRegistry, PaymentMethod, UserInvitation
from app.db.models.audit import AuditEntry
from app.db.models.catalog import Item, ItemBranchAssignment, ItemCategory, UnitOfMeasure
from app.db.models.foundation import (
    Branch,
    LegalEntity,
    LegalEntityIdentity,
    LegalEntityRegionalRule,
    ModuleDefinition,
    ModuleEntitlement,
    RegionalPack,
    RegionalRuleVersion,
    Workspace,
)
from app.db.models.hr import (
    EmployeeDebt,
    EmployeeDebtPayment,
    EmployeeHrProfile,
    HrDocumentRecord,
    HrLeaveRequest,
)
from app.db.models.identity import (
    AccessScope,
    AuthSession,
    Permission,
    PlatformUser,
    Role,
    RoleAssignment,
    RolePermission,
    WorkspaceMembership,
)
from app.db.models.master_data import (
    Attachment,
    Customer,
    CustomerBranchAssignment,
    Employee,
    EmployeeBranchAssignment,
    EmployeeSchedule,
    EmployeeSupervisor,
)

__all__ = [
    "AccessScope",
    "Attachment",
    "AuthSession",
    "AuditEntry",
    "Branch",
    "Customer",
    "CustomerBranchAssignment",
    "DemoSeedRegistry",
    "Employee",
    "EmployeeBranchAssignment",
    "EmployeeDebt",
    "EmployeeDebtPayment",
    "EmployeeHrProfile",
    "EmployeeSchedule",
    "EmployeeSupervisor",
    "HrDocumentRecord",
    "HrLeaveRequest",
    "Item",
    "ItemBranchAssignment",
    "ItemCategory",
    "LegalEntity",
    "LegalEntityIdentity",
    "LegalEntityRegionalRule",
    "ModuleDefinition",
    "ModuleEntitlement",
    "Permission",
    "PaymentMethod",
    "PlatformUser",
    "RegionalPack",
    "RegionalRuleVersion",
    "Role",
    "RoleAssignment",
    "RolePermission",
    "Workspace",
    "WorkspaceMembership",
    "UnitOfMeasure",
    "UserInvitation",
]
