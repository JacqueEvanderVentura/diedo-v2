from typing import Literal

from app.schemas.common import ApiModel


class FoundationStatusResponse(ApiModel):
    status: Literal["ready"] = "ready"
    database: Literal["ok"] = "ok"
    workspace_count: int
    legal_entity_count: int
    branch_count: int
    active_membership_count: int
    enabled_modules: list[str]
