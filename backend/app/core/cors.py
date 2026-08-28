from starlette.requests import Request
from starlette.responses import Response

from app.config import settings


def normalize_origin(origin: str) -> str:
    return origin.strip().rstrip("/")


def parse_cors_origins(raw: str | None) -> list[str]:
    if not raw:
        return []

    origins: list[str] = []
    seen: set[str] = set()
    for value in raw.split(","):
        origin = normalize_origin(value)
        if origin and origin not in seen:
            seen.add(origin)
            origins.append(origin)
    return origins


def origin_allowed_for_cors(origin: str | None) -> bool:
    if not origin:
        return False
    return normalize_origin(origin) in parse_cors_origins(settings.cors_origins)


def apply_cors_headers(request: Request, response: Response) -> None:
    """Attach CORS headers to error responses outside normal middleware handling."""
    origin = request.headers.get("origin")
    if not origin_allowed_for_cors(origin):
        return

    response.headers["Access-Control-Allow-Origin"] = origin or ""
    response.headers["Access-Control-Allow-Credentials"] = "true"
    vary = response.headers.get("Vary")
    if not vary:
        response.headers["Vary"] = "Origin"
    elif "Origin" not in {part.strip() for part in vary.split(",")}:
        response.headers["Vary"] = f"{vary}, Origin"
