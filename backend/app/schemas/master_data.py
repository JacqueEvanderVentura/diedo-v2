from datetime import date, datetime
from typing import Literal, Self
from uuid import UUID

from pydantic import EmailStr, Field, field_validator, model_validator

from app.schemas.common import ApiModel

MasterDataStatus = Literal["active", "inactive", "archived"]
CreateMasterDataStatus = Literal["active", "inactive"]
CustomerType = Literal["person", "business"]
SortDirection = Literal["asc", "desc"]
CustomerSortField = Literal["name", "status", "createdAt", "updatedAt"]
EmployeeSortField = Literal["name", "employeeNumber", "status", "createdAt", "updatedAt"]
AttachmentClassification = Literal["internal", "customer_document", "employee_document"]


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized or None


class BranchReference(ApiModel):
    id: UUID
    code: str
    name: str


class WorkBlock(ApiModel):
    start: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def validate_order(self) -> Self:
        if self.end <= self.start:
            raise ValueError("La hora final debe ser posterior a la inicial.")
        return self


class WeeklySchedule(ApiModel):
    mon: list[WorkBlock] = Field(default_factory=list, max_length=12)
    tue: list[WorkBlock] = Field(default_factory=list, max_length=12)
    wed: list[WorkBlock] = Field(default_factory=list, max_length=12)
    thu: list[WorkBlock] = Field(default_factory=list, max_length=12)
    fri: list[WorkBlock] = Field(default_factory=list, max_length=12)
    sat: list[WorkBlock] = Field(default_factory=list, max_length=12)
    sun: list[WorkBlock] = Field(default_factory=list, max_length=12)

    @model_validator(mode="after")
    def reject_overlaps(self) -> Self:
        for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun"):
            blocks = sorted(getattr(self, day), key=lambda block: block.start)
            if any(current.start < previous.end for previous, current in zip(blocks, blocks[1:])):
                raise ValueError(f"Los bloques de {day} no pueden solaparse.")
            setattr(self, day, blocks)
        return self


class EmployeeScheduleResponse(ApiModel):
    timezone: str
    week: WeeklySchedule
    version: int
    updated_at: datetime


class PutEmployeeScheduleRequest(ApiModel):
    timezone: str = Field(min_length=3, max_length=64)
    week: WeeklySchedule
    version: int = Field(ge=1)


class CustomerResponse(ApiModel):
    id: UUID
    customer_type: CustomerType
    display_name: str
    first_name: str | None
    last_name: str | None
    business_name: str | None
    email: EmailStr | None
    phone: str | None
    branches: list[BranchReference]
    status: MasterDataStatus
    version: int
    attachment_count: int
    created_at: datetime
    updated_at: datetime


