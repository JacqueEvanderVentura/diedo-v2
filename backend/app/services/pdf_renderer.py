from __future__ import annotations

import logging
from typing import Any, Protocol, cast

from app.config import settings
from app.services.errors import InvalidOperationError

logger = logging.getLogger(__name__)

_STUB_PDF = b"%PDF-1.4\n% Helios invoice stub\n"


class PdfRenderer(Protocol):
    def render_html(self, html: str) -> bytes: ...

    def start(self) -> None: ...

    def stop(self) -> None: ...


class StubPdfRenderer:
    def start(self) -> None:
        return None

    def stop(self) -> None:
        return None

    def render_html(self, html: str) -> bytes:
        del html
        return _STUB_PDF


class PlaywrightPdfRenderer:
    def __init__(self) -> None:
        self._playwright: Any | None = None
        self._browser: Any | None = None

    def start(self) -> None:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:
            raise InvalidOperationError(
                "El generador de PDF no está disponible en este entorno.",
                "invoicePdf",
            ) from exc
        self._playwright = sync_playwright().start()
        browser_type = getattr(self._playwright, "chromium")
        self._browser = browser_type.launch(headless=True)

    def stop(self) -> None:
        if self._browser is not None:
            close = getattr(self._browser, "close", None)
            if callable(close):
                close()
            self._browser = None
        if self._playwright is not None:
            stop = getattr(self._playwright, "stop", None)
            if callable(stop):
                stop()
            self._playwright = None

    def render_html(self, html: str) -> bytes:
        if self._browser is None:
            raise InvalidOperationError(
                "El generador de PDF no está inicializado.",
                "invoicePdf",
            )
        browser = cast(Any, self._browser)
        page = browser.new_page()
        try:
            page.set_content(html, wait_until="networkidle")
            pdf_bytes: bytes = page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "8mm", "right": "8mm", "bottom": "10mm", "left": "8mm"},
            )
            return pdf_bytes
        finally:
            page.close()


_renderer: PdfRenderer | None = None


def create_pdf_renderer() -> PdfRenderer:
    mode = settings.invoice_pdf_renderer
    if mode == "stub" or (mode == "auto" and settings.app_env == "test"):
        return StubPdfRenderer()
    return PlaywrightPdfRenderer()


def get_pdf_renderer() -> PdfRenderer:
    global _renderer
    if _renderer is None:
        _renderer = create_pdf_renderer()
        _renderer.start()
    return _renderer


def shutdown_pdf_renderer() -> None:
    global _renderer
    if _renderer is not None:
        try:
            _renderer.stop()
        except Exception:
            logger.exception("Failed to shut down PDF renderer")
        _renderer = None


def set_pdf_renderer(renderer: PdfRenderer | None) -> None:
    global _renderer
    if _renderer is not None:
        _renderer.stop()
    _renderer = renderer
    if _renderer is not None:
        _renderer.start()
