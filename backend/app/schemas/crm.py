from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Literal, Self
from uuid import UUID

from pydantic import EmailStr, Field, HttpUrl, PlainSerializer, field_validator, model_validator

from app.schemas.common import ApiModel, ImportRowModel
from app.schemas.pos import QuoteDetailResponse

LeadStatus = Literal["nuevo", "contactado", "calificado", "descartado", "convertido"]
EditableLeadStatus = Literal["nuevo", "contactado", "calificado", "descartado"]
LeadSource = Literal["manual", "serp", "serper", "referral", "import"]
LeadDiscoveryProvider = Literal["serpapi", "serper"]
AcquisitionSource = Literal["whatsapp", "instagram", "referral", "otros", "pos_walk_in", "app"]


class LeadDiscoveryCapabilitiesResponse(ApiModel):
    enabled: bool
    provider: LeadDiscoveryProvider | None
    status: Literal["not_configured", "ready", "quota_exhausted"]
    hour_limit: int
    month_limit: int
    hour_used: int
    month_used: int
    available_providers: list[LeadDiscoveryProvider]


class LeadDiscoverySearchRequest(ApiModel):
    query: str = Field(min_length=2, max_length=200)
    location: str | None = Field(default=None, max_length=200)
    limit: int = Field(default=10, ge=1, le=20)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("location")
    @classmethod
    def normalize_location(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class LeadDiscoveryCandidateResponse(ApiModel):
    name: str
    company: str | None
    phone: str | None
    website: str | None
    location: str | None
    source_url: str | None
    raw_snippet: str | None
    rating: float | None = None
    reviews: int | None = None


class LeadDiscoverySearchResponse(ApiModel):
    provider: LeadDiscoveryProvider
    items: list[LeadDiscoveryCandidateResponse]
    hour_used: int
    month_used: int
    hour_limit: int
    month_limit: int


OpportunityStage = Literal["nuevo", "contactado", "propuesta", "negociacion", "cerrado", "perdido"]
ActivityType = Literal["llamada", "email", "reunion", "nota", "tarea"]
CustomerLifecycleStatus = Literal["activo", "prospecto", "inactivo"]
CrmQuoteStatus = Literal["borrador", "enviada", "aceptada", "rechazada", "vencida"]
CrmSortDirection = Literal["asc", "desc"]


def _serialize_decimal(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


DecimalString = Annotated[
    Decimal,
    PlainSerializer(_serialize_decimal, return_type=str, when_used="json"),
]


def _normalize_required_text(value: str) -> str:
    return " ".join(value.split())


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    return normalized or None


def _coerce_optional_email(value: object) -> str | None:
    if value is None or value == "":
        return None
    text = str(value).strip()
    if "@" not in text:
        return None
    return text


def _validate_star_rating(value: Decimal | float | int | str | None) -> Decimal | None:
    if value is None or value == "":
        return None
    rating = Decimal(str(value))
    if rating < 0 or rating > 5:
        raise ValueError("La calificación debe estar entre 0 y 5.")
    doubled = rating * 2
    if doubled != doubled.to_integral_value():
        raise ValueError("Usa medios puntos (0, 0.5, 1, …, 5).")
    return rating.quantize(Decimal("0.1"))


class LeadInput(ApiModel):
    branch_id: UUID
    assigned_membership_id: UUID | None = None
    name: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    website: HttpUrl | None = Field(default=None, max_length=500)
    location: str | None = Field(default=None, max_length=240)
    source: LeadSource = "manual"
    acquisition_source: AcquisitionSource | None = None
    source_url: HttpUrl | None = Field(default=None, max_length=1000)
    scraped_at: datetime | None = None
    raw_snippet: str | None = Field(default=None, max_length=4000)
    status: EditableLeadStatus = "nuevo"
    star_rating: Decimal | None = None

    @field_validator("star_rating", mode="before")
    @classmethod
    def coerce_star_rating(cls, value: object) -> Decimal | None:
        return _validate_star_rating(value)  # type: ignore[arg-type]

    @field_validator("name", "company")
    @classmethod
    def normalize_names(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("phone", "location", "raw_snippet")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def require_identity(self) -> Self:
        if not self.name and not self.company:
            raise ValueError("Debes indicar el nombre o la empresa del lead.")
        return self


class CreateLeadRequest(LeadInput):
    pass


class ImportLeadsRequest(ApiModel):
    branch_id: UUID
    assigned_membership_id: UUID | None = None
    source: LeadSource = "import"
    items: list[LeadInput] = Field(min_length=1, max_length=100)


class UpdateLeadRequest(ApiModel):
    version: int = Field(ge=1)
    assigned_membership_id: UUID | None = None
    name: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    website: HttpUrl | None = Field(default=None, max_length=500)
    location: str | None = Field(default=None, max_length=240)
    acquisition_source: AcquisitionSource | None = None
    status: EditableLeadStatus | None = None
    star_rating: Decimal | None = None
    raw_snippet: str | None = Field(default=None, max_length=4000)

    @field_validator("star_rating", mode="before")
    @classmethod
    def coerce_star_rating(cls, value: object) -> Decimal | None:
        return _validate_star_rating(value)  # type: ignore[arg-type]

    @field_validator("name", "company")
    @classmethod
    def normalize_names(cls, value: str | None) -> str | None:
        return _normalize_required_text(value) if value is not None else None

    @field_validator("phone", "location", "raw_snippet")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set - {"version"}:
            raise ValueError("Debes enviar al menos un cambio.")
        return self


class DeleteLeadsRequest(ApiModel):
    lead_ids: list[UUID] = Field(alias="leadIds", min_length=1, max_length=100)


class DeleteLeadResultItem(ApiModel):
    lead_id: UUID = Field(alias="leadId")
    status: Literal["deleted", "error"]
    message: str | None = None


class DeleteLeadsResponse(ApiModel):
    items: list[DeleteLeadResultItem]


class ConvertLeadRequest(ApiModel):
    version: int = Field(ge=1)
    customer_type: Literal["person", "business"] = "business"
    display_name: str | None = Field(default=None, min_length=2, max_length=200)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    business_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    branch_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=100)
    acquisition_source: AcquisitionSource | None = None
    lifecycle_status: CustomerLifecycleStatus = "prospecto"
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("display_name", "first_name", "last_name", "business_name", "phone", "notes")
    @classmethod
    def normalize_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @field_validator("branch_ids")
    @classmethod
    def reject_duplicate_branches(cls, value: list[UUID] | None) -> list[UUID] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("No repitas sucursales.")
        return value


class LeadResponse(ApiModel):
    id: UUID
    branch_id: UUID
    assigned_membership_id: UUID
    name: str
    company: str
    email: EmailStr | None
    phone: str | None
    website: str | None
    location: str | None
    source: LeadSource
    acquisition_source: AcquisitionSource | None = None
    source_url: str | None
    scraped_at: datetime | None
    raw_snippet: str | None
    status: LeadStatus
    star_rating: DecimalString | None
    customer_id: UUID | None
    opportunity_id: UUID | None
    converted_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedLeadsResponse(ApiModel):
    items: list[LeadResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class ImportedLeadsResponse(ApiModel):
    items: list[LeadResponse]


class ImportPipelineItem(ImportRowModel):
    external_id: str | None = Field(default=None, max_length=64)
    name: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    website: HttpUrl | None = Field(default=None, max_length=500)
    location: str | None = Field(default=None, max_length=240)
    acquisition_source: AcquisitionSource | None = None
    stage: OpportunityStage = "nuevo"
    value: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)
    lost_reason: str | None = Field(default=None, max_length=1000)
    convert: bool = False

    @field_validator("email", mode="before")
    @classmethod
    def coerce_import_email(cls, value: object) -> str | None:
        return _coerce_optional_email(value)

    @field_validator("name", "company", mode="before")
    @classmethod
    def normalize_names(cls, value: str | None) -> str:
        if value is None:
            return ""
        return _normalize_required_text(value)

    @field_validator("phone", "location", "notes", "lost_reason")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def require_identity(self) -> Self:
        if not self.name and not self.company:
            raise ValueError("Debes indicar el nombre o la empresa del lead.")
        if self.stage == "perdido" and not self.lost_reason:
            raise ValueError("Una oportunidad perdida requiere motivo.")
        return self


class ImportPipelineRequest(ApiModel):
    branch_id: UUID
    assigned_membership_id: UUID | None = None
    items: list[dict[str, Any]] = Field(min_length=1, max_length=100)


class ImportPipelineRowResult(ApiModel):
    external_id: str | None = None
    lead_id: UUID | None = None
    opportunity_id: UUID | None = None
    customer_id: UUID | None = None
    status: Literal["created", "skipped", "error"]
    message: str | None = None


class ImportPipelineResponse(ApiModel):
    items: list[ImportPipelineRowResult]


class ImportActivityItem(ImportRowModel):
    external_id: str | None = Field(default=None, max_length=64)
    lead_external_id: str | None = Field(default=None, max_length=64)
    title: str = Field(min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=2000)
    due_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class ImportActivitiesRequest(ApiModel):
    branch_id: UUID
    items: list[ImportActivityItem] = Field(min_length=1, max_length=100)


class ImportActivityRowResult(ApiModel):
    external_id: str | None = None
    activity_id: UUID | None = None
    status: Literal["created", "skipped", "error"]
    message: str | None = None


class ImportActivitiesResponse(ApiModel):
    items: list[ImportActivityRowResult]


class CreateOpportunityRequest(ApiModel):
    branch_id: UUID
    lead_id: UUID | None = None
    customer_id: UUID | None = None
    assigned_membership_id: UUID | None = None
    title: str = Field(min_length=2, max_length=240)
    customer_name: str = Field(min_length=2, max_length=200)
    stage: OpportunityStage = "nuevo"
    value: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)
    lost_reason: str | None = Field(default=None, max_length=1000)

    @field_validator("title", "customer_name")
    @classmethod
    def normalize_required_fields(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("notes", "lost_reason")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def require_lost_reason(self) -> Self:
        if self.stage == "perdido" and not self.lost_reason:
            raise ValueError("Una oportunidad perdida requiere motivo.")
        return self


class CreateLeadOpportunityRequest(ApiModel):
    title: str | None = Field(default=None, max_length=240)
    stage: OpportunityStage | None = None
    value: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)
    lost_reason: str | None = Field(default=None, max_length=1000)


class UpdateOpportunityRequest(ApiModel):
    version: int = Field(ge=1)
    assigned_membership_id: UUID | None = None
    customer_id: UUID | None = None
    title: str | None = Field(default=None, min_length=2, max_length=240)
    customer_name: str | None = Field(default=None, min_length=2, max_length=200)
    stage: OpportunityStage | None = None
    value: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=2000)
    lost_reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set - {"version"}:
            raise ValueError("Debes enviar al menos un cambio.")
        if (
            self.stage == "perdido"
            and "lost_reason" in self.model_fields_set
            and not self.lost_reason
        ):
            raise ValueError("Una oportunidad perdida requiere motivo.")
        return self


