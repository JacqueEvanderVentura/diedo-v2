import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTestDatabaseUrl } from './test-database-url.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

const ciEnv = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || 'test',
  DATABASE_URL: resolveTestDatabaseUrl(),
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
run('validate migrations (same as Backend CI)', 'node', ['scripts/validate-migrations.mjs'])
run('reset test database (fresh schema like CI)', 'python', ['-m', 'app.scripts.reset_test_database'])
run('pytest', 'python', [
  '-m',
  'pytest',
  '--cov=app',
  '--cov-report=term-missing',
  '--cov-fail-under=89',
])

console.log('prepush: backend checks passed (sin docker build; ver reusable-backend-ci.yml)')
