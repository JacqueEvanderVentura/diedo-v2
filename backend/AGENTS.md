# Backend agent guide

Repo-wide git rule: never merge branches or PRs unless the current user message explicitly says to. See [`AGENTS.md`](../AGENTS.md) and `.cursor/rules/no-auto-merge.mdc`.


Architecture and API contracts: [`docs/backend/GLOBAL.md`](../docs/backend/GLOBAL.md).

Coverage policy: [`docs/backend/COVERAGE.md`](../docs/backend/COVERAGE.md).

## Quality commands (run before finishing backend work)

From `backend/`:

```bash
npm run prepush
```

Prepush test order: **setup** (lint + DB reset) → **fase 1** replay last pytest failure from `backend/.local/prepush-last-failure.json` → **fase 2** lint/tests for git diff → **fase 3** full suite. A green run writes `backend/.local/prepush.log` (`succeeded …`) and clears the saved failure.

**Incremental fase 3 (local):** if `HEAD` is unchanged and there are no modified/untracked files under `backend/`, fase 3 is skipped after a prior green full suite on that commit (`backend/.local/prepush-incremental.json`). Use `PREPUSH_FULL=1 npm run prepush` to force the full suite. CI is unaffected.

Equivalent manual sequence:

```bash
python -m ruff check app tests
python -m ruff format --check app tests
python -m mypy app
node scripts/validate-migrations.mjs
python -m app.scripts.reset_test_database
python -m pytest --cov=app --cov-report=term-missing --cov-fail-under=80
```

Use `APP_ENV=test` and a disposable `erp_test` database (`docker compose up -d postgres_test`). See `backend/README.md`.

## No-drop coverage rules

1. Never lower `--cov-fail-under`.
2. Never omit newly added `app/` modules from coverage to pass CI.
3. Ship tests with every new error branch and external integration failure path.
4. Ratchet the fail-under floor only after a measured full-suite run (see COVERAGE.md).