class OpportunityResponse(ApiModel):
    id: UUID
    branch_id: UUID
    lead_id: UUID | None
    customer_id: UUID | None
    assigned_membership_id: UUID
    title: str
    customer_name: str
    stage: OpportunityStage
    value: DecimalString
    currency_code: str
    notes: str | None
    lost_reason: str | None
    closed_at: datetime | None
    quote_count: int
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedOpportunitiesResponse(ApiModel):
    items: list[OpportunityResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CreateActivityRequest(ApiModel):
    branch_id: UUID
    lead_id: UUID | None = None
    opportunity_id: UUID | None = None
    customer_id: UUID | None = None
    assigned_membership_id: UUID | None = None
    type: ActivityType = "tarea"
    title: str = Field(min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=2000)
    customer_name: str | None = Field(default=None, max_length=200)
    due_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("description", "customer_name")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class UpdateActivityRequest(ApiModel):
    version: int = Field(ge=1)
    assigned_membership_id: UUID | None = None
    type: ActivityType | None = None
    title: str | None = Field(default=None, min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=2000)
    customer_name: str | None = Field(default=None, max_length=200)
    due_at: datetime | None = None

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set - {"version"}:
            raise ValueError("Debes enviar al menos un cambio.")
        return self


class ActivityStateRequest(ApiModel):
    version: int = Field(ge=1)


class ActivityResponse(ApiModel):
    id: UUID
    branch_id: UUID
    lead_id: UUID | None
    opportunity_id: UUID | None
    customer_id: UUID | None
    assigned_membership_id: UUID
    type: ActivityType
    title: str
    description: str | None
    customer_name: str | None
    due_at: datetime | None
    completed_at: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime


class PaginatedActivitiesResponse(ApiModel):
    items: list[ActivityResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


CrmUiMode = Literal["standard", "simplified"]
LeadSortField = Literal["updated_at", "star_rating"]
LeadSortDirection = Literal["asc", "desc"]


class CrmWorkspaceSettingsResponse(ApiModel):
    ui_mode: CrmUiMode
    version: int
    updated_at: datetime


class UpdateCrmWorkspaceSettingsRequest(ApiModel):
    version: int = Field(ge=1)
    ui_mode: CrmUiMode


class UpdateCustomerCrmProfileRequest(ApiModel):
    version: int = Field(ge=1)
    lifecycle_status: CustomerLifecycleStatus | None = None
    loyalty_points: int | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set - {"version"}:
            raise ValueError("Debes enviar al menos un cambio.")
        return self


class CrmBranchReference(ApiModel):
    id: UUID
    code: str
    name: str


class CustomerCrmResponse(ApiModel):
    id: UUID
    customer_type: Literal["person", "business"]
    display_name: str
    business_name: str | None
    email: EmailStr | None
    phone: str | None
    branches: list[CrmBranchReference]
    master_status: Literal["active", "inactive", "archived"]
    lifecycle_status: CustomerLifecycleStatus
    loyalty_points: int
    notes: str | None
    converted_from_lead_id: UUID | None
    purchase_count: int
    total_spent: DecimalString
    last_purchase_at: datetime | None
    version: int
    profile_version: int
    created_at: datetime
    updated_at: datetime


class PaginatedCrmCustomersResponse(ApiModel):
    items: list[CustomerCrmResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int


class CustomerPurchaseResponse(ApiModel):
    id: UUID
    number: str
    branch_id: UUID
    status: Literal["completed", "voided"]
    payment_method: str
    reference: str | None
    total: DecimalString
    completed_at: datetime


class CustomerPurchasesResponse(ApiModel):
    customer: CustomerCrmResponse
    purchases: list[CustomerPurchaseResponse]


class CrmOverviewResponse(ApiModel):
    branch_id: UUID | None
    total_leads: int
    qualified_leads: int
    converted_this_month: int
    open_opportunities: int
    pipeline_value: DecimalString
    overdue_activities: int
    pending_activities: int
    crm_quotes: int
    accepted_quotes: int
    customers_with_purchases: int
    sales_this_month: int
    sales_value_this_month: DecimalString
    generated_at: datetime


class CrmStateResponse(ApiModel):
    settings: CrmWorkspaceSettingsResponse
    leads: list[LeadResponse]
    opportunities: list[OpportunityResponse]
    activities: list[ActivityResponse]
    quotes: list[CrmQuoteListResponse]


class CrmQuoteLineRequest(ApiModel):
    item_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)


class CreateCrmQuoteRequest(ApiModel):
    opportunity_id: UUID | None = None
    customer_id: UUID
    branch_id: UUID
    payment_method_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=160)
    discount_type: Literal["percent", "fixed"] | None = None
    discount_value: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    lines: list[CrmQuoteLineRequest] = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    valid_until: datetime | None = None
    status: CrmQuoteStatus = "borrador"

    @field_validator("lines")
    @classmethod
    def reject_duplicate_items(cls, value: list[CrmQuoteLineRequest]) -> list[CrmQuoteLineRequest]:
        item_ids = [line.item_id for line in value]
        if len(item_ids) != len(set(item_ids)):
            raise ValueError("No repitas ítems en la cotización.")
        return value


class UpdateCrmQuoteRequest(ApiModel):
    version: int = Field(ge=1)
    opportunity_id: UUID | None = None
    customer_id: UUID | None = None
    branch_id: UUID | None = None
    payment_method_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=160)
    discount_type: Literal["percent", "fixed"] | None = None
    discount_value: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    lines: list[CrmQuoteLineRequest] | None = Field(default=None, min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    valid_until: datetime | None = None
    status: CrmQuoteStatus | None = None


class CrmQuoteResponse(ApiModel):
    quote: QuoteDetailResponse
    opportunity_id: UUID | None
    crm_status: CrmQuoteStatus


class InvoiceCrmQuoteRequest(ApiModel):
    version: int = Field(ge=1)
    payment_method_id: UUID
    collection_mode: Literal["now", "receivable"]
    register_id: UUID | None = None
    reference: str | None = Field(default=None, max_length=160)


class CrmQuoteListResponse(ApiModel):
    quote: QuoteDetailResponse
    opportunity_id: UUID | None
    crm_status: CrmQuoteStatus
    converted_sale_id: UUID | None = None
    invoice_number: str | None = None
    receivable_id: UUID | None = None
    invoice_collection: Literal["collected", "receivable", "pending_validation"] | None = None


class PaginatedCrmQuotesResponse(ApiModel):
    items: list[CrmQuoteListResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
