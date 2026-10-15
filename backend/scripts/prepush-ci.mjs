import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listChangedFiles, relatedBackendTests } from './git-changed-files.mjs'
import {
  lastPrepushLogLine,
  markPrepushSucceeded,
  parsePytestFailedNodeId,
  readLastPytestFailure,
  writePytestFailure,
  writeStepFailure,
} from './prepush-state.mjs'
import { resolveTestDatabaseUrl } from './test-database-url.mjs'
import { resolvePython } from './python-command.mjs'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const repoRoot = path.dirname(root)
const python = resolvePython(root)
const quick = process.argv.includes('--quick')

const ciEnv = {
  ...process.env,
  APP_ENV: process.env.APP_ENV || 'test',
  DATABASE_URL: resolveTestDatabaseUrl(),
}

function run(label, command, args, { shell = false, allowNoTests = false, capturePytest = false } = {}) {
  console.log(`prepush: ${label}`)
  const result = spawnSync(command, args, {
    cwd: root,
    env: ciEnv,
    stdio: capturePytest ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    encoding: capturePytest ? 'utf8' : undefined,
    shell,
  })
  if (capturePytest) {
    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
  }
  if (allowNoTests && result.status === 5) {
    console.log(`prepush: ${label} — sin tests recolectados, sigo.`)
    return
  }
  if (result.status !== 0) {
    if (capturePytest) {
      const nodeid = parsePytestFailedNodeId(`${result.stdout || ''}${result.stderr || ''}`)
      if (nodeid) writePytestFailure(root, { label, nodeid })
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

function runChangedFirst() {
  const changed = listChangedFiles(repoRoot, 'backend').filter((file) => file.endsWith('.py'))
  if (!changed.length) {
    console.log('prepush: no hay .py en git diff (backend); salto el paso de archivos cambiados.')
    return
  }
  console.log(`prepush: archivos cambiados primero (${changed.length})`)
  run('ruff check (changed)', python, ['-m', 'ruff', 'check', ...changed])
  run('ruff format --check (changed)', python, ['-m', 'ruff', 'format', '--check', ...changed])
  const appFiles = changed.filter((file) => file.startsWith('app/'))
  if (appFiles.length) {
    run('mypy (changed)', python, ['-m', 'mypy', ...appFiles])
  }
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
}
const savedFailure = readLastPytestFailure(root)
if (savedFailure) {
  const when = quick ? 'antes de los tests del diff' : 'tras el reset de BD'
  console.log(`prepush: repetiré el último fallo de pytest ${when} → ${savedFailure.nodeid}`)
}

runChangedFirst()

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
  const replayArgs = ['-m', 'pytest', '-x', '--maxfail=1', '--tb=short', savedFailure.nodeid]
  if (quick) replayArgs.push('-m', 'not integration')
  run('pytest último fallo guardado', python, replayArgs, {
    allowNoTests: true,
    capturePytest: true,
  })
}

const relatedTests = relatedBackendTests(
  root,
  listChangedFiles(repoRoot, 'backend').filter((file) => file.endsWith('.py')),
)
if (relatedTests.length) {
  const relatedArgs = ['-m', 'pytest', '-x', '--maxfail=1', '--tb=short', ...relatedTests]
  if (quick) relatedArgs.push('-m', 'not integration')
  run(
    quick
      ? `pytest unitarios cambiados (${relatedTests.length})`
      : `pytest tests relacionados (${relatedTests.length})`,
    python,
    relatedArgs,
    { allowNoTests: true, capturePytest: true },
  )
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
  { capturePytest: true },
)

markPrepushSucceeded(root)

console.log(
  quick
    ? 'prepush: checks rápidos OK (falta suite de integración; ver `npm run prepush`)'
    : 'prepush: backend checks passed (sin docker build; ver reusable-backend-ci.yml)',
)
