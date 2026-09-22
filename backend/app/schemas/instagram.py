from pydantic import HttpUrl


def validate_instagram_url(value: HttpUrl | None) -> HttpUrl | None:
    if value is not None and value.host not in {"instagram.com", "www.instagram.com"}:
        raise ValueError("IG debe ser un enlace de instagram.com.")
    return value
