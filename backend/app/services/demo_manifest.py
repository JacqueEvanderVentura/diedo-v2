from __future__ import annotations

import base64
import binascii
import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from pydantic import EmailStr, Field, field_validator, model_validator

from app.schemas.common import ApiModel

_REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DEMO_DATA_DIR = _REPOSITORY_ROOT / "demo-data" / "v1"


class ManifestFile(ApiModel):
    name: str = Field(pattern=r"^[a-z][a-z0-9-]*\.json$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    count: int = Field(ge=0)


class DemoManifest(ApiModel):
    seed_version: str
    schema_version: str
    workspace_slug: str
    modules: list[str]
    files: list[ManifestFile]


class DemoBranchFixture(ApiModel):
    seed_key: str
    code: str
    name: str
    timezone: str


class FoundationFixture(ApiModel):
    branches: list[DemoBranchFixture]


class DemoAppointmentFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    resource_code: str
    customer_seed_key: str | None = None
    employee_seed_key: str | None = None
    service_seed_key: str | None = None
    date: date
    time: time
    duration_minutes: int = Field(ge=5, le=480)
    status: Literal[
        "pending",
        "confirmed",
        "completed",
        "attended",
        "no_show",
        "cancelled",
        "delayed",
        "rescheduled",
    ]
    created_at: datetime


class AgendaFixture(ApiModel):
    items: list[DemoAppointmentFixture]


class DemoDashboardTaskFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    title: str = Field(min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    status: Literal["open", "in_progress", "completed", "cancelled"]
    priority: Literal["low", "medium", "high", "critical"]
    due_at: datetime
    completed_at: datetime | None = None
    assigned_to_name: str | None = Field(default=None, max_length=160)
    source: str = Field(min_length=2, max_length=48)
    source_route: str = Field(min_length=1, max_length=240)
    created_at: datetime

    @model_validator(mode="after")
    def validate_completion(self) -> DemoDashboardTaskFixture:
        if (self.status == "completed") != (self.completed_at is not None):
            raise ValueError("Completed demo tasks require completedAt exclusively.")
        return self


class DashboardFixture(ApiModel):
    tasks: list[DemoDashboardTaskFixture]


class DemoUserFixture(ApiModel):
    seed_key: str
    display_name: str
    email: EmailStr
    role_code: str
    branch_codes: list[str]
    workspace_wide: bool
    status: Literal["active", "suspended"]


class IamFixture(ApiModel):
    role_permissions: dict[str, list[str]]
    users: list[DemoUserFixture]


class DemoWorkspaceFixture(ApiModel):
    business_name: str
    tax_default_rate: int = Field(ge=0, le=100)
    locale: str
    currency: str = Field(min_length=3, max_length=3)


class DemoPaymentMethodFixture(ApiModel):
    seed_key: str
    code: str
    name: str
    icon: str
    enabled: bool
    system: bool
    channel: Literal[
        "cash",
        "card",
        "bank_transfer",
        "payment_link",
        "credit",
        "other",
    ] = "other"
    settlement_policy: Literal["immediate", "pending_confirmation", "receivable"] = "immediate"
    affects_cash_drawer: bool = False
    requires_evidence: bool = False


class ConfigurationFixture(ApiModel):
    workspace: DemoWorkspaceFixture
    payment_methods: list[DemoPaymentMethodFixture]


class DemoCustomerFixture(ApiModel):
    seed_key: str
    customer_type: Literal["person", "business"] = "person"
    display_name: str
    first_name: str | None = None
    last_name: str | None = None
    business_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    branch_codes: list[str]
    status: Literal["active", "inactive"] = "active"
    points: int = Field(default=0, ge=0)


class CustomersFixture(ApiModel):
    items: list[DemoCustomerFixture]


class DemoCustomerCrmProfileFixture(ApiModel):
    customer_seed_key: str
    lifecycle_status: Literal["activo", "prospecto", "inactivo"] = "activo"
    notes: str | None = Field(default=None, max_length=2000)


class DemoCrmLeadFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    assigned_user_seed_key: str
    name: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=40)
    website: str | None = Field(default=None, max_length=500)
    location: str | None = Field(default=None, max_length=240)
    source: Literal["manual", "serp", "serper", "referral", "import"] = "manual"
    source_url: str | None = Field(default=None, max_length=1000)
    scraped_at: datetime | None = None
    raw_snippet: str | None = Field(default=None, max_length=4000)
    status: Literal["nuevo", "contactado", "calificado", "descartado", "convertido"]
    score_manual: int | None = Field(default=None, ge=0, le=100)
    score_notes: str | None = Field(default=None, max_length=2000)
    converted_customer_seed_key: str | None = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def require_consistent_conversion(self) -> DemoCrmLeadFixture:
        if (self.status == "convertido") != (self.converted_customer_seed_key is not None):
            raise ValueError("Converted demo leads require convertedCustomerSeedKey exclusively.")
        if not self.name.strip() and not self.company.strip():
            raise ValueError("Demo leads require a name or company.")
        if self.updated_at < self.created_at:
            raise ValueError("Demo lead updatedAt cannot precede createdAt.")
        return self


class DemoCrmOpportunityFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    assigned_user_seed_key: str
    lead_seed_key: str | None = None
    customer_seed_key: str | None = None
    title: str = Field(min_length=2, max_length=240)
    customer_name: str = Field(min_length=1, max_length=200)
    stage: Literal["nuevo", "contactado", "propuesta", "negociacion", "cerrado", "perdido"]
    value: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    currency_code: str = Field(default="DOP", min_length=3, max_length=3)
    notes: str | None = Field(default=None, max_length=2000)
    lost_reason: str | None = Field(default=None, max_length=1000)
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None

    @model_validator(mode="after")
    def require_consistent_stage(self) -> DemoCrmOpportunityFixture:
        is_closed = self.stage in {"cerrado", "perdido"}
        if is_closed != (self.closed_at is not None):
            raise ValueError("Closed demo opportunities require closedAt exclusively.")
        if self.stage == "perdido" and not self.lost_reason:
            raise ValueError("Lost demo opportunities require lostReason.")
        if self.updated_at < self.created_at:
            raise ValueError("Demo opportunity updatedAt cannot precede createdAt.")
        return self


class DemoCrmActivityFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    assigned_user_seed_key: str
    lead_seed_key: str | None = None
    opportunity_seed_key: str | None = None
    customer_seed_key: str | None = None
    activity_type: Literal["llamada", "email", "reunion", "nota", "tarea"]
    title: str = Field(min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=2000)
    customer_name: str | None = Field(default=None, max_length=200)
    due_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def require_relationship(self) -> DemoCrmActivityFixture:
        if not any((self.lead_seed_key, self.opportunity_seed_key, self.customer_seed_key)):
            raise ValueError("Demo CRM activities require a lead, opportunity, or customer.")
        if self.updated_at < self.created_at:
            raise ValueError("Demo activity updatedAt cannot precede createdAt.")
        return self


class CrmFixture(ApiModel):
    scoring_weights: dict[str, float] = Field(default_factory=dict)
    customer_profiles: list[DemoCustomerCrmProfileFixture] = Field(default_factory=list)
    leads: list[DemoCrmLeadFixture] = Field(default_factory=list)
    opportunities: list[DemoCrmOpportunityFixture] = Field(default_factory=list)
    activities: list[DemoCrmActivityFixture] = Field(default_factory=list)


class DemoEmployeeFixture(ApiModel):
    seed_key: str
    employee_number: str
    first_name: str
    last_name: str
    email: EmailStr | None = None
    phone: str | None = None
    position: str
    department: str | None = None
    contract_type: str | None = None
    hire_date: date
    branch_codes: list[str]
    supervisor_seed_keys: list[str] = Field(default_factory=list)
    user_seed_key: str | None = None
    status: Literal["active", "inactive"] = "active"
    timezone: str = "America/Santo_Domingo"
    work_schedule: dict[str, Any] = Field(default_factory=dict)
    future_hr: dict[str, Any] = Field(default_factory=dict)


class EmployeesFixture(ApiModel):
    items: list[DemoEmployeeFixture]


class DemoCatalogCategoryFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=500)
    status: Literal["active", "inactive"] = "active"


class DemoCatalogItemFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    sku: str | None = Field(default=None, min_length=1, max_length=64)
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=1000)
    item_type: Literal["product", "service", "supply", "membership", "asset_template", "other"]
    category_seed_key: str
    unit_code: str
    branch_codes: list[str] = Field(min_length=1, max_length=100)
    status: Literal["active", "inactive"] = "active"


class CatalogFixture(ApiModel):
    categories: list[DemoCatalogCategoryFixture]
    items: list[DemoCatalogItemFixture]


class DemoInventoryItemProfileFixture(ApiModel):
    item_seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    sale_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    unit_cost: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100, decimal_places=2)
    minimum_stock: Decimal = Field(default=Decimal("0"), ge=0, decimal_places=3)
    stock_by_branch: dict[str, Decimal] = Field(default_factory=dict)

    @field_validator("stock_by_branch")
    @classmethod
    def require_non_negative_stock(cls, value: dict[str, Decimal]) -> dict[str, Decimal]:
        if any(quantity < 0 for quantity in value.values()):
            raise ValueError("Demo stock quantities cannot be negative.")
        return value


class DemoAssetFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=2, max_length=64)
    category_code: str
    branch_code: str
    acquisition_value: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    status: Literal["activo", "reparacion", "baja"] = "activo"
    location: str | None = Field(default=None, max_length=240)
    purchase_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)


