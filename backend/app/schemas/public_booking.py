from __future__ import annotations

from datetime import date
from datetime import time as TimeValue
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import EmailStr, Field, field_validator, model_validator

from app.schemas.common import ApiModel
from app.schemas.master_data import CustomerDocumentType

PublicAppointmentStatus = Literal["confirmed", "cancelled"]


class PublicBranchContextResponse(ApiModel):
    branch_id: UUID
    branch_name: str
    workspace_name: str


class PublicServiceOption(ApiModel):
    id: UUID
    name: str
    price: Decimal
    duration_minutes: int


class PublicSpecialistOption(ApiModel):
    id: UUID
    display_name: str


class PublicBookingContextResponse(ApiModel):
    branch: PublicBranchContextResponse
    services: list[PublicServiceOption]
    specialists: list[PublicSpecialistOption]


class PublicIdentifyRequest(ApiModel):
    document_type: CustomerDocumentType
    document_id: str = Field(min_length=3, max_length=64)

    @field_validator("document_id")
    @classmethod
    def strip_document(cls, value: str) -> str:
        return value.strip()


class PublicCustomerProfileResponse(ApiModel):
    customer_id: UUID | None
    is_new: bool
    document_type: CustomerDocumentType
    document_id: str
    display_name: str | None
    email: EmailStr | None
    phone: str | None
    wants_invoice: bool = False
    wants_contact: bool = False
    address: str | None = None


class PublicIdentifyResponse(PublicCustomerProfileResponse):
    pass


class PublicSlotsResponse(ApiModel):
    date: date
    employee_id: UUID
    duration_minutes: int
    slots: list[str]


class PublicBookAppointmentRequest(ApiModel):
    document_type: CustomerDocumentType
    document_id: str = Field(min_length=3, max_length=64)
    display_name: str = Field(min_length=2, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=300)
    wants_invoice: bool = False
    wants_contact: bool = False
    service_id: UUID
    employee_id: UUID
    date: date
    time: TimeValue
    duration: int = Field(default=30, ge=5, le=480)

    @field_validator("display_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split())


class PublicAppointmentSummary(ApiModel):
    id: UUID
    branch_id: UUID
    customer_id: UUID | None
    employee_id: UUID | None
    service_id: UUID | None
    date: date
    time: str
    duration_minutes: int
    service_name: str
    status: str
    management_token: str


class PublicBookAppointmentResponse(ApiModel):
    appointment: PublicAppointmentSummary


class PublicProfileUpdateRequest(ApiModel):
    document_type: CustomerDocumentType
    document_id: str = Field(min_length=3, max_length=64)
    display_name: str = Field(min_length=2, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    address: str | None = Field(default=None, max_length=300)
    wants_invoice: bool = False
    wants_contact: bool = False


class PublicCancelAppointmentRequest(ApiModel):
    management_token: str = Field(min_length=8, max_length=64)


class PublicRescheduleAppointmentRequest(ApiModel):
    management_token: str = Field(min_length=8, max_length=64)
    date: date
    time: TimeValue
    duration: int | None = Field(default=None, ge=5, le=480)

    @model_validator(mode="after")
    def require_future_slot(self) -> PublicRescheduleAppointmentRequest:
        return self


class PublicAppointmentsListResponse(ApiModel):
    items: list[PublicAppointmentSummary]
