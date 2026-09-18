import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const ciEnv = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || 'test',
  DATABASE_URL:
    process.env.DATABASE_URL || 'postgresql+psycopg://erp:erp@localhost:5432/erp_test',
}

function run(label, command, args) {
  console.log(`prepush: ${label}`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: ciEnv,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('ruff check', 'python', ['-m', 'ruff', 'check', 'app', 'tests'])
run('ruff format --check', 'python', ['-m', 'ruff', 'format', '--check', 'app', 'tests'])
run('mypy', 'python', ['-m', 'mypy', 'app'])
run('alembic upgrade head', 'python', ['-m', 'alembic', 'upgrade', 'head'])
run('alembic check', 'python', ['-m', 'alembic', 'check'])
run('pytest', 'python', [
  '-m',
  'pytest',
  '--cov=app',
  '--cov-report=term-missing',
  '--cov-fail-under=89',
])

console.log('prepush: backend checks passed (sin docker build; ver reusable-backend-ci.yml)')
