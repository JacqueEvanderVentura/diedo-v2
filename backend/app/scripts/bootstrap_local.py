import json
from dataclasses import asdict

from app.config import settings
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation


def main() -> None:
    if settings.app_env not in {"development", "test"}:
        raise RuntimeError("Local bootstrap is disabled outside development and test.")

    with session_scope() as session:
        summary = bootstrap_local_foundation(session)

    print(json.dumps(asdict(summary), default=str, indent=2))


if __name__ == "__main__":
    main()
