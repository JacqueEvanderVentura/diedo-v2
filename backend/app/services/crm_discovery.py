from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.services.crm_scoring import SERP_HOUR_LIMIT, SERP_MONTH_LIMIT
from app.services.errors import ServiceUnavailableError


@dataclass(frozen=True, slots=True)
class LeadDiscoveryCapabilities:
    enabled: bool
    provider: str
    status: str
    hour_limit: int
    month_limit: int


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


class LeadDiscoveryProvider(Protocol):
    """Port implemented by a server-side SERP provider adapter."""

    def capabilities(self) -> LeadDiscoveryCapabilities: ...

    def search(self, query: LeadDiscoveryQuery) -> list[LeadDiscoveryCandidate]: ...


class PlannedSerpApiProvider:
    """Safe placeholder until credentials, quotas, and the HTTP adapter are enabled."""

    def capabilities(self) -> LeadDiscoveryCapabilities:
        return LeadDiscoveryCapabilities(
            enabled=False,
            provider="serpapi",
            status="not_configured",
            hour_limit=SERP_HOUR_LIMIT,
            month_limit=SERP_MONTH_LIMIT,
        )

    def search(self, query: LeadDiscoveryQuery) -> list[LeadDiscoveryCandidate]:
        del query
        raise ServiceUnavailableError(
            "La búsqueda de leads por SERP todavía no está configurada.",
            parameter="provider",
        )


class CrmDiscoveryService:
    def __init__(self, provider: LeadDiscoveryProvider | None = None) -> None:
        self.provider = provider or PlannedSerpApiProvider()

    def capabilities(self) -> LeadDiscoveryCapabilities:
        return self.provider.capabilities()

    def search(self, query: LeadDiscoveryQuery) -> list[LeadDiscoveryCandidate]:
        return self.provider.search(query)
