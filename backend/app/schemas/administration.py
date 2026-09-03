import re
from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import EmailStr, Field, field_validator, model_validator

from app.schemas.common import ApiModel

PaymentChannel = Literal[
    "cash",
    "card",
    "bank_transfer",
    "payment_link",
    "credit",
    "other",
]
PaymentSettlementPolicy = Literal["immediate", "pending_confirmation", "receivable"]


class WorkspaceSettingsResponse(ApiModel):
    id: UUID
    name: str
    default_currency: str
    timezone: str
    locale: str
    tax_default_rate: Decimal
    version: int


class UpdateWorkspaceSettingsRequest(ApiModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)
    timezone: str | None = Field(default=None, min_length=3, max_length=64)
    locale: str | None = Field(default=None, min_length=2, max_length=16)
    tax_default_rate: Decimal | None = Field(default=None, ge=0, le=100)
    version: int = Field(ge=1)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        return " ".join(value.split()) if value is not None else None

    @field_validator("default_currency")
    @classmethod
    def normalize_currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class LegalEntityTaxIdentityResponse(ApiModel):
    id: UUID
    jurisdiction_code: str
    identifier_type: str
    identifier_value: str
    registered_name: str
    valid_from: date
    valid_to: date | None = Field(
        description="Límite final exclusivo; null indica que la identidad sigue vigente."
    )


class LegalEntityBranchReference(ApiModel):
    id: UUID
    code: str
    name: str


class LegalEntitySharingResponse(ApiModel):
    branch_count: int = Field(
        ge=0,
        description="Cantidad de sucursales visibles para el actor actual.",
    )
    shared: bool


class LegalEntityResponse(ApiModel):
    id: UUID
    code: str
    legal_name: str
    display_name: str | None
    status: Literal["active", "inactive", "archived"]
    version: int
    tax_identity: LegalEntityTaxIdentityResponse | None
    branches: list[LegalEntityBranchReference]
    sharing: LegalEntitySharingResponse


class FiscalProfileUpdateResponse(LegalEntityResponse):
    affected_branch_ids: list[UUID]


class FiscalTaxIdentityInput(ApiModel):
    jurisdiction_code: Literal["DO"] = "DO"
    identifier_type: Literal["RNC"] = "RNC"
    identifier_value: str

    @field_validator("identifier_value")
    @classmethod
    def normalize_do_rnc(cls, value: str) -> str:
        raw = value.strip()
        if not raw or re.fullmatch(r"[0-9 -]+", raw) is None:
            raise ValueError("El RNC solo puede contener dígitos, espacios y guiones.")
        normalized = re.sub(r"[ -]", "", raw)
        if len(normalized) != 9:
            raise ValueError("El RNC debe contener exactamente 9 dígitos.")
        return normalized


class UpdateFiscalProfileRequest(ApiModel):
    legal_name: str = Field(min_length=2, max_length=200)
    display_name: str | None = Field(max_length=160)
    tax_identity: FiscalTaxIdentityInput | None
    effective_from: date | None = None
    version: int = Field(ge=1)

    @field_validator("legal_name")
    @classmethod
    def normalize_legal_name(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        return " ".join(value.split()) if value is not None else None


class UpdateLegalEntityRequest(ApiModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=160)
    status: Literal["active", "inactive"] | None = None
    version: int = Field(ge=1)


class BranchPartner(ApiModel):
    name: str = Field(min_length=2, max_length=160)
    document: str | None = Field(default=None, max_length=32)
    share: Decimal = Field(ge=0, le=100)


class BranchDetails(ApiModel):
    address: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=40)
    email: EmailStr | None = None
    manager: str = Field(default="", max_length=160)
    schedule: str = Field(default="", max_length=120)
    independent_business: bool = False
    partners: list[BranchPartner] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_partner_shares(self) -> BranchDetails:
        if sum((partner.share for partner in self.partners), Decimal("0")) > 100:
            raise ValueError("La participación total no puede superar 100%.")
        return self


class BranchDetailsPatch(ApiModel):
    address: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=40)
    email: EmailStr | None = None
    manager: str = Field(default="", max_length=160)
    schedule: str = Field(default="", max_length=120)
    independent_business: bool = False
    partners: list[BranchPartner] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def validate_partner_shares(self) -> BranchDetailsPatch:
        if sum((partner.share for partner in self.partners), Decimal("0")) > 100:
            raise ValueError("La participación total no puede superar 100%.")
        return self


