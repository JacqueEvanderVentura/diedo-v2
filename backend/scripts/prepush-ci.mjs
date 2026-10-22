import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listChangedFiles, relatedBackendTests } from './git-changed-files.mjs'
import {
  lastPrepushLogLine,
  markPrepushSucceeded,
  parsePytestFailedNodeIdFromJunit,
  readLastPytestFailure,
  writePytestFailure,
  writeStepFailure,
} from './prepush-state.mjs'
import { resolveTestDatabaseUrl } from './test-database-url.mjs'
import { resolvePython } from './python-command.mjs'
import {
  parsePytestPassedFilesFromJunit,
  recordFullSuiteSuccess,
  shouldSkipFullSuite,
} from './prepush-incremental.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(root)
const python = resolvePython(root)
const quick = process.argv.includes('--quick')
const junitPath = path.join(root, '.local/prepush-pytest.xml')

const ciEnv = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || 'test',
  DATABASE_URL: resolveTestDatabaseUrl(),
  PYTHONUNBUFFERED: '1',
}

function run(label, command, args, { shell = false, allowNoTests = false } = {}) {
  console.log(`prepush: ${label}`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: ciEnv,
    stdio: 'inherit',
    shell,
  })
  if (allowNoTests && result.status === 5) {
    console.log(`prepush: ${label} — sin tests recolectados, sigo.`)
    return
  }
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

function runPytest(label, pytestArgs, { allowNoTests = false } = {}) {
  fs.mkdirSync(path.dirname(junitPath), { recursive: true })
  try {
    fs.unlinkSync(junitPath)
  } catch {
    /* no prior report */
  }
  const args = [
    '-u',
    '-m',
    'pytest',
    ...pytestArgs,
    '-o=junit_family=xunit2',
    `--junitxml=${junitPath}`,
  ]
  console.log(`prepush: ${label}`)
  const result = spawnSync(python, args, {
    cwd: root,
    env: ciEnv,
    stdio: 'inherit',
  })
  if (allowNoTests && result.status === 5) {
    console.log(`prepush: ${label} — sin tests recolectados, sigo.`)
    return
  }
  if (result.status !== 0) {
    const nodeid = parsePytestFailedNodeIdFromJunit(junitPath)
    if (nodeid) writePytestFailure(root, { label, nodeid })
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

function runChangedLint() {
  const changed = listChangedFiles(repoRoot, 'backend').filter((file) => file.endsWith('.py'))
  if (!changed.length) {
    console.log('prepush: fase 2 — sin .py en el diff; salto lint/tests del diff.')
    return []
  }
  console.log(`prepush: fase 2 — diff (${changed.length} archivo(s) .py)`)
  run('ruff check (changed)', python, ['-m', 'ruff', 'check', ...changed])
  run('ruff format --check (changed)', python, ['-m', 'ruff', 'format', '--check', ...changed])
  const appFiles = changed.filter((file) => file.startsWith('app/'))
  if (appFiles.length) {
    run('mypy (changed)', python, ['-m', 'mypy', ...appFiles])
  }
  return changed
}

if (quick) {
  console.log(
    'prepush: modo rápido — lint, tipos y tests sin integración (sin reset BD ni coverage).',
  )
  console.log('prepush: antes de abrir PR o push, corre `npm run prepush` completo.')
}

const lastLog = lastPrepushLogLine(root)
if (lastLog.startsWith('succeeded ')) {
  console.log(`prepush: última corrida OK (${lastLog.slice('succeeded '.length)})`)
} else if (lastLog.startsWith('failed ')) {
  console.log(`prepush: última corrida falló — ver backend/.local/prepush.log`)
}

const savedFailure = readLastPytestFailure(root)

console.log('prepush: setup — lint global y base de datos de prueba')
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

if (savedFailure?.nodeid) {
  const replayArgs = ['-x', '--maxfail=1', '--tb=short', savedFailure.nodeid]
  if (quick) replayArgs.push('-m', 'not integration')
  runPytest(`fase 1 — último fallo guardado (${savedFailure.nodeid})`, replayArgs, {
    allowNoTests: true,
  })
} else {
  console.log('prepush: fase 1 — sin fallo de pytest guardado; sigo.')
}

const changed = runChangedLint()
const relatedTests = relatedBackendTests(
  root,
  changed.length ? changed : listChangedFiles(repoRoot, 'backend').filter((f) => f.endsWith('.py')),
)
if (relatedTests.length) {
  const relatedArgs = ['-x', '--maxfail=1', '--tb=short', ...relatedTests]
  if (quick) relatedArgs.push('-m', 'not integration')
  runPytest(
    quick
      ? `fase 2 — pytest unitarios del diff (${relatedTests.length})`
      : `fase 2 — pytest tests relacionados al diff (${relatedTests.length})`,
    relatedArgs,
    { allowNoTests: true },
  )
}

const skipFullSuite =
  !quick &&
  shouldSkipFullSuite({ repoRoot, packageRoot: root, posixPrefix: 'backend' })
if (skipFullSuite) {
  console.log(
    'prepush: fase 3 — sin cambios en backend desde el último prepush OK en este commit; salto suite completa.',
  )
  console.log('prepush: forzar suite completa con PREPUSH_FULL=1 npm run prepush')
} else {
  const pytestArgs = ['-x', '--maxfail=1', '--tb=short']
  if (quick) {
    pytestArgs.push('-m', 'not integration')
  } else {
    pytestArgs.push('--cov=app', '--cov-report=term-missing', '--cov-fail-under=80')
  }

  runPytest(
    quick ? 'fase 3 — pytest unitarios (suite completa)' : 'fase 3 — pytest (suite completa + coverage)',
    pytestArgs,
  )
  if (!quick) {
    recordFullSuiteSuccess({
      repoRoot,
      packageRoot: root,
      passedTestFiles: parsePytestPassedFilesFromJunit(junitPath),
    })
  }
}

markPrepushSucceeded(root)

console.log(
  quick
    ? 'prepush: checks rápidos OK (falta suite de integración; ver `npm run prepush`)'
    : 'prepush: backend checks passed (sin docker build; ver reusable-backend-ci.yml)',
)
