import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveTestDatabaseUrl } from './test-database-url.mjs'
import { resolvePython } from './python-command.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const python = resolvePython(root)

const result = spawnSync(
  python,
  ['-m', 'app.scripts.reset_test_database'],
  {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: process.env.APP_ENV || 'test',
      DATABASE_URL: resolveTestDatabaseUrl(),
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)
process.exit(result.status ?? 1)
