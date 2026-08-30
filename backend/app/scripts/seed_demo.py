import json
from dataclasses import asdict

from app.config import settings
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.demo_seed import seed_demo_data


def main() -> None:
    if settings.app_env not in {"development", "test"}:
        raise RuntimeError("Demo seeding is disabled outside development and test.")
    configured_password = settings.local_bootstrap_admin_password
    if settings.demo_seed_enabled and configured_password is None:
        raise RuntimeError("Set LOCAL_BOOTSTRAP_ADMIN_PASSWORD before seeding demo users.")
    password_hash = (
        hash_password(configured_password.get_secret_value())
        if configured_password is not None
        else None
    )
    with session_scope() as session:
        summary = seed_demo_data(session, password_hash)
    print(json.dumps(asdict(summary), default=str, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
