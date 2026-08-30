from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Literal

from pydantic import EmailStr, Field

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


@dataclass(frozen=True)
class DemoBundle:
    manifest: DemoManifest
    foundation: FoundationFixture
    iam: IamFixture
    configuration: ConfigurationFixture
    customers: CustomersFixture
    employees: EmployeesFixture


def load_demo_bundle(directory: Path = DEFAULT_DEMO_DATA_DIR) -> DemoBundle:
    root = directory.resolve()
    manifest_path = root / "manifest.json"
    manifest = DemoManifest.model_validate_json(manifest_path.read_text(encoding="utf-8"))
    files = {entry.name: entry for entry in manifest.files}
    required = {
        "foundation.json",
        "iam.json",
        "configuration.json",
        "customers.json",
        "employees.json",
    }
    if not required <= files.keys():
        raise ValueError("The demo manifest is missing required Phase 0 files.")
    for entry in manifest.files:
        path = (root / entry.name).resolve()
        if path.parent != root:
            raise ValueError("Demo manifest paths must remain inside the version directory.")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
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
        customers=CustomersFixture.model_validate_json(
            (root / "customers.json").read_text(encoding="utf-8")
        ),
        employees=EmployeesFixture.model_validate_json(
            (root / "employees.json").read_text(encoding="utf-8")
        ),
    )
