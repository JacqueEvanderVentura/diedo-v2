import fs from 'node:fs'
import path from 'node:path'

function localDir(frontendRoot) {
  return path.join(frontendRoot, '.local')
}

function lastFailurePath(frontendRoot) {
  return path.join(localDir(frontendRoot), 'prepush-last-failure.json')
}

function logPath(frontendRoot) {
  return path.join(localDir(frontendRoot), 'prepush.log')
}

export function readLastVitestFailure(frontendRoot) {
  try {
    const data = JSON.parse(fs.readFileSync(lastFailurePath(frontendRoot), 'utf8'))
    if (data?.kind === 'vitest' && typeof data.target === 'string' && data.target) {
      return data
    }
    return null
  } catch {
    return null
  }
}

export function writeVitestFailure(frontendRoot, { label, target }) {
  fs.mkdirSync(localDir(frontendRoot), { recursive: true })
  fs.writeFileSync(
    lastFailurePath(frontendRoot),
    `${JSON.stringify(
      {
        kind: 'vitest',
        label,
        target,
        at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  fs.appendFileSync(
    logPath(frontendRoot),
    `failed ${new Date().toISOString()} vitest ${target} (${label})\n`,
    'utf8',
  )
}

export function writeStepFailure(frontendRoot, { label }) {
  fs.mkdirSync(localDir(frontendRoot), { recursive: true })
  fs.writeFileSync(
    lastFailurePath(frontendRoot),
    `${JSON.stringify(
      {
        kind: 'step',
        label,
        at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  fs.appendFileSync(
    logPath(frontendRoot),
    `failed ${new Date().toISOString()} step ${label}\n`,
    'utf8',
  )
}

export function markPrepushSucceeded(frontendRoot) {
  fs.mkdirSync(localDir(frontendRoot), { recursive: true })
  try {
    fs.unlinkSync(lastFailurePath(frontendRoot))
  } catch {
    /* no prior failure */
  }
  fs.writeFileSync(logPath(frontendRoot), `succeeded ${new Date().toISOString()}\n`, 'utf8')
}

export function lastPrepushLogLine(frontendRoot) {
  try {
    const lines = fs.readFileSync(logPath(frontendRoot), 'utf8').trim().split(/\r?\n/)
    return lines.at(-1) || ''
  } catch {
    return ''
  }
}

/** First path in a Vitest `FAIL  path > …` line (last FAIL wins with bail). */
export function parseVitestFailedTarget(output) {
  const matches = [...String(output).matchAll(/^\s*FAIL\s+(\S+)/gm)]
  if (!matches.length) return null
  return matches.at(-1)[1].replaceAll('\\', '/')
}
