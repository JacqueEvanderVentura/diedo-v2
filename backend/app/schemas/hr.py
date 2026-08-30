from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel

LeaveStatus = Literal["pendiente", "aprobada", "rechazada", "cancelada"]
LeaveDecision = Literal["aprobada", "rechazada"]
DebtStatus = Literal["pendiente", "parcial", "pagado"]
DocumentTemplate = Literal["certificado", "bancaria", "recomendacion", "vacaciones"]
BankAccountType = Literal["ahorro", "corriente"]
Money = Decimal


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized or None


class EmployeeHrProfileResponse(ApiModel):
    employee_id: UUID
    initial_salary: Money
    salary: Money
    vacation_days: int
    bank_name: str | None
    bank_account_type: BankAccountType | None
    bank_account_number: str | None
    bank_document: str | None
    version: int
    updated_at: datetime


class PaginatedEmployeeHrProfilesResponse(ApiModel):
    items: list[EmployeeHrProfileResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class UpdateEmployeeHrProfileRequest(ApiModel):
    version: int = Field(ge=1)
    initial_salary: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    salary: Money | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    vacation_days: int | None = Field(default=None, ge=0, le=365)
    bank_name: str | None = Field(default=None, max_length=120)
    bank_account_type: BankAccountType | None = None
    bank_account_number: str | None = Field(default=None, max_length=128)
    bank_document: str | None = Field(default=None, max_length=64)

    @field_validator("bank_name", "bank_account_number", "bank_document")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set - {"version"}:
            raise ValueError("Debes enviar al menos un cambio.")
        required = {"initial_salary", "salary", "vacation_days"}
        if any(name in self.model_fields_set and getattr(self, name) is None for name in required):
            raise ValueError("Este campo no puede ser nulo.")
        return self


class LeaveRequestResponse(ApiModel):
    id: UUID
    employee_id: UUID
    start_date: date
    end_date: date
    reason: str
    status: LeaveStatus
    requested_by_platform_user_id: UUID
    reviewed_by_platform_user_id: UUID | None
    reviewed_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


class LeaveBalanceResponse(ApiModel):
    employee_id: UUID
    vacation_days: int
    used_days: int
    available_days: int
    items: list[LeaveRequestResponse]


class PaginatedLeaveRequestsResponse(ApiModel):
    items: list[LeaveRequestResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateLeaveRequest(ApiModel):
    start_date: date
    end_date: date
    reason: str = Field(min_length=2, max_length=500)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return " ".join(value.split())

    @model_validator(mode="after")
    def validate_dates(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("La fecha final debe ser igual o posterior a la inicial.")
        return self


class ReviewLeaveRequest(ApiModel):
    status: LeaveDecision
    version: int = Field(ge=1)


class CancelLeaveRequest(ApiModel):
    version: int = Field(ge=1)


class EmployeeDebtPaymentResponse(ApiModel):
    id: UUID
    amount: Money
    paid_on: date
    created_at: datetime


class EmployeeDebtResponse(ApiModel):
    id: UUID
    employee_id: UUID
    concept: str
    client_name: str | None
    amount: Money
    paid_total: Money
    balance: Money
    currency_code: str
    status: DebtStatus
    payments: list[EmployeeDebtPaymentResponse]
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedEmployeeDebtsResponse(ApiModel):
    items: list[EmployeeDebtResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateEmployeeDebtRequest(ApiModel):
    employee_id: UUID
    concept: str = Field(min_length=2, max_length=240)
    client_name: str | None = Field(default=None, max_length=200)
    amount: Money = Field(gt=0, max_digits=14, decimal_places=2)

    @field_validator("concept")
    @classmethod
    def normalize_concept(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("client_name")
    @classmethod
    def normalize_client_name(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)


class CreateEmployeeDebtPaymentRequest(ApiModel):
    amount: Money = Field(gt=0, max_digits=14, decimal_places=2)
    paid_on: date = Field(default_factory=date.today)


class HrDebtStatsResponse(ApiModel):
    total_debt: Money
    total_paid: Money
    pending: Money
    employees_with_debt: int


class HrDocumentRecordResponse(ApiModel):
    id: UUID
    employee_id: UUID
    template_id: DocumentTemplate
    issue_date: date
    include_salary: bool
    reference_code: str
    snapshot: dict[str, Any]
    created_at: datetime


class PaginatedHrDocumentsResponse(ApiModel):
    items: list[HrDocumentRecordResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateHrDocumentRequest(ApiModel):
    employee_id: UUID
    template_id: DocumentTemplate
    issue_date: date
    include_salary: bool = False

    @model_validator(mode="after")
    def constrain_salary_to_bank_letter(self) -> Self:
        if self.include_salary and self.template_id != "bancaria":
            raise ValueError("El salario sólo puede incluirse en la carta bancaria.")
        return self


class HrOverviewResponse(ApiModel):
    total_employees: int
    active_employees: int
    approved_vacations: int
    pending_approvals: int
    debt: HrDebtStatsResponse
    recent_requests: list[LeaveRequestResponse]
