import builtins
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from app.services.errors import InvalidOperationError, ServiceUnavailableError
from app.services.pdf_renderer import (
    ChromiumPdfRenderer,
    StubPdfRenderer,
    WeasyprintPdfRenderer,
    _resolve_auto_renderer,
    find_chromium_executable,
    get_pdf_renderer,
    materialize_data_url_images,
    shutdown_pdf_renderer,
    validate_pdf_bytes,
)


@pytest.fixture(autouse=True)
def reset_renderer() -> None:
    yield
    shutdown_pdf_renderer()


def _weasyprint_available() -> bool:
    try:
        import weasyprint  # noqa: F401
    except ImportError, OSError:
        return False
    return True


def test_weasyprint_renderer_rejects_missing_dependency() -> None:
    renderer = WeasyprintPdfRenderer()
    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "weasyprint":
            raise ImportError("forced")
        return real_import(name, globals, locals, fromlist, level)

    with patch("builtins.__import__", side_effect=fake_import):
        with pytest.raises(InvalidOperationError) as exc_info:
            renderer.start()
    assert exc_info.value.parameter == "invoicePdf"


def test_weasyprint_renderer_rejects_missing_native_libraries() -> None:
    renderer = WeasyprintPdfRenderer()
    real_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "weasyprint":
            raise OSError("libgobject missing")
        return real_import(name, globals, locals, fromlist, level)

    with patch("builtins.__import__", side_effect=fake_import):
        with pytest.raises(InvalidOperationError):
            renderer.start()


def test_materialize_data_url_images_writes_asset_file(tmp_path: Path) -> None:
    html = '<img src="data:image/png;base64,iVBORw0KGgo=" alt="" class="brand-logo" />'
    rewritten = materialize_data_url_images(html, tmp_path)
    assert "data:image/png" not in rewritten
    assert (tmp_path / "invoice-asset-1.png").is_file()


def test_validate_pdf_bytes_rejects_stub() -> None:
    stub = b"%PDF-1.4\n% Helios invoice stub\n"
    with pytest.raises(ServiceUnavailableError) as exc_info:
        validate_pdf_bytes(stub)
    assert exc_info.value.parameter == "invoicePdf"


def test_auto_falls_back_to_chromium_when_weasyprint_fails() -> None:
    chromium = MagicMock(spec=ChromiumPdfRenderer)
    with patch(
        "app.services.pdf_renderer._start_weasyprint_renderer",
        side_effect=OSError("gtk"),
    ):
        with patch(
            "app.services.pdf_renderer._start_chromium_renderer",
            return_value=chromium,
        ):
            assert _resolve_auto_renderer() is chromium


def test_auto_raises_when_both_renderers_fail() -> None:
    with patch(
        "app.services.pdf_renderer._start_weasyprint_renderer",
        side_effect=OSError("gtk"),
    ):
        with patch(
            "app.services.pdf_renderer._start_chromium_renderer",
            side_effect=ServiceUnavailableError("no chrome", "invoicePdf"),
        ):
            with pytest.raises(ServiceUnavailableError):
                _resolve_auto_renderer()


def test_get_pdf_renderer_auto_uses_chromium_not_stub_in_development(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.services.pdf_renderer.settings.invoice_pdf_renderer", "auto")
    monkeypatch.setattr("app.services.pdf_renderer.settings.app_env", "development")
    chromium = ChromiumPdfRenderer()
    with patch(
        "app.services.pdf_renderer._start_weasyprint_renderer",
        side_effect=OSError("gtk"),
    ):
        with patch(
            "app.services.pdf_renderer._start_chromium_renderer",
            return_value=chromium,
        ):
            renderer = get_pdf_renderer()
    assert isinstance(renderer, ChromiumPdfRenderer)
    assert not isinstance(renderer, StubPdfRenderer)


@pytest.mark.skipif(not _weasyprint_available(), reason="WeasyPrint not installed")
def test_weasyprint_renderer_produces_pdf_bytes() -> None:
    renderer = WeasyprintPdfRenderer()
    renderer.start()
    pdf = renderer.render_html(
        "<!doctype html><html><body><p>Helios invoice test</p></body></html>"
    )
    assert pdf.startswith(b"%PDF")


@pytest.mark.skipif(find_chromium_executable() is None, reason="Chrome/Edge not installed")
def test_chromium_renderer_produces_valid_pdf_bytes() -> None:
    renderer = ChromiumPdfRenderer()
    renderer.start()
    pdf = renderer.render_html(
        "<!doctype html><html><body><p>Helios invoice test</p></body></html>"
    )
    assert pdf.startswith(b"%PDF")
    assert b"%%EOF" in pdf
    validate_pdf_bytes(pdf)
