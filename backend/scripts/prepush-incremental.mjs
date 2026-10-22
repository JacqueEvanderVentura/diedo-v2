import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { listChangedFiles } from './git-changed-files.mjs'

const CACHE_NAME = 'prepush-incremental.json'

export function headCommit(repoRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

function cachePath(packageRoot) {
  return path.join(packageRoot, '.local', CACHE_NAME)
}

export function readIncrementalCache(packageRoot) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(packageRoot), 'utf8'))
  } catch {
    return null
  }
}

export function writeIncrementalCache(packageRoot, data) {
  fs.mkdirSync(path.dirname(cachePath(packageRoot)), { recursive: true })
  fs.writeFileSync(cachePath(packageRoot), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

/** True when the last green full suite was on this commit and the package tree is unchanged. */
export function shouldSkipFullSuite({ repoRoot, packageRoot, posixPrefix }) {
  if (process.env.PREPUSH_FULL === '1') return false
  const cache = readIncrementalCache(packageRoot)
  const cached = cache?.fullSuite
  if (!cached?.commit) return false
  const commit = headCommit(repoRoot)
  if (!commit || commit !== cached.commit) return false
  const changed = listChangedFiles(repoRoot, posixPrefix)
  if (changed.length) return false
  return true
}

export function recordFullSuiteSuccess({ repoRoot, packageRoot, passedTestFiles }) {
  const commit = headCommit(repoRoot)
  if (!commit) return
  const prior = readIncrementalCache(packageRoot)
  writeIncrementalCache(packageRoot, {
    ...prior,
    fullSuite: {
      commit,
      at: new Date().toISOString(),
      passedTestFiles,
    },
  })
}

export function parsePytestPassedFilesFromJunit(xmlPath) {
  try {
    const xml = fs.readFileSync(xmlPath, 'utf8')
    const files = new Set()
    for (const block of xml.split('<testcase ')) {
      if (/<failure|<error/.test(block)) continue
      const file = block.match(/\bfile="([^"]+)"/)?.[1]?.replaceAll('\\', '/')
      if (file) files.add(file)
    }
    return [...files].sort()
  } catch {
    return []
  }
}
