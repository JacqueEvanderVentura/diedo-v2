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

function run(command, args) {
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

console.log('Validate migrations: comprobando Postgres (timeout 5s)')
run('python', ['scripts/check_test_database.py'])

console.log('Validate migrations (Backend CI): alembic upgrade head')
run('python', ['-m', 'alembic', 'upgrade', 'head'])

console.log('Validate migrations (Backend CI): alembic check')
run('python', ['-m', 'alembic', 'check'])

console.log('Validate migrations: OK')
