"""Terminate other Postgres backends on disposable local test databases."""

from __future__ import annotations

import os
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

_DISPOSABLE_DATABASES = frozenset({"erp_test", "erp_booking_test"})


def release_backends(database_url: str) -> tuple[int, int]:
    database_name = make_url(database_url).database
    if database_name not in _DISPOSABLE_DATABASES:
        return 0, 0
    engine = create_engine(database_url, pool_pre_ping=True)
    with engine.connect() as connection:
        blocked = connection.execute(
            text(
                """
                SELECT count(*)::int
                FROM pg_stat_activity
                WHERE datname = current_database()
                  AND pid <> pg_backend_pid()
                """
            )
        ).scalar_one()
        terminated = connection.execute(
            text(
                """
                SELECT count(*)::int
                FROM (
                    SELECT pg_terminate_backend(pid) AS terminated
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                      AND pid <> pg_backend_pid()
                ) AS terminations
                WHERE terminated IS TRUE
                """
            )
        ).scalar_one()
        connection.commit()
    engine.dispose()
    return int(blocked or 0), int(terminated or 0)


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL no está definida.", file=sys.stderr)
        sys.exit(1)
    blocked, terminated = release_backends(database_url)
    if terminated:
        print(
            f"release_test_database_backends: terminadas {terminated} conexión(es) "
            f"en {make_url(database_url).database!r}."
        )
    elif blocked:
        print(
            f"release_test_database_backends: {blocked} conexión(es) en "
            f"{make_url(database_url).database!r}, ninguna terminada."
        )


if __name__ == "__main__":
    main()
