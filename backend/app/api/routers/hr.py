from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Header, Query, status

from app.api.deps import (
    CurrentPrincipal,
    DatabaseSession,
    HrDebtManageGrant,
    HrDebtReadGrant,
    HrDocumentManageGrant,
    HrDocumentReadGrant,
    HrLeaveRequestGrant,
    HrLeaveReviewGrant,
    HrOverviewReadGrant,
    HrProfileManageGrant,
    HrProfileReadGrant,
)
from app.db.models import EmployeeHrProfile, HrDocumentRecord, HrLeaveRequest
from app.repositories.hr import DebtRecord
from app.schemas.common import ErrorResponse
from app.schemas.hr import (
    CancelLeaveRequest,
    CreateEmployeeDebtPaymentRequest,
    CreateEmployeeDebtRequest,
    CreateHrDocumentRequest,
    CreateLeaveRequest,
    DebtStatus,
    DocumentTemplate,
    EmployeeDebtPaymentResponse,
    EmployeeDebtResponse,
    EmployeeHrProfileResponse,
    HrDebtStatsResponse,
    HrDocumentRecordResponse,
    HrOverviewResponse,
    LeaveBalanceResponse,
    LeaveRequestResponse,
    LeaveStatus,
    PaginatedEmployeeDebtsResponse,
    PaginatedEmployeeHrProfilesResponse,
    PaginatedHrDocumentsResponse,
    PaginatedLeaveRequestsResponse,
    ReviewLeaveRequest,
    UpdateEmployeeHrProfileRequest,
)
from app.services.hr import HrService, debt_values

router = APIRouter(prefix="/api/v1/hr", tags=["hr"])

_SECURITY_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorResponse},
    403: {"model": ErrorResponse},
}
_WRITE_RESPONSES: dict[int | str, dict[str, Any]] = {
    **_SECURITY_RESPONSES,
    400: {"model": ErrorResponse},
    404: {"model": ErrorResponse},
    409: {"model": ErrorResponse},
}

IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=100,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]*$",
    ),
]


def _profile_response(profile: EmployeeHrProfile) -> EmployeeHrProfileResponse:
    return EmployeeHrProfileResponse(
        employee_id=profile.employee_id,
        initial_salary=profile.initial_salary,
        salary=profile.current_salary,
        vacation_days=profile.vacation_days,
        bank_name=profile.bank_name,
        bank_account_type=profile.bank_account_type,  # type: ignore[arg-type]
        bank_account_number=profile.bank_account_number,
        bank_document=profile.bank_document,
        version=profile.version,
        updated_at=profile.updated_at,
    )


def _leave_response(leave: HrLeaveRequest) -> LeaveRequestResponse:
    return LeaveRequestResponse(
        id=leave.id,
        employee_id=leave.employee_id,
        start_date=leave.start_date,
        end_date=leave.end_date,
        reason=leave.reason,
        status=leave.status,  # type: ignore[arg-type]
        requested_by_platform_user_id=leave.requested_by_platform_user_id,
        reviewed_by_platform_user_id=leave.reviewed_by_platform_user_id,
        reviewed_at=leave.reviewed_at,
        version=leave.version,
        created_at=leave.created_at,
        updated_at=leave.updated_at,
    )


def _debt_response(record: DebtRecord) -> EmployeeDebtResponse:
    paid, balance, debt_status = debt_values(record)
    return EmployeeDebtResponse(
        id=record.debt.id,
        employee_id=record.debt.employee_id,
        concept=record.debt.concept,
        client_name=record.debt.client_name,
        amount=record.debt.amount,
        paid_total=paid,
        balance=balance,
        currency_code=record.debt.currency_code,
        status=debt_status,  # type: ignore[arg-type]
        payments=[
            EmployeeDebtPaymentResponse(
                id=payment.id,
                amount=payment.amount,
                paid_on=payment.paid_on,
                created_at=payment.created_at,
            )
            for payment in record.payments
        ],
        version=record.debt.version,
        created_at=record.debt.created_at,
        updated_at=record.debt.updated_at,
    )


def _document_response(document: HrDocumentRecord) -> HrDocumentRecordResponse:
    return HrDocumentRecordResponse(
        id=document.id,
        employee_id=document.employee_id,
        template_id=document.template_id,  # type: ignore[arg-type]
        issue_date=document.issue_date,
        include_salary=document.include_salary,
        reference_code=document.reference_code,
        snapshot=document.snapshot,
        created_at=document.created_at,
    )


