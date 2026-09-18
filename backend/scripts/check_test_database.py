"""Fail fast when validate:migrations cannot reach the CI test database."""

from __future__ import annotations

import os
import sys

from sqlalchemy import create_engine, text


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL no está definida.", file=sys.stderr)
        sys.exit(1)
    try:
        engine = create_engine(url, connect_args={"connect_timeout": 5})
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        print(
            "No se pudo conectar a Postgres para validate:migrations.\n"
            f"  DATABASE_URL={url}\n"
            "  Local (docker-compose): desde backend ejecuta\n"
            "    docker compose up postgres_test -d\n"
            "  (puerto 5434, DB erp_test, usuario/clave erp).\n"
            "  O exporta DATABASE_URL (CI usa localhost:5432).\n"
            f"  Detalle: {exc}",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
