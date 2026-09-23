# Backend test coverage

## Gate

- Tool: `pytest` + `coverage.py`
- Mode: **line and branch** (`branch = true` in `backend/pyproject.toml`)
- CI floor: `--cov-fail-under` in `backend/scripts/prepush-ci.mjs` and `.github/workflows/reusable-backend-ci.yml`
- Current measured floor: **80%** (temporary CI floor so Meta OAuth work can ship; ratchet upward after a green full run)

## Omitted paths (intentional)

Scripts, demo seed helpers, and public-booking/mailer adapters are listed in `[tool.coverage.run] omit` in `pyproject.toml`. Do not add production `app/services/*` modules to that list to mask missing tests.

## No-drop policy

1. Feature PRs must test happy path, authz/404, and every new `except` / validation error.
2. Never decrease `--cov-fail-under`.
3. After a wave improves the measured total by ≥1 percentage point, bump fail-under to the new floor (integer percent) in prepush, GitHub Actions, and `backend/README.md`.

## Wave order (toward ~95%)

Work lowest coverage × file size first:

1. `document_attachments`, `inventory`, `hr`
2. `crm`, `finance`, `purchasing`, `users`
3. `pos`, `agenda`, `administration`, remaining `meta_oauth`

Stop each wave when those modules reach high 80s/90s on new branches; global 95% is a multi-wave goal, not a single PR.

## How to measure

```bash
cd backend
npm run prepush
```

Or pytest with the same `--cov=app` flags after `reset_test_database`.