class PaginatedCustomersResponse(ApiModel):
    items: list[CustomerResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateCustomerRequest(ApiModel):
    customer_type: CustomerType = "person"
    display_name: str = Field(min_length=2, max_length=200)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    business_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    branch_ids: list[UUID] = Field(min_length=1, max_length=100)
    status: CreateMasterDataStatus = "active"

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        return normalize_text(value)

    @field_validator("first_name", "last_name", "business_name", "phone")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("branch_ids")
    @classmethod
    def reject_duplicate_branches(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("No repitas sucursales.")
        return value


class UpdateCustomerRequest(ApiModel):
    version: int = Field(ge=1)
    customer_type: CustomerType | None = None
    display_name: str | None = Field(default=None, min_length=2, max_length=200)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    business_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    branch_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=100)
    status: MasterDataStatus | None = None

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        return normalize_text(value) if value is not None else None

    @field_validator("first_name", "last_name", "business_name", "phone")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("branch_ids")
    @classmethod
    def reject_duplicate_branches(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("No repitas sucursales.")
        return value

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        changed = self.model_fields_set - {"version"}
        if not changed:
            raise ValueError("Debes enviar al menos un cambio.")
        required = {"customer_type", "display_name", "branch_ids", "status"}
        if any(field in changed and getattr(self, field) is None for field in required):
            raise ValueError("Este campo no puede ser nulo.")
        return self


class TimelineItemResponse(ApiModel):
    id: str
    event_type: str
    title: str
    occurred_at: datetime
    source: str


class CustomerTimelineResponse(ApiModel):
    items: list[TimelineItemResponse]


class EmployeeResponse(ApiModel):
    id: UUID
    employee_number: str
    first_name: str
    last_name: str
    display_name: str
    email: EmailStr | None
    phone: str | None
    position: str
    department: str | None
    contract_type: str | None
    hire_date: date
    platform_user_id: UUID | None
    branches: list[BranchReference]
    supervisor_ids: list[UUID]
    schedule: EmployeeScheduleResponse
    status: MasterDataStatus
    version: int
    attachment_count: int
    created_at: datetime
    updated_at: datetime


class PaginatedEmployeesResponse(ApiModel):
    items: list[EmployeeResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateEmployeeRequest(ApiModel):
    employee_number: str | None = Field(default=None, min_length=2, max_length=32)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    position: str = Field(min_length=2, max_length=120)
    department: str | None = Field(default=None, max_length=120)
    contract_type: str | None = Field(default=None, max_length=80)
    hire_date: date
    platform_user_id: UUID | None = None
    branch_ids: list[UUID] = Field(min_length=1, max_length=100)
    supervisor_ids: list[UUID] = Field(default_factory=list, max_length=20)
    timezone: str = Field(default="America/Santo_Domingo", min_length=3, max_length=64)
    schedule: WeeklySchedule = Field(default_factory=WeeklySchedule)
    status: CreateMasterDataStatus = "active"

    @field_validator("employee_number")
    @classmethod
    def normalize_number(cls, value: str | None) -> str | None:
        normalized = normalize_optional_text(value)
        return normalized.upper() if normalized else None

    @field_validator("first_name", "last_name", "position")
    @classmethod
    def normalize_required_fields(cls, value: str) -> str:
        return normalize_text(value)

    @field_validator("department", "contract_type", "phone")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("branch_ids", "supervisor_ids")
    @classmethod
    def reject_duplicates(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("No repitas identificadores.")
        return value


class UpdateEmployeeRequest(ApiModel):
    version: int = Field(ge=1)
    employee_number: str | None = Field(default=None, min_length=2, max_length=32)
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    position: str | None = Field(default=None, min_length=2, max_length=120)
    department: str | None = Field(default=None, max_length=120)
    contract_type: str | None = Field(default=None, max_length=80)
    hire_date: date | None = None
    platform_user_id: UUID | None = None
    branch_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=100)
    supervisor_ids: list[UUID] | None = Field(default=None, max_length=20)
    status: MasterDataStatus | None = None

    @field_validator("employee_number")
    @classmethod
    def normalize_number(cls, value: str | None) -> str | None:
        normalized = normalize_optional_text(value)
        return normalized.upper() if normalized else None

    @field_validator("first_name", "last_name", "position")
    @classmethod
    def normalize_required_fields(cls, value: str | None) -> str | None:
        return normalize_text(value) if value is not None else None

    @field_validator("department", "contract_type", "phone")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return normalize_optional_text(value)

    @field_validator("branch_ids", "supervisor_ids")
    @classmethod
    def reject_duplicates(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("No repitas identificadores.")
        return value

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        changed = self.model_fields_set - {"version"}
        if not changed:
            raise ValueError("Debes enviar al menos un cambio.")
        required = {
            "employee_number",
            "first_name",
            "last_name",
            "position",
            "hire_date",
            "branch_ids",
            "supervisor_ids",
            "status",
        }
        if any(field in changed and getattr(self, field) is None for field in required):
            raise ValueError("Este campo no puede ser nulo.")
        return self


class AttachmentResponse(ApiModel):
    id: UUID
    original_filename: str
    content_type: str
    size_bytes: int
    checksum_sha256: str
    classification: AttachmentClassification
    retention_until: date | None
    created_at: datetime
