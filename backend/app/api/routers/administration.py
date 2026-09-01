from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Response, status

from app.api.deps import (
    BranchManageGrant,
    BranchReadGrant,
    CurrentPrincipal,
    DatabaseSession,
    LegalEntityManageGrant,
    LegalEntityReadGrant,
    WorkspaceReadGrant,
    WorkspaceUpdateGrant,
)
from app.db.models import Branch, PaymentMethod, Workspace
from app.repositories.administration import LegalEntityFiscalRecord
from app.schemas.administration import (
    BranchLegalEntityAssignmentResponse,
    BranchResponse,
    CreateBranchRequest,
    CreateLegalEntityRequest,
    CreatePaymentMethodRequest,
    FiscalProfileUpdateResponse,
    LegalEntityBranchReference,
    LegalEntityResponse,
    LegalEntitySharingResponse,
    LegalEntityTaxIdentityResponse,
    NewLegalEntityAssignment,
    PaymentMethodResponse,
    UpdateBranchLegalEntityAssignmentRequest,
    UpdateBranchRequest,
    UpdateFiscalProfileRequest,
    UpdateLegalEntityRequest,
    UpdatePaymentMethodRequest,
    UpdateWorkspaceSettingsRequest,
    WorkspaceSettingsResponse,
)
from app.schemas.common import ErrorResponse
from app.services.administration import AdministrationService
from app.services.authorization import AuthorizationService

router = APIRouter(prefix="/api/v1", tags=["administration"])

_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ErrorResponse},
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
}


def _workspace_response(workspace: Workspace) -> WorkspaceSettingsResponse:
    return WorkspaceSettingsResponse(
        id=workspace.id,
        name=workspace.name,
        default_currency=workspace.default_currency,
        timezone=workspace.timezone,
        locale=workspace.locale,
        tax_default_rate=workspace.tax_default_rate,
        version=workspace.version,
    )


def _legal_entity_response(record: LegalEntityFiscalRecord) -> LegalEntityResponse:
    entity = record.entity
    identity = record.tax_identity
    if identity is not None:
        if identity.identifier_type is None or identity.identifier_value is None:
            raise RuntimeError("A primary legal-entity identity must have an identifier.")
        tax_identity = LegalEntityTaxIdentityResponse(
            id=identity.id,
            jurisdiction_code=identity.jurisdiction_code,
            identifier_type=identity.identifier_type,
            identifier_value=identity.identifier_value,
            registered_name=identity.registered_name,
            valid_from=identity.valid_from,
            valid_to=identity.valid_to,
        )
    else:
        tax_identity = None
    return LegalEntityResponse(
        id=entity.id,
        code=entity.code,
        legal_name=entity.legal_name,
        display_name=entity.display_name,
        status=entity.status,  # type: ignore[arg-type]
        version=entity.version,
        tax_identity=tax_identity,
        branches=[
            LegalEntityBranchReference(id=branch.id, code=branch.code, name=branch.name)
            for branch in record.branches
        ],
        sharing=LegalEntitySharingResponse(
            branch_count=record.branch_count,
            shared=record.branch_count > 1,
        ),
    )


def _branch_response(branch: Branch) -> BranchResponse:
    return BranchResponse(
        id=branch.id,
        legal_entity_id=branch.legal_entity_id,
        code=branch.code,
        name=branch.name,
        status=branch.status,  # type: ignore[arg-type]
        timezone=branch.timezone,
        details=AdministrationService.branch_details(branch),
        version=branch.version,
    )


def _fiscal_profile_update_response(
    record: LegalEntityFiscalRecord,
) -> FiscalProfileUpdateResponse:
    payload = _legal_entity_response(record).model_dump(by_alias=False)
    payload["affected_branch_ids"] = [branch.id for branch in record.branches]
    return FiscalProfileUpdateResponse.model_validate(payload)


def _payment_method_response(method: PaymentMethod) -> PaymentMethodResponse:
    return PaymentMethodResponse(
        id=method.id,
        code=method.code,
        name=method.name,
        icon=method.icon,
        status=method.status,  # type: ignore[arg-type]
        is_system=method.is_system,
        channel=method.channel,  # type: ignore[arg-type]
        settlement_policy=method.settlement_policy,  # type: ignore[arg-type]
        affects_cash_drawer=method.affects_cash_drawer,
        requires_evidence=method.requires_evidence,
        version=method.version,
    )


