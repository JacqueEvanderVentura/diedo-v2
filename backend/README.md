# ERP API (Python)

FastAPI application runnable locally with Uvicorn and compatible with AWS Lambda through Mangum.
PostgreSQL is accessed with SQLAlchemy 2 and versioned with Alembic.

## Requirements

- CPython 3.14.7, matching [`.python-version`](.python-version)
- Docker Desktop for the local PostgreSQL integration path

## Create the virtual environment

From `backend/` on PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
```

On macOS or Linux:

```bash
python3.14 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-dev.txt
```

The `.venv` directory is local and intentionally ignored by Git.

## Configuration

Copy `.env.example` to `.env`. The included values are only for local development.

```powershell
Copy-Item .env.example .env
```

## Start PostgreSQL and apply migrations

```bash
docker compose up -d
python -m alembic upgrade head
python -m alembic check
python -m app.scripts.bootstrap_local
```

Set `LOCAL_BOOTSTRAP_ADMIN_PASSWORD` in the untracked `.env` before the first bootstrap when local
Bearer-token login is needed. The development owner is `owner@erp.dev` in workspace `local-erp`.

To populate the local users, branches, roles, and permission matrix with repeatable demo data, run:

```bash
python -m app.scripts.seed_local_demo
```

The eight `*.demo@erp.dev` users share the local bootstrap password strictly for development. The
seed is safe to repeat and includes workspace-wide and branch-scoped users plus one suspended user.

The local database listens on port `5433` to avoid colliding with a PostgreSQL installation on the
default port.

## Run the API

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Liveness: `GET http://localhost:8000/health`
- Database readiness: `GET http://localhost:8000/health/ready`
- Local foundation status: `GET http://localhost:8000/dev/foundation`
- Authentication: `POST http://localhost:8000/api/v1/auth/login`
- Users: `GET/POST http://localhost:8000/api/v1/users`
- User metrics: `GET http://localhost:8000/api/v1/users/summary`
- Permission matrix: `GET http://localhost:8000/api/v1/permissions/matrix`
- Swagger UI: `http://localhost:8000/swagger/index.html`
- OpenAPI JSON: `http://localhost:8000/swagger.json`

Swagger and ReDoc are disabled when `APP_ENV=production`.

The IAM contract and security decisions are documented in
[`../docs/backend/IAM_API.md`](../docs/backend/IAM_API.md).

## Quality checks

```bash
python -m ruff check app tests --fix
python -m ruff format app tests
python -m ruff check app tests
python -m ruff format --check app tests
python -m mypy app
python -m pytest --cov=app --cov-report=term-missing --cov-fail-under=90
```

The same checks run in GitHub Actions against a PostgreSQL service container.

## Architecture

Read [`../docs/backend/GLOBAL.md`](../docs/backend/GLOBAL.md) before adding domain modules, routes,
tables, or migrations. The implemented physical boundary and deferred business modules are documented
in [`../docs/backend/FOUNDATION_SCHEMA.md`](../docs/backend/FOUNDATION_SCHEMA.md). Hosting and managed
database infrastructure are intentionally deferred.
