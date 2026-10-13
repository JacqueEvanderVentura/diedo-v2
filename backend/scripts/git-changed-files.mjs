import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

function gitLines(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) return []
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll('\\', '/'))
    .filter(Boolean)
}

export function listChangedFiles(repoRoot, posixPrefix) {
  const names = new Set([
    ...gitLines(repoRoot, ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
    ...gitLines(repoRoot, ['ls-files', '--others', '--exclude-standard']),
  ])
  const prefix = posixPrefix.endsWith('/') ? posixPrefix : `${posixPrefix}/`
  return [...names]
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
    .filter(Boolean)
}

export function walkFiles(dir, predicate, acc = []) {
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, predicate, acc)
    else if (predicate(full, entry.name)) acc.push(full)
  }
  return acc
}

export function relatedBackendTests(backendRoot, changedRel) {
  const tests = new Set()
  for (const file of changedRel) {
    if (file.startsWith('tests/') && file.endsWith('.py')) tests.add(file.replaceAll('\\', '/'))
  }
  const stems = changedRel
    .filter((file) => file.startsWith('app/') && file.endsWith('.py'))
    .map((file) => path.basename(file, '.py'))
    .filter((stem) => stem && stem !== '__init__')
  if (!stems.length) return [...tests]
  const testsRoot = path.join(backendRoot, 'tests')
  for (const full of walkFiles(testsRoot, (_full, name) => name.startsWith('test_') && name.endsWith('.py'))) {
    const base = path.basename(full, '.py')
    const rel = path.relative(backendRoot, full).replaceAll('\\', '/')
    for (const stem of stems) {
      if (base === `test_${stem}` || base.startsWith(`test_${stem}_`)) tests.add(rel)
    }
  }
  return [...tests]
}
