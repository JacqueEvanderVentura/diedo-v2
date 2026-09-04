import json
from dataclasses import asdict

from pydantic import SecretStr

from app.config import Settings, settings
from app.core.security import hash_password
from app.db.session import session_scope
from app.services.demo_seed import seed_demo_data


def resolve_demo_password(config: Settings) -> SecretStr | None:
    if not config.demo_seed_enabled:
        return None
    if config.app_env == "production":
        if not config.allow_production_demo_seed:
            raise RuntimeError("Production demo seeding requires ALLOW_PRODUCTION_DEMO_SEED=true.")
        if config.demo_admin_password is None:
            raise RuntimeError("Set DEMO_ADMIN_PASSWORD before seeding production demo users.")
        return config.demo_admin_password
    if config.app_env == "staging":
        raise RuntimeError("Demo seeding is disabled in staging.")
    configured_password = config.demo_admin_password or config.local_bootstrap_admin_password
    if configured_password is None:
        raise RuntimeError(
            "Set DEMO_ADMIN_PASSWORD or LOCAL_BOOTSTRAP_ADMIN_PASSWORD before seeding demo users."
        )
    return configured_password


def main() -> None:
    configured_password = resolve_demo_password(settings)
    if configured_password is None:
        print(json.dumps({"status": "skipped", "reason": "demo_seed_disabled"}))
        return
    password_hash = hash_password(configured_password.get_secret_value())
    with session_scope() as session:
        summary = seed_demo_data(session, password_hash)
    print(json.dumps(asdict(summary), default=str, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
