import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTestDatabaseUrl } from './test-database-url.mjs'
import { resolvePython } from './python-command.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const python = resolvePython(root)
const quick = process.argv.includes('--quick')

const ciEnv = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || 'test',
  DATABASE_URL: resolveTestDatabaseUrl(),
}

function run(label, command, args, { shell = false } = {}) {
  console.log(`prepush: ${label}`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: ciEnv,
    stdio: 'inherit',
    shell,
  })
  if (result.status !== 0) {
    console.error(`prepush: failed at "${label}" (exit ${result.status ?? 1})`)
    process.exit(result.status ?? 1)
  }
  if (result.signal) {
    console.error(`prepush: aborted at "${label}" (${result.signal})`)
    process.exit(1)
  }
}

if (quick) {
  console.log(
    'prepush: modo rápido — lint, tipos y tests sin integración (sin reset BD ni coverage).',
  )
  console.log('prepush: antes de abrir PR o push, corre `npm run prepush` completo.')
}

run('ruff check', python, ['-m', 'ruff', 'check', 'app', 'tests'])
run('ruff format --check', python, ['-m', 'ruff', 'format', '--check', 'app', 'tests'])
run('mypy', python, ['-m', 'mypy', 'app'])

if (!quick) {
  run('check test database', python, ['scripts/check_test_database.py'])
  run('release stray erp_test backends (before reset)', python, [
    '-m',
    'app.scripts.release_test_database_backends',
  ])
  run('reset test database (fresh schema like CI)', python, ['-m', 'app.scripts.reset_test_database'])
  run('alembic check (same as Backend CI)', python, ['-m', 'alembic', 'check'])
}

const pytestArgs = ['-m', 'pytest', '-x', '--maxfail=1', '--tb=short']
if (quick) {
  // One argv for the marker expression (cmd.exe treats bare `not` as an operator when shell=true).
  pytestArgs.push('-m', 'not integration')
} else {
  pytestArgs.push(
    '--cov=app',
    '--cov-report=term-missing',
    '--cov-fail-under=80',
  )
}

run(
  quick ? 'pytest unitarios (stop on first failure)' : 'pytest (stop on first failure)',
  python,
  pytestArgs,
)

console.log(
  quick
    ? 'prepush: checks rápidos OK (falta suite de integración; ver `npm run prepush`)'
    : 'prepush: backend checks passed (sin docker build; ver reusable-backend-ci.yml)',
)
