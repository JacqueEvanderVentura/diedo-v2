import fs from 'node:fs'
import path from 'node:path'

function localDir(backendRoot) {
  return path.join(backendRoot, '.local')
}

function lastFailurePath(backendRoot) {
  return path.join(localDir(backendRoot), 'prepush-last-failure.json')
}

function logPath(backendRoot) {
  return path.join(localDir(backendRoot), 'prepush.log')
}

export function readLastPytestFailure(backendRoot) {
  try {
    const data = JSON.parse(fs.readFileSync(lastFailurePath(backendRoot), 'utf8'))
    if (data?.kind === 'pytest' && typeof data.nodeid === 'string' && data.nodeid) {
      return data
    }
    return null
  } catch {
    return null
  }
}

export function writePytestFailure(backendRoot, { label, nodeid }) {
  fs.mkdirSync(localDir(backendRoot), { recursive: true })
  fs.writeFileSync(
    lastFailurePath(backendRoot),
    `${JSON.stringify(
      {
        kind: 'pytest',
        label,
        nodeid,
        at: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  fs.appendFileSync(
    logPath(backendRoot),
    `failed ${new Date().toISOString()} pytest ${nodeid} (${label})\n`,
    'utf8',
  )
}

export function writeStepFailure(backendRoot, { label }) {
  fs.mkdirSync(localDir(backendRoot), { recursive: true })
  fs.writeFileSync(
    lastFailurePath(backendRoot),
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
    logPath(backendRoot),
    `failed ${new Date().toISOString()} step ${label}\n`,
    'utf8',
  )
}

export function markPrepushSucceeded(backendRoot) {
  fs.mkdirSync(localDir(backendRoot), { recursive: true })
  try {
    fs.unlinkSync(lastFailurePath(backendRoot))
  } catch {
    /* no prior failure */
  }
  fs.writeFileSync(logPath(backendRoot), `succeeded ${new Date().toISOString()}\n`, 'utf8')
}

export function lastPrepushLogLine(backendRoot) {
  try {
    const lines = fs.readFileSync(logPath(backendRoot), 'utf8').trim().split(/\r?\n/)
    return lines.at(-1) || ''
  } catch {
    return ''
  }
}

/** Last failed testcase from a pytest --junitxml report (-x → usually one failure). */
export function parsePytestFailedNodeIdFromJunit(xmlPath) {
  try {
    const xml = fs.readFileSync(xmlPath, 'utf8')
    let last = null
    for (const block of xml.split('<testcase ')) {
      if (!/<failure|<error/.test(block)) continue
      const file = block.match(/\bfile="([^"]+)"/)?.[1]?.replaceAll('\\', '/')
      const name = block.match(/\bname="([^"]+)"/)?.[1]
      if (file && name) last = `${file}::${name}`
    }
    return last
  } catch {
    return null
  }
}
