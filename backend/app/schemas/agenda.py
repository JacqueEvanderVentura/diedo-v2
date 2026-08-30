from datetime import date as DateValue
from datetime import datetime
from datetime import time as TimeValue
from decimal import Decimal
from typing import Any, Literal, Self
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.common import ApiModel

AppointmentStatus = Literal[
    "pending",
    "confirmed",
    "completed",
    "attended",
    "no_show",
    "cancelled",
    "delayed",
    "rescheduled",
]
CreateAppointmentStatus = Literal["pending", "confirmed"]
AppointmentSource = Literal["staff", "self"]
AppointmentRecurrence = Literal["none", "weekly", "monthly"]
AppointmentSortField = Literal["date", "customerName", "serviceName", "status", "createdAt"]
SortDirection = Literal["asc", "desc"]
ResourceStatus = Literal["active", "inactive", "archived"]
ResourceType = Literal["room", "equipment", "other"]


def _normalize_required_text(value: str) -> str:
    return " ".join(value.split())


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized or None


class AppointmentResourceResponse(ApiModel):
    id: UUID
    branch_id: UUID
    code: str
    name: str
    resource_type: ResourceType
    status: ResourceStatus
    version: int


class AppointmentResourcesResponse(ApiModel):
    items: list[AppointmentResourceResponse]


class AppointmentReference(ApiModel):
    id: UUID
    name: str


class AppointmentHistoryChange(ApiModel):
    field: str
    label: str
    from_value: Any = Field(alias="from")
    to: Any


class AppointmentHistoryResponse(ApiModel):
    id: UUID
    at: datetime
    user_id: UUID | None
    user_name: str
    action: Literal["create", "update", "status"]
    changes: list[AppointmentHistoryChange]


class AppointmentResponse(ApiModel):
    id: UUID
    branch_id: UUID
    resource: AppointmentResourceResponse
    customer: AppointmentReference | None
    employee: AppointmentReference | None
    service: AppointmentReference | None
    date: DateValue
    time: str
    starts_at: datetime
    ends_at: datetime
    duration: int
    customer_name: str
    customer_phone: str | None
    service_name: str
    price: Decimal
    status: AppointmentStatus
    notes: str | None
    pending_payment: bool
    pending_amount: Decimal
    first_time: bool
    free_trial: bool
    reminder_sent: bool
    source: AppointmentSource
    recurrence: AppointmentRecurrence
    recurrence_group_id: UUID | None
    occurrence_index: int
    repeat_count: int
    created_by: str
    updated_by: str
    created_at: datetime
    updated_at: datetime
    version: int
    history: list[AppointmentHistoryResponse]


class PaginatedAppointmentsResponse(ApiModel):
    items: list[AppointmentResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreatedAppointmentsResponse(ApiModel):
    items: list[AppointmentResponse]


class CreateAppointmentRequest(ApiModel):
    branch_id: UUID
    resource_id: UUID
    customer_id: UUID | None = None
    employee_id: UUID | None = None
    service_id: UUID | None = None
    date: DateValue
    time: TimeValue
    duration: int = Field(default=30, ge=5, le=480)
    customer_name: str = Field(min_length=1, max_length=200)
    customer_phone: str | None = Field(default=None, max_length=40)
    service_name: str = Field(default="", max_length=200)
    price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    status: CreateAppointmentStatus = "confirmed"
    notes: str | None = Field(default=None, max_length=2000)
    pending_payment: bool = False
    pending_amount: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    first_time: bool = False
    free_trial: bool = False
    reminder_sent: bool = False
    source: AppointmentSource = "staff"
    recurrence: AppointmentRecurrence = "none"
    repeat_count: int = Field(default=1, ge=1, le=12)

    @field_validator("customer_name", "service_name")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("customer_phone", "notes")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def validate_money_and_recurrence(self) -> Self:
        if not self.customer_name:
            raise ValueError("El nombre del cliente es obligatorio.")
        if self.pending_amount > self.price:
            raise ValueError("El monto pendiente no puede superar el precio.")
        if not self.pending_payment and self.pending_amount != 0:
            raise ValueError("Activa pago pendiente antes de indicar un monto.")
        if self.recurrence == "none" and self.repeat_count != 1:
            raise ValueError("Una cita sin recurrencia debe tener repeatCount igual a 1.")
        if self.recurrence != "none" and self.repeat_count < 2:
            raise ValueError("Una serie recurrente debe incluir al menos dos citas.")
        return self


class UpdateAppointmentRequest(ApiModel):
    version: int = Field(ge=1)
    branch_id: UUID | None = None
    resource_id: UUID | None = None
    customer_id: UUID | None = None
    employee_id: UUID | None = None
    service_id: UUID | None = None
    date: DateValue | None = None
    time: TimeValue | None = None
    duration: int | None = Field(default=None, ge=5, le=480)
    customer_name: str | None = Field(default=None, min_length=1, max_length=200)
    customer_phone: str | None = Field(default=None, max_length=40)
    service_name: str | None = Field(default=None, max_length=200)
    price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    status: AppointmentStatus | None = None
    notes: str | None = Field(default=None, max_length=2000)
    pending_payment: bool | None = None
    pending_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    first_time: bool | None = None
    free_trial: bool | None = None
    reminder_sent: bool | None = None

    @field_validator("customer_name", "service_name")
    @classmethod
    def normalize_required_text(cls, value: str | None) -> str | None:
        return _normalize_required_text(value) if value is not None else None

    @field_validator("customer_phone", "notes")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def validate_changes(self) -> Self:
        changed = self.model_fields_set - {"version"}
        if not changed:
            raise ValueError("Debes enviar al menos un cambio.")
        non_nullable = {
            "branch_id",
            "resource_id",
            "date",
            "time",
            "duration",
            "customer_name",
            "service_name",
            "price",
            "status",
            "pending_payment",
            "pending_amount",
            "first_time",
            "free_trial",
            "reminder_sent",
        }
        if any(name in changed and getattr(self, name) is None for name in non_nullable):
            raise ValueError("Este campo no puede ser nulo.")
        return self
