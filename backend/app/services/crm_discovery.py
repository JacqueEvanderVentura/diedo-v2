from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import CrmDiscoveryUsage
from app.services.crm_scoring import SERP_HOUR_LIMIT, SERP_MONTH_LIMIT
from app.services.errors import RateLimitExceededError, ServiceUnavailableError

ProviderName = Literal["serpapi", "serper"]
DiscoveryStatus = Literal["not_configured", "ready", "quota_exhausted"]


@dataclass(frozen=True, slots=True)
class LeadDiscoveryCapabilities:
    enabled: bool
    provider: ProviderName | None
    status: DiscoveryStatus
    hour_limit: int
    month_limit: int
    hour_used: int
    month_used: int
    available_providers: tuple[ProviderName, ...]


@dataclass(frozen=True, slots=True)
class LeadDiscoveryQuery:
    query: str
    location: str | None
    limit: int


@dataclass(frozen=True, slots=True)
class LeadDiscoveryCandidate:
    name: str
    company: str | None
    phone: str | None
    website: str | None
    location: str | None
    source_url: str | None
    raw_snippet: str | None
    rating: float | None = None
    reviews: int | None = None


@dataclass(frozen=True, slots=True)
class LeadDiscoveryResult:
    provider: ProviderName
    items: tuple[LeadDiscoveryCandidate, ...]
    hour_used: int
    month_used: int
    hour_limit: int = SERP_HOUR_LIMIT
    month_limit: int = SERP_MONTH_LIMIT


class LeadDiscoveryProvider(Protocol):
    name: ProviderName

    def configured(self) -> bool: ...

    def search(self, query: LeadDiscoveryQuery) -> tuple[LeadDiscoveryCandidate, ...]: ...


def _month_key(now: datetime) -> str:
    return f"{now.year:04d}-{now.month:02d}"


