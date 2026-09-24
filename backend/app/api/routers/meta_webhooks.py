import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import PlainTextResponse

from app.api.deps import DatabaseSession
from app.config import settings
from app.core.request_context import get_request_id
from app.services.chat.inbound import ChatInboundService
from app.services.chat.meta_parsers import instagram_webhook_shape
from app.services.chat.meta_signature import verify_meta_signature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks"])

_inbound_service = ChatInboundService()
MAX_META_WEBHOOK_BYTES = 256 * 1024


@router.get(
    "/meta",
    summary="Meta webhook verification",
    response_class=PlainTextResponse,
)
def verify_meta_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
) -> Response:
    expected = (
        settings.meta_webhook_verify_token.get_secret_value()
        if settings.meta_webhook_verify_token is not None
        else None
    )
    if hub_mode == "subscribe" and expected and hub_verify_token == expected and hub_challenge:
        return PlainTextResponse(content=hub_challenge)
    logger.warning(
        "meta webhook verify rejected mode=%s token_configured=%s request_id=%s",
        hub_mode,
        bool(expected),
        get_request_id(),
    )
    raise HTTPException(status_code=403, detail={"message": "Verification failed."})


@router.post("/meta", summary="Meta webhook events")
async def receive_meta_webhook(request: Request, database: DatabaseSession) -> dict[str, bool]:
    body = await request.body()
    if len(body) > MAX_META_WEBHOOK_BYTES:
        logger.warning(
            "meta webhook rejected: payload too large bytes=%s request_id=%s",
            len(body),
            get_request_id(),
        )
        raise HTTPException(status_code=413, detail={"message": "Webhook payload too large."})

    app_secret = (
        settings.meta_app_secret.get_secret_value()
        if settings.meta_app_secret is not None
        else None
    )
    instagram_secret = (
        settings.meta_instagram_app_secret.get_secret_value()
        if settings.meta_instagram_app_secret is not None
        else None
    )
    secrets = [value for value in (app_secret, instagram_secret) if value]
    if not secrets:
        logger.warning(
            "meta webhook rejected: META_APP_SECRET is not configured request_id=%s",
            get_request_id(),
        )
        raise HTTPException(
            status_code=403,
            detail={"message": "Webhook signature not configured."},
        )

    signature = request.headers.get("X-Hub-Signature-256")
    if not any(verify_meta_signature(body, signature, secret) for secret in secrets):
        logger.warning(
            "meta webhook rejected: invalid signature bytes=%s "
            "ig_secret_configured=%s request_id=%s",
            len(body),
            bool(instagram_secret),
            get_request_id(),
        )
        raise HTTPException(status_code=403, detail={"message": "Invalid signature."})

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        logger.warning("meta webhook rejected: invalid json request_id=%s", get_request_id())
        raise HTTPException(status_code=400, detail={"message": "Invalid JSON payload."}) from None
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail={"message": "Webhook payload must be an object."},
        )

    object_type = payload.get("object")
    try:
        ingested = _inbound_service.ingest_webhook_payload(database, payload)
        database.commit()
    except Exception:
        database.rollback()
        logger.exception(
            "meta webhook ingest failed object=%s request_id=%s",
            object_type,
            get_request_id(),
        )
        raise

    shape = ""
    if ingested == 0 and object_type in {"instagram", "page"}:
        shape = f" shape={instagram_webhook_shape(payload)}"
    logger.info(
        "meta webhook processed object=%s ingested_messages=%s%s request_id=%s",
        object_type,
        ingested,
        shape,
        get_request_id(),
    )
    return {"success": True}
