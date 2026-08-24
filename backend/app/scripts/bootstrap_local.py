import json
from dataclasses import asdict

from app.config import settings
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.local_bootstrap import bootstrap_local_foundation


def main() -> None:
    if settings.app_env not in {"development", "test"}:
        raise RuntimeError("Local bootstrap is disabled outside development and test.")

    with session_scope() as session:
        configured_password = settings.local_bootstrap_admin_password
        password_hash = (
            hash_password(configured_password.get_secret_value())
            if configured_password is not None
            else None
        )
        summary = bootstrap_local_foundation(session, password_hash)

    print(json.dumps(asdict(summary), default=str, indent=2))


if __name__ == "__main__":
    main()
