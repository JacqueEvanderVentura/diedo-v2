import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const base = process.argv[2]
assert.ok(base, 'Provide the deployment URL')
const health = await fetch(`${base}/health`)
assert.equal(health.status, 200)
assert.equal((await health.text()).trim(), 'ok')
assert.match(health.headers.get('cache-control'), /no-store/)
const page = await fetch(`${base}/`)
assert.equal(page.status, 200)
assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
assert.equal(page.headers.get('x-frame-options'), 'DENY')
assert.match(page.headers.get('cache-control'), /must-revalidate/)
const html = await page.text()
// Node fetch overwrites Sec-Fetch-Mode with cors. curl preserves the browser
// navigation header, so this checks the intended SPA request rather than a fetch.
const deep = execFileSync('curl', ['--silent', '--show-error', '--fail',
  '-H', 'Sec-Fetch-Mode: navigate', `${base}/login`], { encoding: 'utf8' })
assert.equal(deep, html)
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g)].map(m => m[1])
assert.ok(assets.length >= 2)
for (const asset of assets) {
  const response = await fetch(`${base}${asset}`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /javascript/)
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
