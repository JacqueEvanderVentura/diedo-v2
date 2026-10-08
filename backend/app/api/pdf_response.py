from fastapi.responses import Response


def pdf_inline_response(pdf_bytes: bytes, filename: str) -> Response:
    safe_name = (
        "".join(char for char in filename if char.isalnum() or char in "._-") or "document.pdf"
    )
    if not safe_name.endswith(".pdf"):
        safe_name = f"{safe_name}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )
