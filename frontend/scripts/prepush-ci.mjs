import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listChangedFiles, relatedFrontendTests } from './git-changed-files.mjs'
import {
  lastPrepushLogLine,
  markPrepushSucceeded,
  parseVitestFailedTargetFromJunit,
  readLastVitestFailure,
  writeStepFailure,
  writeVitestFailure,
} from './prepush-state.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(root)
const shell = process.platform === 'win32'
const junitRel = '.local/prepush-vitest.xml'
const junitPath = path.join(root, junitRel)

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
    shell,
  })
  if (result.status !== 0) {
    writeStepFailure(root, { label })
    console.error(`prepush: failed at "${label}" (exit ${result.status ?? 1})`)
    process.exit(result.status ?? 1)
  }
  if (result.signal) {
    writeStepFailure(root, { label })
    console.error(`prepush: aborted at "${label}" (${result.signal})`)
    process.exit(1)
  }
}

function vitestArgs(extra) {
  return [
    'vitest',
    'run',
    '--bail',
    '1',
    ...extra,
    '--reporter=default',
    '--reporter=junit',
    `--outputFile=${junitRel}`,
  ]
}

function runVitest(label, extraArgs) {
  fs.mkdirSync(path.dirname(junitPath), { recursive: true })
  try {
    fs.unlinkSync(junitPath)
  } catch {
    /* no prior report */
  }
  console.log(`prepush: ${label}`)
  const result = spawnSync('npx', vitestArgs(extraArgs), {
    cwd: root,
    env: ciEnv,
    stdio: 'inherit',
    shell,
  })
  if (result.status !== 0) {
    const target = parseVitestFailedTargetFromJunit(junitPath)
    if (target) writeVitestFailure(root, { label, target })
    else writeStepFailure(root, { label })
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
} else if (lastLog.startsWith('failed ')) {
  console.log(`prepush: última corrida falló — ver frontend/.local/prepush.log`)
}

const savedFailure = readLastVitestFailure(root)

console.log('prepush: setup — listo para tests (build en fase 3)')

if (savedFailure?.target) {
  runVitest(`fase 1 — último fallo guardado (${savedFailure.target})`, [savedFailure.target])
} else {
  console.log('prepush: fase 1 — sin fallo de vitest guardado; sigo.')
}

const changed = listChangedFiles(repoRoot, 'frontend').filter((file) => /\.[jt]sx?$/.test(file))
const relatedTests = relatedFrontendTests(root, changed)
if (!changed.length) {
  console.log('prepush: fase 2 — sin archivos fuente en el diff; salto tests del diff.')
} else if (relatedTests.length) {
  console.log(`prepush: fase 2 — diff (${changed.length} archivo(s), ${relatedTests.length} test(s))`)
  runVitest(`fase 2 — tests del diff`, relatedTests)
} else {
  console.log(
    `prepush: fase 2 — diff (${changed.length} archivo(s); sin tests vitest ligados; sigo).`,
  )
}

console.log('prepush: fase 3 — build + suite completa + wrangler')
run('build', 'npm', ['run', 'build'])
runVitest('fase 3 — vitest (suite completa)', [])
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
