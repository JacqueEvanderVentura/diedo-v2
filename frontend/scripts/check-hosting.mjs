import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const base = process.argv[2]
assert.ok(base, 'Provide the deployment URL')

function fetchSpaShell(path) {
  // Node fetch overwrites Sec-Fetch-Mode with cors. curl preserves the browser
  // navigation header, matching how Cloudflare serves the SPA shell.
  return execFileSync(
    'curl',
    [
      '--silent',
      '--show-error',
      '--fail',
      '-H',
      'Sec-Fetch-Mode: navigate',
      '-H',
      'Cache-Control: no-cache',
      `${base}${path}`,
    ],
    { encoding: 'utf8' },
  )
}

function extractAssets(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]).sort()
}

function normalizeSpaShell(html) {
  return html.replace(/\/assets\/[^"]+/g, '/assets/HASH')
}

async function assetsReady(assets) {
  for (const asset of assets) {
    const response = await fetch(`${base}${asset}`, { cache: 'no-store' })
    if (response.status !== 200) {
      return { ready: false, asset, status: response.status }
    }
  }
  return { ready: true }
}

const health = await fetch(`${base}/health`)
assert.equal(health.status, 200)
assert.equal((await health.text()).trim(), 'ok')
assert.match(health.headers.get('cache-control'), /no-store/)
const page = await fetch(`${base}/`)
assert.equal(page.status, 200)
assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
assert.equal(page.headers.get('x-frame-options'), 'DENY')
assert.match(page.headers.get('cache-control'), /must-revalidate/)

let rootHtml = ''
let loginHtml = ''
let verifiedAssets = []
const maxAttempts = 12
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  rootHtml = fetchSpaShell('/')
  loginHtml = fetchSpaShell('/login')
  const rootAssets = extractAssets(rootHtml)
  const loginAssets = extractAssets(loginHtml)
  const shellsAligned =
    rootAssets.length >= 2 &&
    loginAssets.length >= 2 &&
    rootAssets.join('\0') === loginAssets.join('\0') &&
    normalizeSpaShell(rootHtml) === normalizeSpaShell(loginHtml)
  if (shellsAligned) {
    verifiedAssets = rootAssets
    const readiness = await assetsReady(verifiedAssets)
    if (readiness.ready) {
      break
    }
    if (attempt === maxAttempts) {
      assert.equal(
        readiness.status,
        200,
        `Asset ${readiness.asset} must be available after deploy`,
      )
    }
  } else if (attempt === maxAttempts) {
    assert.deepEqual(
      loginAssets,
      rootAssets,
      'SPA shell assets must match between / and /login after deploy',
    )
    assert.equal(
      normalizeSpaShell(loginHtml),
      normalizeSpaShell(rootHtml),
      'SPA HTML shell must match between / and /login after deploy',
    )
  }
  await sleep(2_000)
}

assert.ok(verifiedAssets.length >= 2)
for (const asset of verifiedAssets) {
  const response = await fetch(`${base}${asset}`, { cache: 'no-store' })
  assert.equal(response.status, 200)
  assert.match(
    response.headers.get('content-type'),
    asset.endsWith('.css') ? /text\/css/ : /javascript/,
  )
  assert.match(response.headers.get('cache-control'), /immutable/)
  const body = await response.text()
  assert.ok(!body.includes('api.helios360erp.com'))
}
const missing = await fetch(`${base}/assets/nonexistent-migration-check.js`)
assert.equal(missing.status, 404)
const apiHealth = await fetch(`${base}/api-backend/health/ready`)
assert.equal(apiHealth.status, 200, 'Railway API must be ready through the frontend')
assert.match(apiHealth.headers.get('cache-control'), /no-store/)
const anonymous = await fetch(`${base}/api-backend/api/v1/auth/me`)
assert.equal(anonymous.status, 401)
assert.match(anonymous.headers.get('content-type'), /application\/json/)
console.log('PASS: health, SPA, security headers, cache, JS/CSS, missing asset and Railway API')
