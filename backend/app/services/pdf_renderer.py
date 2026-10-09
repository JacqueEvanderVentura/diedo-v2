from __future__ import annotations

import base64
import binascii
import logging
import os
import platform
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Protocol

from app.config import settings
from app.services.errors import InvalidOperationError, ServiceUnavailableError

logger = logging.getLogger(__name__)

_STUB_PDF = b"%PDF-1.4\n% Helios invoice stub\n"
_CHROMIUM_RENDER_TIMEOUT_SECONDS = 30
_MIN_VALID_PDF_BYTES = 200
_DATA_IMAGE_SRC_RE = re.compile(
    r'src=(["\'])(data:image/([^"\';]+);base64,([^"\']+))(["\'])',
    re.IGNORECASE,
)


def materialize_data_url_images(html: str, work_dir: Path) -> str:
    """Rewrite inline data: image sources to files (reliable for Chromium file:// print)."""
    counter = 0

    def extension_for_mime(mime: str) -> str:
        normalized = mime.lower()
        if normalized in {"jpeg", "jpg"}:
            return "jpg"
        if normalized in {"png", "gif", "webp"}:
            return normalized
        if normalized == "svg+xml":
            return "svg"
        return "png"

    def replace(match: re.Match[str]) -> str:
        nonlocal counter
        counter += 1
        quote = match.group(1)
        mime = match.group(3)
        payload = match.group(4)
        try:
            raw = base64.b64decode(payload, validate=False)
        except ValueError, binascii.Error:
            return match.group(0)
        filename = f"invoice-asset-{counter}.{extension_for_mime(mime)}"
        (work_dir / filename).write_bytes(raw)
        return f"src={quote}{filename}{quote}"

    return _DATA_IMAGE_SRC_RE.sub(replace, html)


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


class WeasyprintPdfRenderer:
    def start(self) -> None:
        try:
            import weasyprint  # noqa: F401
        except (ImportError, OSError) as exc:
            raise InvalidOperationError(
                "El generador de PDF no está disponible en este entorno.",
                "invoicePdf",
            ) from exc

    def stop(self) -> None:
        return None

    def render_html(self, html: str) -> bytes:
        try:
            from weasyprint import HTML
        except (ImportError, OSError) as exc:
            raise InvalidOperationError(
                "El generador de PDF no está disponible en este entorno.",
                "invoicePdf",
            ) from exc
        pdf_bytes: bytes = HTML(string=html).write_pdf()
        return pdf_bytes


def find_chromium_executable() -> Path | None:
    configured = (settings.invoice_pdf_chrome or "").strip()
    if configured:
        path = Path(configured)
        if path.is_file():
            return path
    for name in ("msedge", "chrome", "chromium", "google-chrome"):
        found = shutil.which(name)
        if found:
            return Path(found)
    if platform.system() == "Windows":
        program_files = os.environ.get("PROGRAMFILES", "")
        program_files_x86 = os.environ.get("PROGRAMFILES(X86)", "")
        candidates = [
            Path(program_files) / "Google/Chrome/Application/chrome.exe",
            Path(program_files_x86) / "Google/Chrome/Application/chrome.exe",
            Path(program_files) / "Microsoft/Edge/Application/msedge.exe",
            Path(program_files_x86) / "Microsoft/Edge/Application/msedge.exe",
        ]
        for path in candidates:
            if path.is_file():
                return path
    return None


def validate_pdf_bytes(pdf_bytes: bytes) -> None:
    if len(pdf_bytes) < _MIN_VALID_PDF_BYTES:
        raise ServiceUnavailableError(
            "El generador de PDF no produjo un documento válido.",
            "invoicePdf",
        )
    if not pdf_bytes.startswith(b"%PDF") or b"%%EOF" not in pdf_bytes:
        raise ServiceUnavailableError(
            "El generador de PDF no produjo un documento válido.",
            "invoicePdf",
        )


