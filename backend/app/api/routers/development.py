import logging

from fastapi import APIRouter
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import DatabaseSession
from app.core.errors import raise_api_error
from app.schemas.common import ErrorResponse
from app.schemas.foundation import FoundationStatusResponse
from app.services.foundation import read_foundation_status

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dev", tags=["development"])


@router.get(
    "/foundation",
    summary="Inspect the installed local foundation",
    responses={503: {"model": ErrorResponse}},
)
def foundation_status(database: DatabaseSession) -> FoundationStatusResponse:
    try:
        snapshot = read_foundation_status(database)
    except SQLAlchemyError as exc:
        logger.warning("Foundation status query failed", exc_info=exc)
        raise_api_error(503, "La base de datos fundacional no esta disponible.")

    return FoundationStatusResponse(
        workspace_count=snapshot.workspace_count,
        legal_entity_count=snapshot.legal_entity_count,
        branch_count=snapshot.branch_count,
        active_membership_count=snapshot.active_membership_count,
        enabled_modules=snapshot.enabled_modules,
    )
