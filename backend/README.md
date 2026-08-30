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

Keep `REFRESH_COOKIE_PATH=/api/v1/auth` when using the bundled frontend. Vite rewrites this cookie
path to `/api-backend/api/v1/auth`, and logout clears it with the same path. A root-scoped refresh
cookie is intentionally avoided so it cannot reach unrelated same-origin proxies.

## Start PostgreSQL and apply migrations

```bash
docker compose up -d
python -m alembic upgrade head
python -m alembic check
python -m app.scripts.bootstrap_local
```

Set `LOCAL_BOOTSTRAP_ADMIN_PASSWORD` in the untracked `.env` before the first bootstrap when local
Bearer-token login is needed. The development owner is `owner@erp.dev` in workspace `local-erp`.

To populate the versioned canonical demo data, set `DEMO_SEED_ENABLED=true` and run:

```bash
python -m app.scripts.seed_demo
```

The eight neutral `demo.*@example.com` identities use the password supplied through the local/test
environment. The seed is safe to repeat, validates manifest checksums, uses stable IDs, and includes
workspace-wide and branch-scoped users, five customers, thirteen basic employees, schedules and
supervisor links. With the flag false it does not write fixtures. `seed_local_demo` remains as a
compatibility wrapper for local workflows.

The local database listens on port `5433` to avoid colliding with a PostgreSQL installation on the
default port.

## Run the API

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Liveness: `GET http://localhost:8000/health`
- Database/schema readiness: `GET http://localhost:8000/health/ready`
- Local foundation status: `GET http://localhost:8000/dev/foundation`
- Authentication: `POST http://localhost:8000/api/v1/auth/login`
- Session context: `GET http://localhost:8000/api/v1/auth/me`
- Workspace settings: `GET/PATCH http://localhost:8000/api/v1/workspace/settings`
- Branches: `GET/POST/PATCH/DELETE http://localhost:8000/api/v1/branches`
- Payment methods: `GET/POST/PATCH/DELETE http://localhost:8000/api/v1/payment-methods`
- Users: `GET/POST http://localhost:8000/api/v1/users`
- User metrics: `GET http://localhost:8000/api/v1/users/summary`
- Permission matrix: `GET http://localhost:8000/api/v1/permissions/matrix`
- Catalog categories: `GET/POST http://localhost:8000/api/v1/catalog/categories`
- Catalog products: `GET/POST http://localhost:8000/api/v1/catalog/products`
- Units of measure: `GET http://localhost:8000/api/v1/catalog/units-of-measure`
- Customers: `GET/POST/PATCH http://localhost:8000/api/v1/customers`
- Customer timeline and attachments: nested under `http://localhost:8000/api/v1/customers/{id}`
- Employees: `GET/POST/PATCH http://localhost:8000/api/v1/employees`
- Employee schedules and attachments: nested under `http://localhost:8000/api/v1/employees/{id}`
- HR overview, profiles, leave, debts, and documents: `http://localhost:8000/api/v1/hr`
- Swagger UI: `http://localhost:8000/swagger/index.html`
- OpenAPI JSON: `http://localhost:8000/swagger.json`

Swagger and ReDoc are disabled when `APP_ENV=production`.

The IAM contract and security decisions are documented in
[`../docs/backend/IAM_API.md`](../docs/backend/IAM_API.md).
The workspace, legal entity, branch, and payment-method contracts are documented in
[`../docs/backend/ADMINISTRATION_API.md`](../docs/backend/ADMINISTRATION_API.md).
The catalog contract, filters, scope rules, and concurrency behavior are documented in
[`../docs/backend/CATALOG_API.md`](../docs/backend/CATALOG_API.md).
The Phase 2 customer, basic employee, schedule, attachment, scope, and retention contracts are
documented in [`../docs/backend/MASTER_DATA_API.md`](../docs/backend/MASTER_DATA_API.md).
The HR profile, leave, employee receivables, and document contracts are documented in
[`../docs/backend/HR_API.md`](../docs/backend/HR_API.md).

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

For an isolated local integration run, use the disposable PostgreSQL service and set the test
environment before importing the application:

```powershell
docker compose up -d postgres_test
$env:APP_ENV = 'test'
$env:DATABASE_URL = 'postgresql+psycopg://erp:erp@localhost:5434/erp_test'
python -m alembic upgrade head
python -m alembic check
python -m pytest
```

This manual sequence upgrades the current `erp_test`; it does not reset it. The frontend full-stack
harness performs the destructive `downgrade base → upgrade head → reseed` cycle under an explicit
localhost/port/name guard:

```powershell
Set-Location ..\frontend
npm run test:e2e:full-stack
```

Do not run pytest and the full-stack harness simultaneously, or run two harnesses against the same
`erp_test`, because they share and may recreate that schema. Pytest still collects the unit suite in
other environments; only tests marked `integration` are skipped unless `APP_ENV=test` and the
database name is literally `erp_test`.

## Architecture

Read [`../docs/backend/GLOBAL.md`](../docs/backend/GLOBAL.md) before adding domain modules, routes,
tables, or migrations. The implemented physical boundary and deferred business modules are documented
in [`../docs/backend/FOUNDATION_SCHEMA.md`](../docs/backend/FOUNDATION_SCHEMA.md). Hosting and managed
database infrastructure are intentionally deferred.
