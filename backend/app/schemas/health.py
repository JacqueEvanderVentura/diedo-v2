from typing import Literal

from app.schemas.common import ApiModel


class HealthResponse(ApiModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(ApiModel):
    status: Literal["ready"] = "ready"
    database: Literal["ok"] = "ok"
