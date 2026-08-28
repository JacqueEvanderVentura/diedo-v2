"""HTTP middleware for request IDs and access logging."""

import logging
import re
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.request_context import (
    get_request_id,
    reset_request_id,
    set_request_id,
)

logger = logging.getLogger("erp.http")

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def valid_request_id(value: str) -> bool:
    return bool(_REQUEST_ID_PATTERN.fullmatch(value))


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Propagate a safe incoming request ID or generate a new one."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        incoming = (
            request.headers.get("x-request-id") or request.headers.get("x-correlation-id") or ""
        ).strip()
        request_id = incoming if valid_request_id(incoming) else str(uuid.uuid4())
        token = set_request_id(request_id)
        try:
            response = await call_next(request)
            response.headers["X-Request-Id"] = request_id
            return response
        finally:
            reset_request_id(token)


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Log request metadata without bodies, credentials, or query strings."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.info(
                "http_request method=%s path=%s status=%s duration_ms=%s request_id=%s",
                request.method,
                request.url.path,
                status_code,
                duration_ms,
                get_request_id(),
            )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Apply browser-safe API defaults without assuming TLS termination details."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=()"
        )
        return response
