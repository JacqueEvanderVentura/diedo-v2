"""Recreate the disposable integration database schema (empty DB + migrations, like CI)."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.scripts.release_test_database_backends import release_backends

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_DISPOSABLE_DATABASES = frozenset({"erp_test", "erp_booking_test"})


def _assert_disposable_database(database_url: str) -> None:
    if os.environ.get("APP_ENV") != "test":
        raise RuntimeError("reset_test_database requires APP_ENV=test.")
    url = make_url(database_url)
    if url.database not in _DISPOSABLE_DATABASES:
        raise RuntimeError(
            f"reset_test_database only supports {_DISPOSABLE_DATABASES!r}, not {url.database!r}."
        )
    if url.host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("reset_test_database only runs against localhost.")


def _run_alembic(*args: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=_BACKEND_ROOT,
        check=True,
    )


def _recreate_public_schema(database_url: str) -> None:
    """Wipe public schema without downgrade migrations (avoids long DDL deadlocks)."""
    engine = create_engine(database_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
        connection.execute(text("GRANT ALL ON SCHEMA public TO PUBLIC"))
        connection.execute(text("GRANT ALL ON SCHEMA public TO CURRENT_USER"))
    engine.dispose()


def _release_and_settle(database_url: str) -> None:
    release_backends(database_url)
    time.sleep(0.25)


def reset_test_database(database_url: str) -> None:
    _assert_disposable_database(database_url)
    last_error: subprocess.CalledProcessError | None = None
    for attempt in range(3):
        _release_and_settle(database_url)
        try:
            _recreate_public_schema(database_url)
            _run_alembic("upgrade", "head")
            return
        except subprocess.CalledProcessError as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(0.5 * (attempt + 1))
                continue
            raise
    if last_error is not None:
        raise last_error


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL no está definida.", file=sys.stderr)
        sys.exit(1)
    reset_test_database(database_url)
    print(f"reset_test_database: esquema recreado en {make_url(database_url).database!r}.")


if __name__ == "__main__":
    main()
