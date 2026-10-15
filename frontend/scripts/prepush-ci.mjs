import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listChangedFiles, relatedFrontendTests } from './git-changed-files.mjs'
import {
  lastPrepushLogLine,
  markPrepushSucceeded,
  parseVitestFailedTarget,
  readLastVitestFailure,
  writeStepFailure,
  writeVitestFailure,
} from './prepush-state.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(root)
const shell = process.platform === 'win32'

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

function run(label, command, args, { captureVitest = false } = {}) {
  console.log(`prepush: ${label}`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: ciEnv,
    stdio: captureVitest ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: captureVitest ? 'utf8' : undefined,
    shell,
  })
  if (captureVitest) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (result.status !== 0) {
    if (captureVitest) {
      const target = parseVitestFailedTarget(`${result.stdout || ''}${result.stderr || ''}`)
      if (target) writeVitestFailure(root, { label, target })
      else writeStepFailure(root, { label })
    } else {
      writeStepFailure(root, { label })
    }
    console.error(`prepush: failed at "${label}" (exit ${result.status ?? 1})`)
    process.exit(result.status ?? 1)
  }
  if (result.signal) {
    writeStepFailure(root, { label })
    console.error(`prepush: aborted at "${label}" (${result.signal})`)
    process.exit(1)
  }
}

const lastLog = lastPrepushLogLine(root)
if (lastLog.startsWith('succeeded ')) {
  console.log(`prepush: última corrida OK (${lastLog.slice('succeeded '.length)})`)
}
const savedFailure = readLastVitestFailure(root)
if (savedFailure) {
  console.log(
    `prepush: repetiré el último fallo de vitest tras tests del diff → ${savedFailure.target}`,
  )
}

const changed = listChangedFiles(repoRoot, 'frontend').filter((file) =>
  /\.[jt]sx?$/.test(file),
)
const relatedTests = relatedFrontendTests(root, changed)
if (relatedTests.length) {
  run(`unit tests cambiados (${relatedTests.length})`, 'npx', ['vitest', 'run', ...relatedTests], {
    captureVitest: true,
  })
} else {
  console.log('prepush: no hay tests frontend ligados al git diff; sigo con la suite completa.')
}

if (savedFailure?.target) {
  run('vitest último fallo guardado', 'npx', ['vitest', 'run', savedFailure.target], {
    captureVitest: true,
  })
}

console.log('prepush: build (frontend CI)')
run('build', 'npm', ['run', 'build'])

console.log('prepush: unit tests (frontend CI)')
run('unit tests', 'npm', ['test'], { captureVitest: true })

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

markPrepushSucceeded(root)

console.log('prepush: frontend checks passed')