class InventoryFixture(ApiModel):
    item_profiles: list[DemoInventoryItemProfileFixture]
    assets: list[DemoAssetFixture]


class DemoIncidentActivityFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    type: Literal["created", "status_changed", "comment"]
    author_user_seed_key: str
    message: str = Field(min_length=1, max_length=2000)
    created_at: datetime


class DemoIncidentAttachmentFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    original_filename: str = Field(min_length=1, max_length=255)
    content_type: Literal["image/jpeg", "image/png", "image/webp", "image/gif"]
    content_base64: str = Field(min_length=1, max_length=7_000_000)
    uploaded_by_user_seed_key: str
    created_at: datetime

    @field_validator("content_base64")
    @classmethod
    def require_valid_base64_image(cls, value: str) -> str:
        try:
            content = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Demo incident attachments must contain valid base64.") from exc
        if not content:
            raise ValueError("Demo incident attachments cannot be empty.")
        return value


class DemoIncidentFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    code: str = Field(pattern=r"^INC-[0-9]+$", max_length=32)
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(default="", max_length=5000)
    type: Literal["activo", "infraestructura", "personal"]
    priority: Literal["baja", "media", "alta", "critica"]
    status: Literal["abierta", "en_proceso", "resuelta", "cerrada"]
    branch_code: str
    asset_seed_key: str | None = None
    reporter_user_seed_key: str
    participant_user_seed_keys: list[str] = Field(default_factory=list)
    activities: list[DemoIncidentActivityFixture] = Field(min_length=1)
    attachments: list[DemoIncidentAttachmentFixture] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def require_consistent_incident(self) -> DemoIncidentFixture:
        if self.type != "activo" and self.asset_seed_key is not None:
            raise ValueError("Only asset demo incidents may reference an asset.")
        if self.updated_at < self.created_at:
            raise ValueError("Demo incident updatedAt cannot precede createdAt.")
        if len(self.participant_user_seed_keys) != len(set(self.participant_user_seed_keys)):
            raise ValueError("Demo incident participants must be unique.")
        return self


class IncidentsFixture(ApiModel):
    items: list[DemoIncidentFixture]


class DemoSupplierFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=200)
    rnc: str | None = Field(default=None, max_length=80)
    contact_name: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=40)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    branch_codes: list[str] = Field(min_length=1, max_length=100)
    product_count: int = Field(default=0, ge=0)
    active: bool = True


class DemoPurchaseRequestItemFixture(ApiModel):
    name: str = Field(min_length=1, max_length=240)
    qty: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit: str = Field(min_length=1, max_length=40)
    price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)


class DemoPurchaseRequestFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    number: str = Field(min_length=2, max_length=32)
    supplier_seed_key: str
    branch_code: str
    requester_user_seed_key: str
    requester_name: str = Field(min_length=1, max_length=160)
    items: list[DemoPurchaseRequestItemFixture] = Field(min_length=1, max_length=100)
    status: Literal["pendiente", "aprobada", "rechazada", "entregada"]
    priority: Literal["normal", "alta"] = "normal"
    notes: str | None = Field(default=None, max_length=2000)
    quote_file_name: str | None = Field(default=None, max_length=255)
    created_at: datetime
    reviewer_user_seed_key: str | None = None
    reviewed_at: datetime | None = None
    delivered_at: datetime | None = None

    @model_validator(mode="after")
    def require_status_timestamps(self) -> DemoPurchaseRequestFixture:
        reviewed = self.status in {"aprobada", "rechazada", "entregada"}
        if reviewed != bool(self.reviewer_user_seed_key and self.reviewed_at):
            raise ValueError("Reviewed demo requests require reviewer and reviewedAt.")
        if (self.status == "entregada") != (self.delivered_at is not None):
            raise ValueError("Only delivered demo requests may define deliveredAt.")
        return self


class DemoPurchasingSettingsFixture(ApiModel):
    approver_user_seed_key: str | None = None
    notify_on_request: bool = True


class PurchasingFixture(ApiModel):
    suppliers: list[DemoSupplierFixture]
    requests: list[DemoPurchaseRequestFixture]
    settings: DemoPurchasingSettingsFixture


class DemoLeaveRequestFixture(ApiModel):
    seed_key: str
    employee_seed_key: str
    start_date: date
    end_date: date
    reason: str
    status: Literal["pendiente", "aprobada", "rechazada", "cancelada"]
    requested_by_user_seed_key: str
    reviewed_by_user_seed_key: str | None = None
    reviewed_at: datetime | None = None


class DemoDebtPaymentFixture(ApiModel):
    seed_key: str
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    paid_on: date
    received_by_user_seed_key: str


class DemoEmployeeDebtFixture(ApiModel):
    seed_key: str
    employee_seed_key: str
    concept: str
    client_name: str | None = None
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    created_by_user_seed_key: str
    payments: list[DemoDebtPaymentFixture] = Field(default_factory=list)


class DemoHrDocumentFixture(ApiModel):
    seed_key: str
    employee_seed_key: str
    template_id: Literal["certificado", "bancaria", "recomendacion", "vacaciones"]
    issue_date: date
    include_salary: bool = False
    created_by_user_seed_key: str


class HrFixture(ApiModel):
    leave_requests: list[DemoLeaveRequestFixture] = Field(default_factory=list)
    debts: list[DemoEmployeeDebtFixture] = Field(default_factory=list)
    documents: list[DemoHrDocumentFixture] = Field(default_factory=list)


class DemoPosLineFixture(ApiModel):
    item_seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)


class DemoPosRegisterFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    opened_by_user_seed_key: str
    opening_cash: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    opened_at: datetime
    status: Literal["open", "closed"]
    notes: str | None = Field(default=None, max_length=1000)
    closed_by_user_seed_key: str | None = None
    closed_at: datetime | None = None
    closing_difference: Decimal | None = Field(
        default=None,
        max_digits=14,
        decimal_places=2,
    )

    @model_validator(mode="after")
    def require_consistent_close(self) -> DemoPosRegisterFixture:
        closed_values = (
            self.closed_by_user_seed_key,
            self.closed_at,
            self.closing_difference,
        )
        if self.status == "closed" and any(value is None for value in closed_values):
            raise ValueError(
                "Closed demo registers require close actor, timestamp, and difference."
            )
        if self.status == "open" and any(value is not None for value in closed_values):
            raise ValueError("Open demo registers cannot define close data.")
        if self.closed_at is not None and self.closed_at <= self.opened_at:
            raise ValueError("Demo register closedAt must follow openedAt.")
        return self


class DemoPosQuoteFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    document_number: str = Field(pattern=r"^COT-[0-9]{8}$")
    branch_code: str
    customer_seed_key: str | None = None
    created_by_user_seed_key: str
    kind: Literal["quote", "held"] = "quote"
    origin: Literal["pos", "crm"] = "pos"
    opportunity_seed_key: str | None = None
    crm_status: Literal["borrador", "enviada", "aceptada", "rechazada", "vencida"] | None = None
    status: Literal["open", "converted", "cancelled", "expired"] = "open"
    payment_method_seed_key: str | None = None
    payment_reference: str | None = Field(default=None, max_length=160)
    lines: list[DemoPosLineFixture] = Field(min_length=1, max_length=100)
    discount_type: Literal["percent", "fixed"] | None = None
    discount_value: Decimal = Field(default=Decimal("0"), ge=0, decimal_places=2)
    notes: str | None = Field(default=None, max_length=1000)
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None

    @model_validator(mode="after")
    def require_consistent_quote(self) -> DemoPosQuoteFixture:
        if self.discount_value > 0 and self.discount_type is None:
            raise ValueError("Discounted demo quotes require discountType.")
        if self.discount_type == "percent" and self.discount_value > 100:
            raise ValueError("Demo quote percentage discounts cannot exceed 100.")
        if (self.status == "open") != (self.closed_at is None):
            raise ValueError("Only open demo quotes may omit closedAt.")
        if self.updated_at < self.created_at:
            raise ValueError("Demo quote updatedAt cannot precede createdAt.")
        if self.origin == "crm" and (self.crm_status is None or self.opportunity_seed_key is None):
            raise ValueError("CRM demo quotes require crmStatus and opportunitySeedKey.")
        if self.origin == "pos" and (
            self.crm_status is not None or self.opportunity_seed_key is not None
        ):
            raise ValueError("POS demo quotes cannot define CRM fields.")
        return self


class DemoPosReceivablePaymentFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    payment_method_seed_key: str
    received_by_user_seed_key: str
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    status: Literal["posted", "reversed"] = "posted"
    reference: str | None = Field(default=None, max_length=160)
    note: str | None = Field(default=None, max_length=1000)
    posted_at: datetime
    reversed_at: datetime | None = None
    reversed_by_user_seed_key: str | None = None
    reversal_reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_consistent_reversal(self) -> DemoPosReceivablePaymentFixture:
        reversal_values = (
            self.reversed_at,
            self.reversed_by_user_seed_key,
            self.reversal_reason,
        )
        if self.status == "reversed" and any(value is None for value in reversal_values):
            raise ValueError("Reversed demo payments require complete reversal data.")
        if self.status == "posted" and any(value is not None for value in reversal_values):
            raise ValueError("Posted demo payments cannot define reversal data.")
        if self.reversed_at is not None and self.reversed_at <= self.posted_at:
            raise ValueError("Demo payment reversedAt must follow postedAt.")
        return self


class DemoPosSaleFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    sale_number: str = Field(pattern=r"^VTA-[0-9]{8}$")
    branch_code: str
    register_seed_key: str
    customer_seed_key: str | None = None
    quote_seed_key: str | None = None
    payment_method_seed_key: str
    sold_by_user_seed_key: str
    lines: list[DemoPosLineFixture] = Field(min_length=1, max_length=100)
    discount_type: Literal["percent", "fixed"] | None = None
    discount_value: Decimal = Field(default=Decimal("0"), ge=0, decimal_places=2)
    payment_reference: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    completed_at: datetime
    status: Literal["completed", "voided"] = "completed"
    voided_at: datetime | None = None
    voided_by_user_seed_key: str | None = None
    void_reason: str | None = Field(default=None, max_length=1000)
    receivable_due_date: date | None = None
    receivable_reference: str | None = Field(default=None, max_length=160)
    receivable_notes: str | None = Field(default=None, max_length=1000)
    receivable_payments: list[DemoPosReceivablePaymentFixture] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_consistent_sale(self) -> DemoPosSaleFixture:
        if self.discount_value > 0 and self.discount_type is None:
            raise ValueError("Discounted demo sales require discountType.")
        if self.discount_type == "percent" and self.discount_value > 100:
            raise ValueError("Demo sale percentage discounts cannot exceed 100.")
        void_values = (self.voided_at, self.voided_by_user_seed_key, self.void_reason)
        if self.status == "voided" and any(value is None for value in void_values):
            raise ValueError("Voided demo sales require complete void data.")
        if self.status == "completed" and any(value is not None for value in void_values):
            raise ValueError("Completed demo sales cannot define void data.")
        if self.voided_at is not None and self.voided_at <= self.completed_at:
            raise ValueError("Demo sale voidedAt must follow completedAt.")
        return self


class DemoPosCashAdjustmentFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    register_seed_key: str
    created_by_user_seed_key: str
    movement_type: Literal["income", "expense"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    concept: str = Field(min_length=2, max_length=240)
    reference: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=1000)
    created_at: datetime


class PosFixture(ApiModel):
    registers: list[DemoPosRegisterFixture]
    quotes: list[DemoPosQuoteFixture]
    sales: list[DemoPosSaleFixture]
    cash_adjustments: list[DemoPosCashAdjustmentFixture] = Field(default_factory=list)


class DemoFinanceBudgetFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    name: str = Field(min_length=1, max_length=160)
    group: Literal["marketing", "operaciones", "rh", "it"]
    monthly_limit: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    created_at: datetime


class DemoFinanceExpenseFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    budget_seed_key: str | None = None
    concept: str = Field(min_length=1, max_length=240)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    category: Literal[
        "alquiler",
        "servicios",
        "nomina",
        "insumos",
        "marketing",
        "mantenimiento",
        "otros",
    ]
    date: date
    status: Literal["pagado", "pendiente"]
    created_at: datetime


class DemoFinanceFixedPaymentFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    period: date
    paid_on: date
    created_at: datetime

    @field_validator("period")
    @classmethod
    def require_first_day(cls, value: date) -> date:
        if value.day != 1:
            raise ValueError("Demo fixed-expense periods must use the first day.")
        return value


class DemoFinanceFixedExpenseFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    concept: str = Field(min_length=1, max_length=240)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    category: Literal[
        "alquiler",
        "servicios",
        "nomina",
        "insumos",
        "marketing",
        "mantenimiento",
        "otros",
    ]
    day_of_month: int = Field(ge=1, le=31)
    payments: list[DemoFinanceFixedPaymentFixture] = Field(default_factory=list)
    created_at: datetime


class DemoFinanceLiabilityFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    name: str = Field(min_length=1, max_length=200)
    type: Literal["prestamo", "tarjeta"]
    initial_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    pending_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    pay_day: int = Field(ge=1, le=31)
    cut_day: int | None = Field(default=None, ge=1, le=31)
    installment: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    paid_installments: int = Field(default=0, ge=0)
    total_installments: int | None = Field(default=None, gt=0)
    category_ids: list[str] = Field(default_factory=list, max_length=7)
    created_at: datetime

    @model_validator(mode="after")
    def require_consistent_liability(self) -> DemoFinanceLiabilityFixture:
        if self.pending_amount > self.initial_amount:
            raise ValueError("Demo pending liability cannot exceed its initial amount.")
        if self.type == "tarjeta":
            if self.cut_day is None or any(
                (self.installment is not None, self.total_installments is not None)
            ):
                raise ValueError("Demo cards require cutDay and cannot define installments.")
            if self.paid_installments:
                raise ValueError("Demo cards cannot define paid installments.")
        elif self.cut_day is not None:
            raise ValueError("Demo loans cannot define cutDay.")
        if self.total_installments is not None and self.paid_installments > self.total_installments:
            raise ValueError("Demo paid installments cannot exceed their total.")
        return self


class DemoFinanceAccountFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    name: str = Field(min_length=1, max_length=160)
    type: Literal["banco", "inversion", "accionistas"]
    bank: str = Field(default="", max_length=160)
    account_number_masked: str = Field(default="", max_length=32)
    balance: Decimal = Field(max_digits=14, decimal_places=2)
    currency: str = Field(default="DOP", pattern=r"^[A-Z]{3}$")
    notes: str = Field(default="", max_length=1000)
    created_at: datetime