@router.get("/overview", summary="Obtener KPIs y actividad reciente de RRHH")
def get_hr_overview(
    database: DatabaseSession,
    grant: HrOverviewReadGrant,
) -> HrOverviewResponse:
    result = HrService(database).overview(grant)
    return HrOverviewResponse(
        total_employees=result.total_employees,
        active_employees=result.active_employees,
        approved_vacations=result.approved_vacations,
        pending_approvals=result.pending_approvals,
        debt=HrDebtStatsResponse(
            total_debt=result.debt.total_debt,
            total_paid=result.debt.total_paid,
            pending=result.debt.pending,
            employees_with_debt=result.debt.employees_with_debt,
        ),
        recent_requests=[_leave_response(item) for item in result.recent_requests],
    )


@router.get("/profiles", summary="Listar fichas sensibles de RRHH")
def list_hr_profiles(
    database: DatabaseSession,
    grant: HrProfileReadGrant,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 100,
) -> PaginatedEmployeeHrProfilesResponse:
    result = HrService(database).list_profiles(grant, page=page, page_size=page_size)
    items = cast(tuple[EmployeeHrProfile, ...], result.items)
    return PaginatedEmployeeHrProfilesResponse(
        items=[_profile_response(item) for item in items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.patch(
    "/profiles/{employee_id}",
    summary="Actualizar una ficha de RRHH con control de versión",
    responses=_WRITE_RESPONSES,
)
def update_hr_profile(
    employee_id: UUID,
    payload: UpdateEmployeeHrProfileRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: HrProfileManageGrant,
) -> EmployeeHrProfileResponse:
    profile = HrService(database).update_profile(
        principal=principal,
        grant=grant,
        employee_id=employee_id,
        expected_version=payload.version,
        changes=payload.model_dump(exclude_unset=True, exclude={"version"}, by_alias=False),
    )
    return _profile_response(profile)


@router.get("/leave-requests/me", summary="Obtener saldo y solicitudes propias")
def get_own_leave_balance(
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: HrLeaveRequestGrant,
) -> LeaveBalanceResponse:
    result = HrService(database).own_leave_balance(principal, grant)
    return LeaveBalanceResponse(
        employee_id=result.employee_id,
        vacation_days=result.vacation_days,
        used_days=result.used_days,
        available_days=result.available_days,
        items=[_leave_response(item) for item in result.items],
    )


@router.get("/leave-requests", summary="Listar solicitudes para revisión")
def list_leave_requests(
    database: DatabaseSession,
    grant: HrLeaveReviewGrant,
    employee_id: Annotated[UUID | None, Query(alias="employeeId")] = None,
    status_filter: Annotated[LeaveStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 100,
) -> PaginatedLeaveRequestsResponse:
    result = HrService(database).list_leave_requests(
        grant,
        employee_id=employee_id,
        status=status_filter,
        page=page,
        page_size=page_size,
    )
    items = cast(tuple[HrLeaveRequest, ...], result.items)
    return PaginatedLeaveRequestsResponse(
        items=[_leave_response(item) for item in items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.post(
    "/leave-requests",
    status_code=status.HTTP_201_CREATED,
    summary="Crear una solicitud propia de vacaciones",
    responses=_WRITE_RESPONSES,
)
def create_leave_request(
    payload: CreateLeaveRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: HrLeaveRequestGrant,
) -> LeaveRequestResponse:
    return _leave_response(
        HrService(database).create_leave_request(
            principal=principal,
            grant=grant,
            start_date=payload.start_date,
            end_date=payload.end_date,
            reason=payload.reason,
        )
    )


@router.post(
    "/leave-requests/{leave_request_id}/decision",
    summary="Aprobar o rechazar una solicitud pendiente",
    responses=_WRITE_RESPONSES,
)
def review_leave_request(
    leave_request_id: UUID,
    payload: ReviewLeaveRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: HrLeaveReviewGrant,
) -> LeaveRequestResponse:
    return _leave_response(
        HrService(database).review_leave_request(
            principal=principal,
            grant=grant,
            leave_request_id=leave_request_id,
            status=payload.status,
            expected_version=payload.version,
        )
    )


@router.post(
    "/leave-requests/{leave_request_id}/cancel",
    summary="Cancelar una solicitud propia pendiente",
    responses=_WRITE_RESPONSES,
)
def cancel_leave_request(
    leave_request_id: UUID,
    payload: CancelLeaveRequest,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: HrLeaveRequestGrant,
) -> LeaveRequestResponse:
    return _leave_response(
        HrService(database).cancel_leave_request(
            principal=principal,
            grant=grant,
            leave_request_id=leave_request_id,
            expected_version=payload.version,
        )
    )


@router.get("/debts", summary="Listar cuentas por cobrar a empleados")
def list_employee_debts(
    database: DatabaseSession,
    grant: HrDebtReadGrant,
    search: Annotated[str | None, Query(max_length=120)] = None,
    employee_id: Annotated[UUID | None, Query(alias="employeeId")] = None,
    status_filter: Annotated[DebtStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 100,
) -> PaginatedEmployeeDebtsResponse:
    result = HrService(database).list_debts(
        grant,
        search=search,
        employee_id=employee_id,
        status=status_filter,
        page=page,
        page_size=page_size,
    )
    items = cast(tuple[DebtRecord, ...], result.items)
    return PaginatedEmployeeDebtsResponse(
        items=[_debt_response(item) for item in items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.get("/debts/stats", summary="Obtener KPIs de cuentas por cobrar")
def get_employee_debt_stats(
    database: DatabaseSession,
    grant: HrDebtReadGrant,
) -> HrDebtStatsResponse:
    result = HrService(database).debt_stats(grant)
    return HrDebtStatsResponse(
        total_debt=result.total_debt,
        total_paid=result.total_paid,
        pending=result.pending,
        employees_with_debt=result.employees_with_debt,
    )


@router.post(
    "/debts",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar una deuda de empleado de forma idempotente",
    responses=_WRITE_RESPONSES,
)
def create_employee_debt(
    payload: CreateEmployeeDebtRequest,
    idempotency_key: IdempotencyKey,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: HrDebtManageGrant,
) -> EmployeeDebtResponse:
    return _debt_response(
        HrService(database).create_debt(
            principal=principal,
            grant=grant,
            employee_id=payload.employee_id,
            concept=payload.concept,
            client_name=payload.client_name,
            amount=payload.amount,
            idempotency_key=idempotency_key,
        )
    )


@router.post(
    "/debts/{debt_id}/payments",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un pago parcial o total de forma idempotente",
    responses=_WRITE_RESPONSES,
)
def create_employee_debt_payment(
    debt_id: UUID,
    payload: CreateEmployeeDebtPaymentRequest,
    idempotency_key: IdempotencyKey,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: HrDebtManageGrant,
) -> EmployeeDebtResponse:
    return _debt_response(
        HrService(database).create_payment(
            principal=principal,
            grant=grant,
            debt_id=debt_id,
            amount=payload.amount,
            paid_on=payload.paid_on,
            idempotency_key=idempotency_key,
        )
    )


@router.get("/documents", summary="Listar historial de documentos laborales")
def list_hr_documents(
    database: DatabaseSession,
    grant: HrDocumentReadGrant,
    employee_id: Annotated[UUID | None, Query(alias="employeeId")] = None,
    template_id: Annotated[DocumentTemplate | None, Query(alias="templateId")] = None,
    page: Annotated[int, Query(ge=1, le=1_000_000)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 100,
) -> PaginatedHrDocumentsResponse:
    result = HrService(database).list_documents(
        grant,
        employee_id=employee_id,
        template_id=template_id,
        page=page,
        page_size=page_size,
    )
    items = cast(tuple[HrDocumentRecord, ...], result.items)
    return PaginatedHrDocumentsResponse(
        items=[_document_response(item) for item in items],
        page=result.page,
        page_size=result.page_size,
        total_items=result.total_items,
        total_pages=result.total_pages,
    )


@router.post(
    "/documents",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un documento laboral con snapshot inmutable",
    responses=_WRITE_RESPONSES,
)
def create_hr_document(
    payload: CreateHrDocumentRequest,
    idempotency_key: IdempotencyKey,
    database: DatabaseSession,
    principal: CurrentPrincipal,
    grant: HrDocumentManageGrant,
) -> HrDocumentRecordResponse:
    return _document_response(
        HrService(database).create_document(
            principal=principal,
            grant=grant,
            employee_id=payload.employee_id,
            template_id=payload.template_id,
            issue_date=payload.issue_date,
            include_salary=payload.include_salary,
            idempotency_key=idempotency_key,
        )
    )
