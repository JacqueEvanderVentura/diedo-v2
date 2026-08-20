# Agent instructions

Read the shared contract in [`docs/backend/GLOBAL.md`](docs/backend/GLOBAL.md) first for
backend, API, database, and cross-cutting work.

## Before finishing backend work

From `backend/`, run the same checks as CI:

```bash
python -m ruff check app tests --fix
python -m ruff format app tests
python -m ruff check app tests
python -m ruff format --check app tests
python -m mypy app
python -m pytest --cov=app --cov-report=term-missing --cov-fail-under=90
```

When PostgreSQL is available, also run:

```bash
python -m alembic upgrade head
python -m alembic check
```

Details: [`docs/backend/GLOBAL.md`](docs/backend/GLOBAL.md). Cursor rule:
[`.cursor/rules/backend-quality.mdc`](.cursor/rules/backend-quality.mdc).
