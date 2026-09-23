import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

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

console.log('prepush: build (frontend CI)')
run('npm', ['run', 'build'])

console.log('prepush: unit tests (frontend CI)')
run('npm', ['test'])

console.log('prepush: wrangler dry-run (frontend CI)')
run('npx', ['wrangler', 'deploy', '--dry-run', '--config', 'wrangler.jsonc', '--env', 'production'])

console.log('prepush: frontend checks passed')
