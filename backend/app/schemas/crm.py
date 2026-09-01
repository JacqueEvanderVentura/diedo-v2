from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import EmailStr, Field, HttpUrl, PlainSerializer, field_validator, model_validator

from app.schemas.common import ApiModel
from app.schemas.pos import QuoteDetailResponse, QuoteListItemResponse

LeadStatus = Literal["nuevo", "contactado", "calificado", "descartado", "convertido"]
EditableLeadStatus = Literal["nuevo", "contactado", "calificado", "descartado"]
LeadSource = Literal["manual", "serp", "serper", "referral", "import"]


class LeadDiscoveryCapabilitiesResponse(ApiModel):
    enabled: bool
    provider: Literal["serpapi"]
    status: Literal["not_configured", "ready"]
    hour_limit: int
    month_limit: int


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


class LeadDiscoverySearchResponse(ApiModel):
    provider: Literal["serpapi"]
    items: list[LeadDiscoveryCandidateResponse]


OpportunityStage = Literal["nuevo", "contactado", "propuesta", "negociacion", "cerrado", "perdido"]
ActivityType = Literal["llamada", "email", "reunion", "nota", "tarea"]
CustomerLifecycleStatus = Literal["activo", "prospecto", "inactivo"]
CrmQuoteStatus = Literal["borrador", "enviada", "aceptada", "rechazada", "vencida"]
CrmSortDirection = Literal["asc", "desc"]


def _serialize_decimal(value: Decimal) -> str:
    return format(value, "f")


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
    source_url: HttpUrl | None = Field(default=None, max_length=1000)
    scraped_at: datetime | None = None
    raw_snippet: str | None = Field(default=None, max_length=4000)
    status: EditableLeadStatus = "nuevo"
    score_manual: int | None = Field(default=None, ge=0, le=100)
    score_notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "company")
    @classmethod
    def normalize_names(cls, value: str) -> str:
        return _normalize_required_text(value)

    @field_validator("phone", "location", "raw_snippet", "score_notes")
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
    status: EditableLeadStatus | None = None
    score_manual: int | None = Field(default=None, ge=0, le=100)
    score_notes: str | None = Field(default=None, max_length=2000)
    raw_snippet: str | None = Field(default=None, max_length=4000)

    @field_validator("name", "company")
    @classmethod
    def normalize_names(cls, value: str | None) -> str | None:
        return _normalize_required_text(value) if value is not None else None

    @field_validator("phone", "location", "score_notes", "raw_snippet")
    @classmethod
    def normalize_optional_fields(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def require_change(self) -> Self:
        if not self.model_fields_set - {"version"}:
            raise ValueError("Debes enviar al menos un cambio.")
        return self


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
    source_url: str | None
    scraped_at: datetime | None
    raw_snippet: str | None
    status: LeadStatus
    score_auto: int
    score_manual: int | None
    score: int
    module_fits: dict[str, int]
    score_reasons: list[str]
    score_notes: str | None
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


class ScoringSettingsResponse(ApiModel):
    weights: dict[str, float]
    hour_limit: int
    month_limit: int
    version: int
    updated_at: datetime


class UpdateScoringSettingsRequest(ApiModel):
    version: int = Field(ge=1)
    weights: dict[str, float] = Field(min_length=7, max_length=7)

    @field_validator("weights")
    @classmethod
    def validate_weights(cls, value: dict[str, float]) -> dict[str, float]:
        expected = {"pos", "agenda", "inventarios", "finanzas", "crm", "incidencias", "config"}
        if set(value) != expected:
            raise ValueError("Debes configurar exactamente los siete módulos de scoring.")
        if any(weight < 0 or weight > 5 for weight in value.values()):
            raise ValueError("Cada peso debe estar entre 0 y 5.")
        return value


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
    settings: ScoringSettingsResponse
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


class CrmQuoteListResponse(ApiModel):
    quote: QuoteListItemResponse
    opportunity_id: UUID | None
    crm_status: CrmQuoteStatus


class PaginatedCrmQuotesResponse(ApiModel):
    items: list[CrmQuoteListResponse]
    page: int
    page_size: int
    total_items: int
    total_pages: int