def _safe_text(value: Any, *, max_length: int | None = None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(str(value).split())
    if not normalized:
        return None
    if max_length is not None:
        return normalized[:max_length]
    return normalized


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except TypeError, ValueError:
        return None


def _integer(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except TypeError, ValueError:
        return None


def _joined_snippet(*values: Any) -> str | None:
    return _safe_text(" · ".join(str(value) for value in values if value), max_length=4000)


class JsonHttpClient:
    def __init__(self, timeout_seconds: int) -> None:
        self.timeout_seconds = timeout_seconds

    def get_json(self, url: str, *, headers: dict[str, str] | None = None) -> dict[str, Any]:
        request = Request(url, headers=headers or {}, method="GET")
        return self._read_json(request)

    def post_json(
        self,
        url: str,
        *,
        body: dict[str, Any],
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        payload = json.dumps(body).encode("utf-8")
        request_headers = {"Content-Type": "application/json", **(headers or {})}
        request = Request(url, data=payload, headers=request_headers, method="POST")
        return self._read_json(request)

    def _read_json(self, request: Request) -> dict[str, Any]:
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                payload = response.read()
        except (HTTPError, URLError, TimeoutError) as exc:
            raise ServiceUnavailableError(
                "El proveedor de busqueda de leads no respondio correctamente.",
                parameter="provider",
            ) from exc
        try:
            parsed = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ServiceUnavailableError(
                "El proveedor de busqueda de leads devolvio una respuesta invalida.",
                parameter="provider",
            ) from exc
        if not isinstance(parsed, dict):
            raise ServiceUnavailableError(
                "El proveedor de busqueda de leads devolvio una respuesta invalida.",
                parameter="provider",
            )
        return parsed


class SerpApiProvider:
    name: ProviderName = "serpapi"

    def __init__(self, api_key: str | None, http_client: JsonHttpClient) -> None:
        self._api_key = api_key
        self._http_client = http_client

    def configured(self) -> bool:
        return bool(self._api_key)

    def search(self, query: LeadDiscoveryQuery) -> tuple[LeadDiscoveryCandidate, ...]:
        if not self._api_key:
            raise ServiceUnavailableError(
                "SerpAPI no esta configurado para busqueda de leads.",
                parameter="provider",
            )
        search_text = f"{query.query} {query.location}".strip() if query.location else query.query
        params = urlencode(
            {
                "engine": "google_maps",
                "type": "search",
                "q": search_text,
                "hl": "es",
                "num": str(query.limit),
                "api_key": self._api_key,
            }
        )
        data = self._http_client.get_json(f"https://serpapi.com/search.json?{params}")
        if data.get("error"):
            raise ServiceUnavailableError(str(data["error"]), parameter="provider")
        rows = data.get("local_results")
        if not isinstance(rows, list):
            rows = [data["place_results"]] if isinstance(data.get("place_results"), dict) else []
        return tuple(
            _candidate_from_serpapi(row) for row in rows[: query.limit] if isinstance(row, dict)
        )


class SerperProvider:
    name: ProviderName = "serper"

    def __init__(self, api_key: str | None, http_client: JsonHttpClient) -> None:
        self._api_key = api_key
        self._http_client = http_client

    def configured(self) -> bool:
        return bool(self._api_key)

    def search(self, query: LeadDiscoveryQuery) -> tuple[LeadDiscoveryCandidate, ...]:
        if not self._api_key:
            raise ServiceUnavailableError(
                "Serper no esta configurado para busqueda de leads.",
                parameter="provider",
            )
        search_text = f"{query.query} {query.location}".strip() if query.location else query.query
        data = self._http_client.post_json(
            "https://google.serper.dev/places",
            body={"q": search_text, "num": query.limit},
            headers={"X-API-KEY": self._api_key},
        )
        rows = data.get("places")
        if not isinstance(rows, list):
            rows = []
        return tuple(
            _candidate_from_serper(row) for row in rows[: query.limit] if isinstance(row, dict)
        )


def _candidate_from_serpapi(item: dict[str, Any]) -> LeadDiscoveryCandidate:
    name = _safe_text(item.get("title") or item.get("name"), max_length=200) or "Sin nombre"
    return LeadDiscoveryCandidate(
        name=name,
        company=_safe_text(item.get("title") or item.get("name"), max_length=200) or name,
        phone=_safe_text(item.get("phone") or item.get("phone_number"), max_length=40),
        website=_safe_text(item.get("website") or item.get("link"), max_length=500),
        location=_safe_text(item.get("address") or item.get("location"), max_length=240),
        source_url=_safe_text(item.get("link") or item.get("place_id_link"), max_length=1000),
        raw_snippet=_joined_snippet(item.get("type"), item.get("description"), item.get("snippet")),
        rating=_number(item.get("rating")),
        reviews=_integer(item.get("reviews") or item.get("review_count")),
    )


def _candidate_from_serper(item: dict[str, Any]) -> LeadDiscoveryCandidate:
    name = _safe_text(item.get("title"), max_length=200) or "Sin nombre"
    return LeadDiscoveryCandidate(
        name=name,
        company=_safe_text(item.get("title"), max_length=200) or name,
        phone=_safe_text(item.get("phoneNumber") or item.get("phone"), max_length=40),
        website=_safe_text(item.get("website") or item.get("link"), max_length=500),
        location=_safe_text(item.get("address"), max_length=240),
        source_url=_safe_text(item.get("link") or item.get("cid"), max_length=1000),
        raw_snippet=_joined_snippet(item.get("category"), item.get("description")),
        rating=_number(item.get("rating")),
        reviews=_integer(item.get("ratingCount")),
    )


class CrmDiscoveryService:
    def __init__(
        self,
        session: Session,
        *,
        providers: tuple[LeadDiscoveryProvider, ...] | None = None,
    ) -> None:
        self._session = session
        self._providers = providers or self._configured_providers()

    def capabilities(self, workspace_id: UUID) -> LeadDiscoveryCapabilities:
        now = datetime.now(UTC)
        usage = self._usage_snapshot(workspace_id, now)
        providers = self._available_providers()
        quota_exhausted = (
            usage.hour_count >= SERP_HOUR_LIMIT or usage.month_count >= SERP_MONTH_LIMIT
        )
        if not providers:
            status: DiscoveryStatus = "not_configured"
        elif quota_exhausted:
            status = "quota_exhausted"
        else:
            status = "ready"
        return LeadDiscoveryCapabilities(
            enabled=bool(providers) and not quota_exhausted,
            provider=providers[0].name if providers else None,
            status=status,
            hour_limit=SERP_HOUR_LIMIT,
            month_limit=SERP_MONTH_LIMIT,
            hour_used=usage.hour_count,
            month_used=usage.month_count,
            available_providers=tuple(provider.name for provider in providers),
        )

    def search(self, workspace_id: UUID, query: LeadDiscoveryQuery) -> LeadDiscoveryResult:
        providers = self._available_providers()
        if not providers:
            raise ServiceUnavailableError(
                "La busqueda de leads por SERP no esta configurada.",
                parameter="provider",
            )

        usage = self._reserve_quota(workspace_id, datetime.now(UTC))
        last_error: ServiceUnavailableError | None = None
        for provider in providers:
            try:
                items = provider.search(query)
                usage.last_provider = provider.name
                usage.last_status = "success"
                self._session.flush()
                return LeadDiscoveryResult(
                    provider=provider.name,
                    items=items,
                    hour_used=usage.hour_count,
                    month_used=usage.month_count,
                )
            except ServiceUnavailableError as exc:
                last_error = exc
                usage.last_provider = provider.name
                usage.last_status = "provider_error"
                self._session.flush()
        raise last_error or ServiceUnavailableError(
            "No hay proveedores de busqueda de leads disponibles.",
            parameter="provider",
        )

    def _configured_providers(self) -> tuple[LeadDiscoveryProvider, ...]:
        http_client = JsonHttpClient(settings.crm_discovery_timeout_seconds)
        serpapi_key = (
            settings.serpapi_api_key.get_secret_value() if settings.serpapi_api_key else None
        )
        serper_key = settings.serper_api_key.get_secret_value() if settings.serper_api_key else None
        return (
            SerpApiProvider(serpapi_key, http_client),
            SerperProvider(serper_key, http_client),
        )

    def _available_providers(self) -> tuple[LeadDiscoveryProvider, ...]:
        return tuple(provider for provider in self._providers if provider.configured())

    def _usage_snapshot(self, workspace_id: UUID, now: datetime) -> CrmDiscoveryUsage:
        usage = self._ensure_usage(workspace_id, now, lock=False)
        self._reset_windows(usage, now)
        self._session.flush()
        return usage

    def _reserve_quota(self, workspace_id: UUID, now: datetime) -> CrmDiscoveryUsage:
        usage = self._ensure_usage(workspace_id, now, lock=True)
        self._reset_windows(usage, now)
        if usage.hour_count >= SERP_HOUR_LIMIT:
            raise RateLimitExceededError(
                "Limite horario de busqueda de leads alcanzado.",
                parameter="hourLimit",
            )
        if usage.month_count >= SERP_MONTH_LIMIT:
            raise RateLimitExceededError(
                "Limite mensual de busqueda de leads alcanzado.",
                parameter="monthLimit",
            )
        usage.hour_count += 1
        usage.month_count += 1
        usage.last_status = "reserved"
        self._session.flush()
        return usage

    def _ensure_usage(self, workspace_id: UUID, now: datetime, *, lock: bool) -> CrmDiscoveryUsage:
        month = _month_key(now)
        self._session.execute(
            insert(CrmDiscoveryUsage)
            .values(
                workspace_id=workspace_id,
                hour_window_start=now,
                hour_count=0,
                month_key=month,
                month_count=0,
            )
            .on_conflict_do_nothing(index_elements=[CrmDiscoveryUsage.workspace_id])
        )
        query = select(CrmDiscoveryUsage).where(CrmDiscoveryUsage.workspace_id == workspace_id)
        if lock:
            query = query.with_for_update()
        usage = self._session.scalar(query)
        if usage is None:
            raise ServiceUnavailableError(
                "No se pudo preparar la cuota de busqueda de leads.",
                parameter="quota",
            )
        return usage

    @staticmethod
    def _reset_windows(usage: CrmDiscoveryUsage, now: datetime) -> None:
        if usage.hour_window_start <= now - timedelta(hours=1):
            usage.hour_window_start = now
            usage.hour_count = 0
        month = _month_key(now)
        if usage.month_key != month:
            usage.month_key = month
            usage.month_count = 0
