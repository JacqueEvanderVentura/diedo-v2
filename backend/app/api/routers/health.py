import logging

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DatabaseSession
from app.config import settings
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
        revision = database.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    except SQLAlchemyError as exc:
        logger.warning("Database readiness check failed", exc_info=exc)
        raise_api_error(503, "La base de datos no esta disponible.")
    if revision != settings.expected_schema_revision:
        logger.warning(
            "Database schema revision mismatch: expected=%s actual=%s",
            settings.expected_schema_revision,
            revision,
        )
        raise_api_error(503, "El esquema de la base de datos no es compatible.")
    return ReadinessResponse(schema_revision=revision)
