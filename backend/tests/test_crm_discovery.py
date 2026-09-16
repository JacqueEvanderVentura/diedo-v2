import pytest
from app.services.crm_discovery import JsonHttpClient, SerpApiProvider, SerperProvider
from app.services.errors import ServiceUnavailableError


class _HttpClient:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.url: str | None = None
        self.body: dict | None = None
        self.headers: dict[str, str] | None = None

    def get_json(self, url: str, *, headers: dict[str, str] | None = None) -> dict:
        self.url = url
        self.headers = headers
        return self.payload

    def post_json(
        self,
        url: str,
        *,
        body: dict,
        headers: dict[str, str] | None = None,
    ) -> dict:
        self.url = url
        self.body = body
        self.headers = headers
        return self.payload


def test_serpapi_provider_normalizes_local_results() -> None:
    http = _HttpClient(
        {
            "local_results": [
                {
                    "title": " Spa Azul  ",
                    "phone": "809-555-0101",
                    "website": "https://spa.example.com",
                    "address": " Santo Domingo ",
                    "link": "https://maps.example.com/spa",
                    "type": "Spa",
                    "description": "Reservas online",
                    "rating": "4.8",
                    "reviews": "120",
                }
            ]
        }
    )
    provider = SerpApiProvider("serp-key", http)  # type: ignore[arg-type]

    items = provider.search(query=_query())

    assert http.url is not None
    assert "api_key=serp-key" in http.url
    assert items[0].name == "Spa Azul"
    assert items[0].location == "Santo Domingo"
    assert items[0].rating == 4.8
    assert items[0].reviews == 120


def test_serper_provider_normalizes_places_and_uses_header_key() -> None:
    http = _HttpClient(
        {
            "places": [
                {
                    "title": "Dental Sol",
                    "phoneNumber": "809-555-0202",
                    "website": "https://dental.example.com",
                    "address": "Santiago",
                    "cid": "place-cid",
                    "category": "Clinica dental",
                    "rating": 4.5,
                    "ratingCount": 80,
                }
            ]
        }
    )
    provider = SerperProvider("serper-key", http)  # type: ignore[arg-type]

    items = provider.search(query=_query())

    assert http.url == "https://google.serper.dev/places"
    assert http.headers == {"X-API-KEY": "serper-key"}
    assert http.body == {"q": "salones de belleza Santo Domingo", "num": 10}
    assert items[0].name == "Dental Sol"
    assert items[0].reviews == 80


def test_json_http_client_rejects_invalid_json(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Response:
        def __enter__(self) -> _Response:
            return self

        def __exit__(self, *args: object) -> None:
            return None

        def read(self) -> bytes:
            return b"not-json"

    monkeypatch.setattr("app.services.crm_discovery.urlopen", lambda *args, **kwargs: _Response())
    client = JsonHttpClient(timeout_seconds=1)

    with pytest.raises(ServiceUnavailableError):
        client.get_json("https://serpapi.com/search.json")


def _query():
    from app.services.crm_discovery import LeadDiscoveryQuery

    return LeadDiscoveryQuery("salones de belleza", "Santo Domingo", 10)
