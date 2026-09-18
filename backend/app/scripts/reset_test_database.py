"""Recreate the disposable integration database schema (empty DB + migrations, like CI)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

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


def reset_test_database(database_url: str) -> None:
    _assert_disposable_database(database_url)
    release_backends(database_url)
    _run_alembic("downgrade", "base")
    _run_alembic("upgrade", "head")


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL no está definida.", file=sys.stderr)
        sys.exit(1)
    reset_test_database(database_url)
    print(f"reset_test_database: esquema recreado en {make_url(database_url).database!r}.")


if __name__ == "__main__":
    main()
