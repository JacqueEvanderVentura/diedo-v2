import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router
from app.config import settings
from app.core.cors import parse_cors_origins
from app.core.errors import (
    http_exception_handler,
    request_validation_exception_handler,
    unhandled_exception_handler,
)
from app.core.middleware import AccessLogMiddleware, CorrelationIdMiddleware
from app.db.session import dispose_engine

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    dispose_engine()


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.project_name,
        version=settings.api_version,
        lifespan=lifespan,
        docs_url="/swagger/index.html" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/swagger.json" if settings.docs_enabled else None,
    )

    application.add_exception_handler(StarletteHTTPException, http_exception_handler)
    application.add_exception_handler(RequestValidationError, request_validation_exception_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)

    origins = parse_cors_origins(settings.cors_origins)
    if origins:
        application.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    application.add_middleware(AccessLogMiddleware)
    application.add_middleware(CorrelationIdMiddleware)
    application.include_router(api_router)

    if settings.docs_enabled:

        @application.get("/swagger", include_in_schema=False)
        def swagger_redirect() -> RedirectResponse:
            return RedirectResponse(url="/swagger/index.html")

        @application.get("/docs", include_in_schema=False)
        def docs_redirect() -> RedirectResponse:
            return RedirectResponse(url="/swagger/index.html")

    return application


app = create_app()
