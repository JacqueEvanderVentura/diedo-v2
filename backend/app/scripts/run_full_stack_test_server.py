"""Prepare the disposable integration database and run the full-stack test API."""

import os
import subprocess
import sys

import uvicorn
from sqlalchemy.engine import make_url


def _assert_disposable_database() -> None:
    if os.environ.get("APP_ENV") != "test":
        raise RuntimeError("The full-stack server requires APP_ENV=test.")
    database_url = os.environ.get("DATABASE_URL", "")
    url = make_url(database_url)
    if url.host not in {"127.0.0.1", "localhost"} or url.port != 5434 or url.database != "erp_test":
        raise RuntimeError("The full-stack server may only recreate localhost:5434/erp_test.")


def _run_module(*args: str) -> None:
    subprocess.run([sys.executable, "-m", *args], check=True)


def main() -> None:
    _assert_disposable_database()
    _run_module("alembic", "downgrade", "base")
    _run_module("alembic", "upgrade", "head")
    _run_module("app.scripts.seed_demo")
    # Keep Uvicorn in this process. On Windows, os.execv can leave Playwright's
    # webServer parent waiting on a child that it cannot terminate at teardown.
    uvicorn.run("app.main:app", host="127.0.0.1", port=8200)


if __name__ == "__main__":
    main()
