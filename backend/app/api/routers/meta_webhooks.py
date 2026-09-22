import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import PlainTextResponse

from app.api.deps import DatabaseSession
from app.config import settings
from app.services.chat.inbound import ChatInboundService
from app.services.chat.meta_signature import verify_meta_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

_inbound_service = ChatInboundService()


@router.get(
    "/meta",
    summary="Meta webhook verification",
    response_class=PlainTextResponse,
)
def verify_meta_webhook(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
) -> Response:
    expected = (
        settings.meta_webhook_verify_token.get_secret_value()
        if settings.meta_webhook_verify_token is not None
        else None
    )
    if hub_mode == "subscribe" and expected and hub_verify_token == expected:
        return PlainTextResponse(content=hub_challenge)
    raise HTTPException(status_code=403, detail={"message": "Verification failed."})


@router.post("/meta", summary="Meta webhook events")
async def receive_meta_webhook(request: Request, database: DatabaseSession) -> dict[str, bool]:
    body = await request.body()
    app_secret = (
        settings.meta_app_secret.get_secret_value()
        if settings.meta_app_secret is not None
        else None
    )
    if not app_secret:
        logger.warning("meta webhook rejected: META_APP_SECRET is not configured")
        raise HTTPException(
            status_code=403,
            detail={"message": "Webhook signature not configured."},
        )

    signature = request.headers.get("X-Hub-Signature-256")
    if not verify_meta_signature(body, signature, app_secret):
        raise HTTPException(status_code=403, detail={"message": "Invalid signature."})

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail={"message": "Invalid JSON payload."}) from None
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail={"message": "Webhook payload must be an object."},
        )

    try:
        ingested = _inbound_service.ingest_webhook_payload(database, payload)
        database.commit()
    except Exception:
        database.rollback()
        logger.exception("meta webhook ingest failed")
        raise

    logger.info("meta webhook processed ingested_messages=%s", ingested)
    return {"success": True}
