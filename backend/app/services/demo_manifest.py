from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime
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
    item_type: Literal[
        "product", "service", "supply", "membership", "asset_template", "other"
    ]
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


@dataclass(frozen=True)
class DemoBundle:
    manifest: DemoManifest
    foundation: FoundationFixture
    iam: IamFixture
    configuration: ConfigurationFixture
    catalog: CatalogFixture
    inventory: InventoryFixture
    purchasing: PurchasingFixture
    customers: CustomersFixture
    employees: EmployeesFixture
    hr: HrFixture


def load_demo_bundle(directory: Path = DEFAULT_DEMO_DATA_DIR) -> DemoBundle:
    root = directory.resolve()
    manifest_path = root / "manifest.json"
    manifest = DemoManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    files = {entry.name: entry for entry in manifest.files}
    required = {
        "foundation.json",
        "iam.json",
        "configuration.json",
        "catalog.json",
        "inventory.json",
        "purchasing.json",
        "customers.json",
        "employees.json",
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
            raise ValueError(f"Checksum mismatch for {entry.name}.")
        json.loads(path.read_text(encoding="utf-8"))
    return DemoBundle(
        manifest=manifest,
        foundation=FoundationFixture.model_validate_json(
            (root / "foundation.json").read_text(encoding="utf-8")
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
        purchasing=PurchasingFixture.model_validate_json(
            (root / "purchasing.json").read_text(encoding="utf-8")
        ),
        customers=CustomersFixture.model_validate_json(
            (root / "customers.json").read_text(encoding="utf-8")
        ),
        employees=EmployeesFixture.model_validate_json(
            (root / "employees.json").read_text(encoding="utf-8")
        ),
        hr=HrFixture.model_validate_json((root / "hr.json").read_text(encoding="utf-8")),
    )