class ExistingLegalEntityAssignment(ApiModel):
    type: Literal["existing"]
    legal_entity_id: UUID


class NewLegalEntityFiscalProfile(ApiModel):
    legal_name: str = Field(min_length=2, max_length=200)
    display_name: str | None = Field(max_length=160)
    tax_identity: FiscalTaxIdentityInput
    effective_from: date | None = None

    @field_validator("legal_name")
    @classmethod
    def normalize_legal_name(cls, value: str) -> str:
        return " ".join(value.split())

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str | None) -> str | None:
        return " ".join(value.split()) if value is not None else None


class CreateLegalEntityRequest(NewLegalEntityFiscalProfile):
    code: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()


class NewLegalEntityAssignment(ApiModel):
    type: Literal["new"]
    fiscal_profile: NewLegalEntityFiscalProfile


LegalEntityAssignment = Annotated[
    ExistingLegalEntityAssignment | NewLegalEntityAssignment,
    Field(discriminator="type"),
]


class BranchResponse(ApiModel):
    id: UUID
    legal_entity_id: UUID
    code: str
    name: str
    status: Literal["active", "inactive", "archived"]
    timezone: str
    details: BranchDetails
    version: int


class CreateBranchRequest(ApiModel):
    legal_entity_id: UUID | None = None
    legal_entity_assignment: LegalEntityAssignment | None = None
    code: str = Field(min_length=2, max_length=32, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=160)
    timezone: str = Field(min_length=3, max_length=64)
    details: BranchDetails = Field(default_factory=BranchDetails)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper()

    @model_validator(mode="after")
    def require_one_legal_entity_source(self) -> CreateBranchRequest:
        if (self.legal_entity_id is None) == (self.legal_entity_assignment is None):
            raise ValueError("Envía legalEntityId o legalEntityAssignment, pero no ambos.")
        return self


class UpdateBranchRequest(ApiModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    status: Literal["active", "inactive"] | None = None
    timezone: str | None = Field(default=None, min_length=3, max_length=64)
    details: BranchDetailsPatch | None = None
    version: int = Field(ge=1)


class UpdateBranchLegalEntityAssignmentRequest(ApiModel):
    assignment: LegalEntityAssignment
    version: int = Field(ge=1)


class BranchLegalEntityAssignmentResponse(ApiModel):
    branch: BranchResponse
    legal_entity: LegalEntityResponse
    previous_legal_entity_id: UUID


class PaymentMethodResponse(ApiModel):
    id: UUID
    code: str
    name: str
    icon: str
    status: Literal["active", "inactive", "archived"]
    is_system: bool
    channel: PaymentChannel
    settlement_policy: PaymentSettlementPolicy
    affects_cash_drawer: bool
    requires_evidence: bool
    version: int


class CreatePaymentMethodRequest(ApiModel):
    code: str = Field(min_length=2, max_length=48, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=120)
    icon: str = Field(default="Wallet", min_length=2, max_length=48)
    channel: PaymentChannel = "other"
    settlement_policy: PaymentSettlementPolicy = "immediate"
    affects_cash_drawer: bool = False
    requires_evidence: bool = False

    @field_validator("code", mode="before")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().lower()

    @model_validator(mode="after")
    def validate_cash_drawer_channel(self) -> CreatePaymentMethodRequest:
        if self.affects_cash_drawer and self.channel != "cash":
            raise ValueError("Solo un método con channel cash puede afectar la caja.")
        if self.requires_evidence and self.settlement_policy == "immediate":
            raise ValueError("Un método que requiere comprobante no puede liquidarse de inmediato.")
        return self


class UpdatePaymentMethodRequest(ApiModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    icon: str | None = Field(default=None, min_length=2, max_length=48)
    status: Literal["active", "inactive"] | None = None
    channel: PaymentChannel | None = None
    settlement_policy: PaymentSettlementPolicy | None = None
    affects_cash_drawer: bool | None = None
    requires_evidence: bool | None = None
    version: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_cash_drawer_channel(self) -> UpdatePaymentMethodRequest:
        if self.affects_cash_drawer is True and self.channel not in {None, "cash"}:
            raise ValueError("Solo un método con channel cash puede afectar la caja.")
        if self.requires_evidence is True and self.settlement_policy == "immediate":
            raise ValueError("Un método que requiere comprobante no puede liquidarse de inmediato.")
        return self
