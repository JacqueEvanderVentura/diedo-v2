"""Per-request context for correlation IDs."""

from contextvars import ContextVar, Token

_request_id: ContextVar[str] = ContextVar("request_id", default="")


def set_request_id(value: str) -> Token[str]:
    return _request_id.set(value)


def reset_request_id(token: Token[str]) -> None:
    _request_id.reset(token)


def get_request_id() -> str:
    return _request_id.get()
