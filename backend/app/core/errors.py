from __future__ import annotations

import logging
from typing import Any, NoReturn

from fastapi import HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.cors import apply_cors_headers
from app.services.errors import (
    ApplicationError,
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    InvalidOperationError,
    ResourceNotFoundError,
    ServiceUnavailableError,
)

logger = logging.getLogger(__name__)

_LOCATION_PREFIXES = frozenset({"body", "query", "path", "header", "cookie"})


def raise_api_error(
    status_code: int,
    message: str,
    parameter: str | None = None,
    **extra: Any,
) -> NoReturn:
    detail: dict[str, Any] = {"message": message, "parameter": parameter}
    detail.update(extra)
    raise HTTPException(status_code=status_code, detail=detail)


def parameter_from_validation_location(location: tuple[Any, ...]) -> str | None:
    parts: list[str] = []
    for segment in location:
        if isinstance(segment, str):
            if segment not in _LOCATION_PREFIXES:
                parts.append(segment)
        elif isinstance(segment, int):
            if parts:
                parts[-1] = f"{parts[-1]}[{segment}]"
            else:
                parts.append(f"[{segment}]")
    return ".".join(parts) or None


def friendly_validation_message(error: dict[str, Any]) -> str:
    error_type = error.get("type")
    if error_type == "missing":
        return "Este campo es obligatorio."
    if error_type in {"string_type", "int_type", "bool_type", "float_type"}:
        return "Tipo de valor incorrecto para este campo."
    if error_type == "string_too_short":
        return "El texto es demasiado corto."
    if error_type == "string_too_long":
        return "El texto es demasiado largo."
    if error_type == "int_parsing":
        return "Debe ser un numero entero."
    if error_type == "float_parsing":
        return "Debe ser un numero."
    if error_type == "bool_parsing":
        return "Debe ser verdadero o falso."
    message = error.get("msg")
    return str(message) if message else "Solicitud invalida."


async def http_exception_handler(
    _request: Request,
    exc: Exception,
) -> JSONResponse:
    if not isinstance(exc, StarletteHTTPException):
        raise TypeError("Expected an HTTPException.")
    detail: Any = exc.detail
    if isinstance(detail, dict):
        body = jsonable_encoder(detail)
        body.setdefault("message", str(exc.status_code))
        body.setdefault("parameter", None)
    else:
        body = {"message": str(detail), "parameter": None}
    return JSONResponse(status_code=exc.status_code, content=body)


async def request_validation_exception_handler(
    _request: Request,
    exc: Exception,
) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        raise TypeError("Expected a RequestValidationError.")
    errors = exc.errors()
    first_error = errors[0] if errors else {}
    location = tuple(first_error.get("loc") or ())
    return JSONResponse(
        status_code=400,
        content={
            "message": friendly_validation_message(first_error),
            "parameter": parameter_from_validation_location(location),
        },
    )


async def application_exception_handler(
    _request: Request,
    exc: Exception,
) -> JSONResponse:
    if not isinstance(exc, ApplicationError):
        raise TypeError("Expected an ApplicationError.")
    status_code = 500
    headers: dict[str, str] | None = None
    if isinstance(exc, AuthenticationError):
        status_code = 401
        headers = {"WWW-Authenticate": "Bearer"}
    elif isinstance(exc, AuthorizationError):
        status_code = 403
    elif isinstance(exc, ResourceNotFoundError):
        status_code = 404
    elif isinstance(exc, ConflictError):
        status_code = 409
    elif isinstance(exc, InvalidOperationError):
        status_code = 400
    elif isinstance(exc, ServiceUnavailableError):
        status_code = 503
    return JSONResponse(
        status_code=status_code,
        content={"message": exc.message, "parameter": exc.parameter},
        headers=headers,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path, exc_info=exc)
    response = JSONResponse(
        status_code=500,
        content={"message": "Error interno del servidor.", "parameter": None},
    )
    apply_cors_headers(request, response)
    return response
