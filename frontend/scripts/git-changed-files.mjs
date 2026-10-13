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

export function relatedFrontendTests(frontendRoot, changedRel) {
  const tests = new Set()
  const testExt = /\.(test|spec)\.[jt]sx?$/
  for (const file of changedRel) {
    if (testExt.test(file) && (file.startsWith('tests/') || file.startsWith('src/'))) {
      tests.add(file.replaceAll('\\', '/'))
    }
  }
  const stems = changedRel
    .filter((file) => /\.[jt]sx?$/.test(file) && !testExt.test(file))
    .map((file) => path.basename(file).replace(/\.[jt]sx?$/, ''))
    .filter(Boolean)
  if (!stems.length) return [...tests]
  const roots = ['tests', 'src'].map((dir) => path.join(frontendRoot, dir))
  for (const dir of roots) {
    for (const full of walkFiles(dir, (_full, name) => testExt.test(name))) {
      const rel = path.relative(frontendRoot, full).replaceAll('\\', '/')
      const base = path.basename(full).replace(/\.(test|spec)\.[jt]sx?$/, '')
      for (const stem of stems) {
        if (base === stem || base.startsWith(`${stem}.`)) tests.add(rel)
      }
    }
  }
  return [...tests]
}