class DemoFinanceIncomeFixture(ApiModel):
    seed_key: str = Field(pattern=r"^[a-z0-9-]+$")
    branch_code: str
    category: Literal["servicios", "efectivo", "tarjeta", "transferencia", "link"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    date: date
    customer: str = Field(default="", max_length=200)
    source: str = Field(min_length=1, max_length=48)
    status: Literal["pagado", "pendiente"]
    created_at: datetime


class FinanceFixture(ApiModel):
    budgets: list[DemoFinanceBudgetFixture] = Field(default_factory=list)
    expenses: list[DemoFinanceExpenseFixture] = Field(default_factory=list)
    fixed_expenses: list[DemoFinanceFixedExpenseFixture] = Field(default_factory=list)
    liabilities: list[DemoFinanceLiabilityFixture] = Field(default_factory=list)
    accounts: list[DemoFinanceAccountFixture] = Field(default_factory=list)
    manual_incomes: list[DemoFinanceIncomeFixture] = Field(default_factory=list)


@dataclass(frozen=True)
class DemoBundle:
    manifest: DemoManifest
    foundation: FoundationFixture
    agenda: AgendaFixture
    dashboard: DashboardFixture
    iam: IamFixture
    configuration: ConfigurationFixture
    catalog: CatalogFixture
    inventory: InventoryFixture
    incidents: IncidentsFixture
    purchasing: PurchasingFixture
    customers: CustomersFixture
    crm: CrmFixture
    employees: EmployeesFixture
    hr: HrFixture
    pos: PosFixture
    finance: FinanceFixture


def load_demo_bundle(directory: Path = DEFAULT_DEMO_DATA_DIR) -> DemoBundle:
    root = directory.resolve()
    manifest_path = root / "manifest.json"
    manifest = DemoManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    files = {entry.name: entry for entry in manifest.files}
    required = {
        "foundation.json",
        "agenda.json",
        "dashboard.json",
        "iam.json",
        "configuration.json",
        "catalog.json",
        "inventory.json",
        "incidents.json",
        "purchasing.json",
        "customers.json",
        "crm.json",
        "employees.json",
        "hr.json",
        "pos.json",
        "finance.json",
    }
    if not required <= files.keys():
        raise ValueError("The demo manifest is missing required Phase 0 files.")
    for entry in manifest.files:
        path = (root / entry.name).resolve()
        if path.parent != root:
            raise ValueError("Demo manifest paths must remain inside the version directory.")
        # Git may materialize CRLF on Windows. Checksums describe the canonical LF fixture.
        canonical_bytes = path.read_bytes().replace(b"\r\n", b"\n")
        digest = hashlib.sha256(canonical_bytes).hexdigest()
        if digest != entry.sha256:
            raise ValueError(
                f"Checksum mismatch for {entry.name}: expected {entry.sha256}, got {digest}."
            )
        json.loads(path.read_text(encoding="utf-8"))
    return DemoBundle(
        manifest=manifest,
        foundation=FoundationFixture.model_validate_json(
            (root / "foundation.json").read_text(encoding="utf-8")
        ),
        agenda=AgendaFixture.model_validate_json(
            (root / "agenda.json").read_text(encoding="utf-8")
        ),
        dashboard=DashboardFixture.model_validate_json(
            (root / "dashboard.json").read_text(encoding="utf-8")
        ),
        iam=IamFixture.model_validate_json((root / "iam.json").read_text(encoding="utf-8")),
        configuration=ConfigurationFixture.model_validate_json(
            (root / "configuration.json").read_text(encoding="utf-8")
        ),
        catalog=CatalogFixture.model_validate_json(
            (root / "catalog.json").read_text(encoding="utf-8")
        ),
        inventory=InventoryFixture.model_validate_json(
            (root / "inventory.json").read_text(encoding="utf-8")
        ),
        incidents=IncidentsFixture.model_validate_json(
            (root / "incidents.json").read_text(encoding="utf-8")
        ),
        purchasing=PurchasingFixture.model_validate_json(
            (root / "purchasing.json").read_text(encoding="utf-8")
        ),
        customers=CustomersFixture.model_validate_json(
            (root / "customers.json").read_text(encoding="utf-8")
        ),
        crm=CrmFixture.model_validate_json((root / "crm.json").read_text(encoding="utf-8")),
        employees=EmployeesFixture.model_validate_json(
            (root / "employees.json").read_text(encoding="utf-8")
        ),
        hr=HrFixture.model_validate_json((root / "hr.json").read_text(encoding="utf-8")),
        pos=PosFixture.model_validate_json((root / "pos.json").read_text(encoding="utf-8")),
        finance=FinanceFixture.model_validate_json(
            (root / "finance.json").read_text(encoding="utf-8")
        ),
    )
