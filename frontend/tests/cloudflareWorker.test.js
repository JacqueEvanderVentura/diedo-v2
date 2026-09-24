import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../worker.js'
import { deploymentConfig } from '../scripts/prepare-deploy.mjs'

const origin = 'https://diedo-frontend-production.helios360erp.workers.dev'
const env = { API_ORIGIN: 'https://api-production-b1fb.up.railway.app' }
afterEach(() => vi.unstubAllGlobals())

describe('Cloudflare Railway proxy', () => {
  it('serves the SPA for page navigation while missing assets remain 404', async () => {
    const assets = { fetch: vi.fn(async request => {
      expect(request.url).toBe(`${origin}/`)
      return new Response('<html>app</html>')
    }) }
    const headers = { 'Sec-Fetch-Mode': 'navigate' }
    const page = await worker.fetch(new Request(`${origin}/login`, { headers }), { ...env, ASSETS: assets })
    expect(await page.text()).toBe('<html>app</html>')
    const missing = await worker.fetch(new Request(`${origin}/assets/missing.js`, { headers }), { ...env, ASSETS: assets })
    expect(missing.status).toBe(404)
    expect(assets.fetch).toHaveBeenCalledTimes(1)
  })

  it('sirve la política de privacidad aunque el crawler no envíe navigate', async () => {
    const assets = { fetch: vi.fn(async request => {
      expect(new URL(request.url).pathname).toBe('/privacidad/index.html')
      return new Response('<h1>Política de privacidad</h1>', { headers: { 'Content-Type': 'text/html' } })
    }) }
    const page = await worker.fetch(new Request(`${origin}/privacidad`), { ...env, ASSETS: assets })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('Política de privacidad')
  })

  it('streams uploads and preserves authorization, method, query and content type', async () => {
    const fetch = vi.fn(async request => {
      expect(request.url).toBe(`${env.API_ORIGIN}/api/v1/attachments?branchId=one`)
      expect(request.method).toBe('POST')
      expect(request.headers.get('Authorization')).toBe('Bearer test-token')
      expect(request.headers.get('Content-Type')).toContain('multipart/form-data')
      expect(await request.text()).toContain('example-file')
      return Response.json({ id: 'stored' }, { status: 201 })
    })
    vi.stubGlobal('fetch', fetch)
    const form = new FormData()
    form.set('file', new Blob(['example-file']), 'test.txt')
    const result = await worker.fetch(new Request(`${origin}/api-backend/api/v1/attachments?branchId=one`, {
      method: 'POST', body: form, headers: { Origin: origin, Authorization: 'Bearer test-token' },
    }), env)
    expect(result.status).toBe(201)
    expect(result.headers.get('Cache-Control')).toBe('no-store')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves separate cookies, expiry and secure flags while mapping their path', async () => {
    const headers = new Headers()
    headers.append('Set-Cookie', 'erp_refresh=one; Path=/api/v1/auth; HttpOnly; Secure; SameSite=None')
    headers.append('Set-Cookie', 'other=two; Path=/api/v1/auth; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Secure')
    vi.stubGlobal('fetch', vi.fn(async request => {
      expect(request.headers.get('Cookie')).toBe('erp_refresh=old')
      return Response.json({ accessToken: 'test' }, { headers })
    }))
    const response = await worker.fetch(new Request(`${origin}/api-backend/api/v1/auth/refresh`, {
      method: 'POST', headers: { Cookie: 'erp_refresh=old', Origin: origin },
    }), env)
    const cookies = response.headers.getSetCookie()
    expect(cookies).toHaveLength(2)
    expect(cookies[0]).toContain('Path=/api-backend/api/v1/auth; HttpOnly; Secure; SameSite=Lax')
    expect(cookies[1]).toContain('Expires=Wed, 21 Oct 2037 07:28:00 GMT')
  })

  it('maps logout deletion and redirects without following them', async () => {
    const fetch = vi.fn(async request => {
      expect(request.redirect).toBe('manual')
      return new Response(null, { status: 307, headers: {
        Location: `${env.API_ORIGIN}/api/v1/auth/logout/`,
        'Set-Cookie': 'erp_refresh=""; Max-Age=0; Path=/api/v1/auth; Secure; HttpOnly; SameSite=None',
      } })
    })
    vi.stubGlobal('fetch', fetch)
    const response = await worker.fetch(new Request(`${origin}/api-backend/api/v1/auth/logout`, { method: 'POST' }), env)
    expect(response.status).toBe(307)
    expect(response.headers.get('Location')).toBe(`${origin}/api-backend/api/v1/auth/logout/`)
    expect(response.headers.getSetCookie()[0]).toContain('Max-Age=0; Path=/api-backend/api/v1/auth')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects cross-site requests and non-API paths before contacting Railway', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect((await worker.fetch(new Request(`${origin}/api-backend/api/v1/auth/refresh`, {
      method: 'POST', headers: { Origin: 'https://untrusted.example' },
    }), env)).status).toBe(403)
    for (const path of ['/api-backend/https://untrusted.example', '/assets/missing.js', '/api-backend//untrusted.example']) {
      expect((await worker.fetch(new Request(origin + path), env)).status).toBe(404)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns an uncached generic error when Railway is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private upstream details')))
    const response = await worker.fetch(new Request(`${origin}/api-backend/health/ready`), env)
    expect(response.status).toBe(502)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).not.toContain('private upstream details')
  })
})

it('keeps workers.dev available and only activates the approved custom domain explicitly', () => {
  const source = { env: { production: { workers_dev: true }, preview: { workers_dev: true } } }
  expect(deploymentConfig(source).env.production.routes).toEqual([])
  const configured = deploymentConfig(source, 'app.helios360erp.com')
  expect(configured.env.production.routes).toEqual([{ pattern: 'app.helios360erp.com', custom_domain: true }])
  expect(configured.env.production.workers_dev).toBe(true)
  expect(configured.env.preview.routes).toBeUndefined()
  expect(source.env.production.routes).toBeUndefined()
  expect(() => deploymentConfig(source, 'unapproved.example')).toThrow()
})
