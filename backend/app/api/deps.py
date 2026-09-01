from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_session
from app.services.attachment_storage import AttachmentStorage, LocalAttachmentStorage
from app.services.auth import AuthPrincipal, AuthService
from app.services.authorization import AuthorizationService, PermissionGrant
from app.services.errors import AuthenticationError

DatabaseSession = Annotated[Session, Depends(get_session)]


def get_attachment_storage() -> AttachmentStorage:
    return LocalAttachmentStorage(settings.attachment_storage_root)


AttachmentStorageDep = Annotated[AttachmentStorage, Depends(get_attachment_storage)]

_bearer = HTTPBearer(
    auto_error=False,
    scheme_name="BearerAuth",
    description="JWT de acceso obtenido en POST /api/v1/auth/login.",
)


def get_current_principal(
    database: DatabaseSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthPrincipal:
    if credentials is None or credentials.scheme.casefold() != "bearer":
        raise AuthenticationError("Debes enviar un Bearer token válido.")
    return AuthService(database).authenticate_access_token(credentials.credentials)


CurrentPrincipal = Annotated[AuthPrincipal, Depends(get_current_principal)]


def require_permission(permission_code: str) -> Callable[..., PermissionGrant]:
    def dependency(
        database: DatabaseSession,
        principal: CurrentPrincipal,
    ) -> PermissionGrant:
        return AuthorizationService(database).require_permission(principal, permission_code)

    return dependency


MembershipReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("membership.read")),
]
MembershipManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("membership.manage")),
]
RoleReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("role.read")),
]
RoleManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("role.manage")),
]
WorkspaceReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("workspace.read")),
]
WorkspaceUpdateGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("workspace.update")),
]
DashboardReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("dashboard.read")),
]
LegalEntityReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("legal_entity.read")),
]
LegalEntityManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("legal_entity.manage")),
]
BranchReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("branch.read")),
]
BranchManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("branch.manage")),
]
CatalogReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("catalog.read")),
]
CatalogManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("catalog.manage")),
]
InventoryReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("inventory.read")),
]
InventoryManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("inventory.manage")),
]
InventoryMoveGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("inventory.move")),
]
SalesReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("sales.read")),
]
SalesQuoteManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("sales.quote.manage")),
]
PosReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.read")),
]
PosSellGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.sell")),
]
PosDiscountOverrideGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.discount.override")),
]
PosRegisterManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.register.manage")),
]
PosCashReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.cash.read")),
]
PosCashManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.cash.manage")),
]
PosReceivablesReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.receivables.read")),
]
PosReceivablesCollectGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.receivables.collect")),
]
PosReceivablesManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.receivables.manage")),
]
PosVoidGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("pos.void")),
]
PurchasingReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("purchasing.read")),
]
PurchasingSupplierManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("purchasing.suppliers.manage")),
]
PurchasingRequestCreateGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("purchasing.requests.create")),
]
PurchasingRequestReviewGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("purchasing.requests.review")),
]
PurchasingSettingsManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("purchasing.settings.manage")),
]
IncidentReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("incidents.read")),
]
IncidentCreateGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("incidents.create")),
]
IncidentManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("incidents.manage")),
]
CustomerReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("customer.read")),
]
CustomerManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("customer.manage")),
]
EmployeeReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("employee.read")),
]
EmployeeManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("employee.manage")),
]
EmployeeScheduleManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("employee.schedule.manage")),
]
HrOverviewReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.overview.read")),
]
HrProfileReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.profile.read")),
]
HrProfileManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.profile.manage")),
]
HrLeaveRequestGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.leave.request")),
]
HrLeaveReviewGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.leave.review")),
]
HrDebtReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.debt.read")),
]
HrDebtManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.debt.manage")),
]
HrDocumentReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.document.read")),
]
HrDocumentManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("hr.document.manage")),
]
AppointmentReadGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("appointment.read")),
]
AppointmentManageGrant = Annotated[
    PermissionGrant,
    Depends(require_permission("appointment.manage")),
]