@router.get("/workspace/settings", responses=_RESPONSES)
def get_workspace_settings(
    database: DatabaseSession,
    grant: WorkspaceReadGrant,
) -> WorkspaceSettingsResponse:
    return _workspace_response(AdministrationService(database).workspace_settings(grant))


@router.patch("/workspace/settings", responses=_RESPONSES)
def update_workspace_settings(
    payload: UpdateWorkspaceSettingsRequest,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> WorkspaceSettingsResponse:
    changes = payload.model_dump(exclude={"version"}, exclude_none=True, by_alias=False)
    workspace = AdministrationService(database).update_workspace_settings(
        grant,
        version=payload.version,
        changes=changes,
    )
    return _workspace_response(workspace)


@router.get("/legal-entities", responses=_RESPONSES)
def list_legal_entities(
    database: DatabaseSession,
    grant: LegalEntityReadGrant,
) -> list[LegalEntityResponse]:
    return [
        _legal_entity_response(record)
        for record in AdministrationService(database).list_legal_entities(grant)
    ]


@router.post(
    "/legal-entities",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
)
def create_legal_entity(
    payload: CreateLegalEntityRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: LegalEntityManageGrant,
) -> LegalEntityResponse:
    return _legal_entity_response(
        AdministrationService(database).create_legal_entity(
            principal=principal,
            grant=grant,
            code=payload.code,
            profile=payload,
        )
    )


@router.get("/legal-entities/{legal_entity_id}", responses=_RESPONSES)
def get_legal_entity(
    legal_entity_id: UUID,
    database: DatabaseSession,
    grant: LegalEntityReadGrant,
) -> LegalEntityResponse:
    return _legal_entity_response(
        AdministrationService(database).get_legal_entity_profile(grant, legal_entity_id)
    )


@router.patch("/legal-entities/{legal_entity_id}", responses=_RESPONSES)
def update_legal_entity(
    legal_entity_id: UUID,
    payload: UpdateLegalEntityRequest,
    database: DatabaseSession,
    grant: LegalEntityManageGrant,
) -> LegalEntityResponse:
    record = AdministrationService(database).update_legal_entity(
        grant,
        legal_entity_id,
        version=payload.version,
        changes=payload.model_dump(exclude={"version"}, exclude_none=True, by_alias=False),
    )
    return _legal_entity_response(record)


@router.put("/legal-entities/{legal_entity_id}/fiscal-profile", responses=_RESPONSES)
def update_fiscal_profile(
    legal_entity_id: UUID,
    payload: UpdateFiscalProfileRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: LegalEntityManageGrant,
) -> FiscalProfileUpdateResponse:
    record = AdministrationService(database).update_fiscal_profile(
        principal=principal,
        grant=grant,
        legal_entity_id=legal_entity_id,
        version=payload.version,
        legal_name=payload.legal_name,
        display_name=payload.display_name,
        tax_identity=payload.tax_identity,
        effective_from=payload.effective_from,
    )
    return _fiscal_profile_update_response(record)


@router.get("/branches", responses=_RESPONSES)
def list_branches(
    database: DatabaseSession,
    grant: BranchReadGrant,
) -> list[BranchResponse]:
    return [
        _branch_response(branch) for branch in AdministrationService(database).list_branches(grant)
    ]


@router.post("/branches", status_code=status.HTTP_201_CREATED, responses=_RESPONSES)
def create_branch(
    payload: CreateBranchRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: BranchManageGrant,
) -> BranchResponse:
    if isinstance(payload.legal_entity_assignment, NewLegalEntityAssignment):
        legal_entity_id = None
        new_profile = payload.legal_entity_assignment.fiscal_profile
        legal_entity_grant = AuthorizationService(database).require_permission(
            principal,
            "legal_entity.manage",
        )
    elif payload.legal_entity_assignment is not None:
        legal_entity_id = payload.legal_entity_assignment.legal_entity_id
        new_profile = None
        legal_entity_grant = None
    else:
        legal_entity_id = payload.legal_entity_id
        new_profile = None
        legal_entity_grant = None
    branch = AdministrationService(database).create_branch(
        principal=principal,
        grant=grant,
        legal_entity_grant=legal_entity_grant,
        legal_entity_id=legal_entity_id,
        new_profile=new_profile,
        code=payload.code,
        name=payload.name,
        timezone=payload.timezone,
        details=payload.details,
    )
    return _branch_response(branch)


@router.patch("/branches/{branch_id}", responses=_RESPONSES)
def update_branch(
    branch_id: UUID,
    payload: UpdateBranchRequest,
    database: DatabaseSession,
    grant: BranchManageGrant,
) -> BranchResponse:
    changes = payload.model_dump(
        exclude={"version", "details"},
        exclude_unset=True,
        exclude_none=True,
        by_alias=False,
    )
    if payload.details is not None:
        changes["details"] = payload.details.model_dump(
            exclude_unset=True,
            mode="json",
        )
    branch = AdministrationService(database).update_branch(
        grant,
        branch_id,
        version=payload.version,
        changes=changes,
    )
    return _branch_response(branch)


@router.put(
    "/branches/{branch_id}/legal-entity-assignment",
    responses=_RESPONSES,
)
def update_branch_legal_entity_assignment(
    branch_id: UUID,
    payload: UpdateBranchLegalEntityAssignmentRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    branch_grant: BranchManageGrant,
    legal_entity_grant: LegalEntityManageGrant,
) -> BranchLegalEntityAssignmentResponse:
    if isinstance(payload.assignment, NewLegalEntityAssignment):
        target_legal_entity_id = None
        new_profile = payload.assignment.fiscal_profile
    else:
        target_legal_entity_id = payload.assignment.legal_entity_id
        new_profile = None
    result = AdministrationService(database).assign_branch_legal_entity(
        principal=principal,
        branch_grant=branch_grant,
        legal_entity_grant=legal_entity_grant,
        branch_id=branch_id,
        version=payload.version,
        target_legal_entity_id=target_legal_entity_id,
        new_profile=new_profile,
    )
    return BranchLegalEntityAssignmentResponse(
        branch=_branch_response(result.branch),
        legal_entity=_legal_entity_response(result.legal_entity),
        previous_legal_entity_id=result.previous_legal_entity_id,
    )


@router.delete(
    "/branches/{branch_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPONSES,
)
def archive_branch(
    branch_id: UUID,
    database: DatabaseSession,
    grant: BranchManageGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    AdministrationService(database).archive_branch(grant, branch_id, version)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/payment-methods", responses=_RESPONSES)
def list_payment_methods(
    database: DatabaseSession,
    grant: WorkspaceReadGrant,
) -> list[PaymentMethodResponse]:
    return [
        _payment_method_response(method)
        for method in AdministrationService(database).list_payment_methods(grant)
    ]


@router.post(
    "/payment-methods",
    status_code=status.HTTP_201_CREATED,
    responses=_RESPONSES,
)
def create_payment_method(
    payload: CreatePaymentMethodRequest,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> PaymentMethodResponse:
    method = AdministrationService(database).create_payment_method(
        grant,
        code=payload.code,
        name=payload.name,
        icon=payload.icon,
        channel=payload.channel,
        settlement_policy=payload.settlement_policy,
        affects_cash_drawer=payload.affects_cash_drawer,
        requires_evidence=payload.requires_evidence,
    )
    return _payment_method_response(method)


@router.patch("/payment-methods/{payment_method_id}", responses=_RESPONSES)
def update_payment_method(
    payment_method_id: UUID,
    payload: UpdatePaymentMethodRequest,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
) -> PaymentMethodResponse:
    method = AdministrationService(database).update_payment_method(
        grant,
        payment_method_id,
        version=payload.version,
        changes=payload.model_dump(exclude={"version"}, exclude_none=True, by_alias=False),
    )
    return _payment_method_response(method)


@router.delete(
    "/payment-methods/{payment_method_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_RESPONSES,
)
def archive_payment_method(
    payment_method_id: UUID,
    database: DatabaseSession,
    grant: WorkspaceUpdateGrant,
    version: Annotated[int, Query(ge=1)],
) -> Response:
    AdministrationService(database).archive_payment_method(grant, payment_method_id, version)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