class ChromiumPdfRenderer:
    def __init__(self) -> None:
        self._executable: Path | None = None

    def start(self) -> None:
        executable = find_chromium_executable()
        if executable is None:
            raise ServiceUnavailableError(
                "No se encontró Chrome ni Edge para generar PDF.",
                "invoicePdf",
            )
        self._executable = executable

    def stop(self) -> None:
        return None

    def render_html(self, html: str) -> bytes:
        if self._executable is None:
            raise ServiceUnavailableError(
                "El generador de PDF no está disponible en este entorno.",
                "invoicePdf",
            )
        with tempfile.TemporaryDirectory(prefix="helios-pdf-") as work_dir:
            work_path = Path(work_dir)
            html_path = work_path / "document.html"
            pdf_path = work_path / "document.pdf"
            profile_dir = work_path / "profile"
            profile_dir.mkdir()
            html_path.write_text(materialize_data_url_images(html, work_path), encoding="utf-8")
            html_uri = html_path.resolve().as_uri()
            command = [
                str(self._executable),
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                f"--user-data-dir={profile_dir}",
                f"--print-to-pdf={pdf_path}",
                html_uri,
            ]
            try:
                completed = subprocess.run(
                    command,
                    capture_output=True,
                    timeout=_CHROMIUM_RENDER_TIMEOUT_SECONDS,
                    check=False,
                )
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise ServiceUnavailableError(
                    "El generador de PDF no está disponible en este entorno.",
                    "invoicePdf",
                ) from exc
            if completed.returncode != 0 or not pdf_path.is_file():
                stderr = (completed.stderr or b"").decode("utf-8", errors="replace")[:500]
                logger.warning(
                    "Chromium PDF render failed (code=%s): %s",
                    completed.returncode,
                    stderr,
                )
                raise ServiceUnavailableError(
                    "El generador de PDF no está disponible en este entorno.",
                    "invoicePdf",
                )
            pdf_bytes = pdf_path.read_bytes()
            validate_pdf_bytes(pdf_bytes)
            return pdf_bytes


_renderer: PdfRenderer | None = None


def _pdf_unavailable_error(cause: Exception | None = None) -> ServiceUnavailableError:
    message = "El generador de PDF no está disponible en este entorno."
    if cause is None:
        return ServiceUnavailableError(message, "invoicePdf")
    return ServiceUnavailableError(message, "invoicePdf")


def _start_weasyprint_renderer() -> WeasyprintPdfRenderer:
    renderer = WeasyprintPdfRenderer()
    renderer.start()
    return renderer


def _start_chromium_renderer() -> ChromiumPdfRenderer:
    renderer = ChromiumPdfRenderer()
    renderer.start()
    return renderer


def create_pdf_renderer() -> PdfRenderer:
    mode = settings.invoice_pdf_renderer
    if mode == "stub" or (mode == "auto" and settings.app_env == "test"):
        return StubPdfRenderer()
    if mode == "weasyprint":
        return WeasyprintPdfRenderer()
    return WeasyprintPdfRenderer()


def _resolve_auto_renderer() -> PdfRenderer:
    try:
        return _start_weasyprint_renderer()
    except Exception as exc:
        logger.warning("WeasyPrint PDF unavailable (%s); trying Chromium.", exc)
    try:
        return _start_chromium_renderer()
    except Exception as exc:
        logger.error("Chromium PDF unavailable (%s).", exc)
        raise _pdf_unavailable_error(exc) from exc


def get_pdf_renderer() -> PdfRenderer:
    global _renderer
    if _renderer is None:
        mode = settings.invoice_pdf_renderer
        renderer: PdfRenderer
        if mode == "stub" or (mode == "auto" and settings.app_env == "test"):
            renderer = StubPdfRenderer()
            renderer.start()
        elif mode == "auto":
            renderer = _resolve_auto_renderer()
        else:
            renderer = create_pdf_renderer()
            try:
                renderer.start()
            except InvalidOperationError as exc:
                raise _pdf_unavailable_error(exc) from exc
        _renderer = renderer
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
