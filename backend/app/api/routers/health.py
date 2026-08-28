import logging

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DatabaseSession
from app.core.errors import raise_api_error
from app.schemas.common import ErrorResponse
from app.schemas.health import HealthResponse, ReadinessResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", summary="Liveness check")
def health() -> HealthResponse:
    return HealthResponse()


@router.get(
    "/ready",
    summary="Database readiness check",
    responses={503: {"model": ErrorResponse}},
)
def readiness(database: DatabaseSession) -> ReadinessResponse:
    try:
        database.execute(text("SELECT 1")).scalar_one()
    except SQLAlchemyError as exc:
        logger.warning("Database readiness check failed", exc_info=exc)
        raise_api_error(503, "La base de datos no esta disponible.")
    return ReadinessResponse()
