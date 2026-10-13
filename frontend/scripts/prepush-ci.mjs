import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listChangedFiles, relatedFrontendTests } from './git-changed-files.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(root)

const ciEnv = {
  ...process.env,
  VITE_API_BASE_URL: '/api-backend',
  VITE_DEMO_SEED_ENABLED: 'false',
  VITE_FEATURE_SELF_BOOKING: 'true',
  VITE_FEATURE_INVITATIONS: 'true',
  VITE_FEATURE_CRM_DISCOVERY: 'true',
  VITE_FEATURE_PAYROLL: 'false',
  VITE_FEATURE_PERFORMANCE: 'true',
  VITE_FEATURE_NOTIFICATIONS: 'true',
  VITE_FEATURE_CALENDAR_SCHEDULES: 'true',
  VITE_FEATURE_REGIONAL_MODULES: 'true',
  VITE_FEATURE_CHAT: 'true',
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

const changed = listChangedFiles(repoRoot, 'frontend').filter((file) =>
  /\.[jt]sx?$/.test(file),
)
const relatedTests = relatedFrontendTests(root, changed)
if (relatedTests.length) {
  run(
    `unit tests cambiados (${relatedTests.length})`,
    'npx',
    ['vitest', 'run', ...relatedTests],
  )
} else {
  console.log('prepush: no hay tests frontend ligados al git diff; sigo con la suite completa.')
}

console.log('prepush: build (frontend CI)')
run('build', 'npm', ['run', 'build'])

console.log('prepush: unit tests (frontend CI)')
run('unit tests', 'npm', ['test'])

console.log('prepush: wrangler dry-run (frontend CI)')
run('wrangler dry-run', 'npx', [
  'wrangler',
  'deploy',
  '--dry-run',
  '--config',
  'wrangler.jsonc',
  '--env',
  'production',
])

console.log('prepush: frontend checks passed')
