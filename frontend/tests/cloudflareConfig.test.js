import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

function parseFile(filePath) {
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
}

describe('Cloudflare static deployment configuration', () => {
  it('publica sin dominio propio y compila CI contra Railway', () => {
    const config = JSON.parse(fs.readFileSync('wrangler.jsonc', 'utf8'))
    for (const environment of Object.values(config.env)) {
      expect(environment.workers_dev).toBe(true)
      expect(environment.routes ?? []).toEqual([])
      expect(environment.vars.API_ORIGIN).toBe('https://api-production-b1fb.up.railway.app')
    }
    for (const workflow of ['deploy-fe-pages.yml', 'frontend-ci.yml']) {
      const body = fs.readFileSync(path.join('..', '.github', 'workflows', workflow), 'utf8')
      expect(body).toContain('VITE_API_BASE_URL: /api-backend')
      for (const feature of ['SELF_BOOKING', 'INVITATIONS', 'CRM_DISCOVERY', 'PERFORMANCE', 'NOTIFICATIONS', 'CALENDAR_SCHEDULES', 'REGIONAL_MODULES']) {
        expect(body).toMatch(new RegExp(`VITE_FEATURE_${feature}: ["']true["']`))
      }
      expect(body).toMatch(/VITE_FEATURE_PAYROLL: ["']false["']/)
      expect(body).not.toContain('api.helios360erp.com')
    }
    expect(config.assets.binding).toBe('ASSETS')
    expect(config.assets.run_worker_first).not.toBe(true)
  })
  const projectRoot = path.resolve(process.cwd())
  const headersFile = path.join(projectRoot, 'public', '_headers')
  const healthFile = path.join(projectRoot, 'public', 'health')
  const wranglerFile = path.join(projectRoot, 'wrangler.jsonc')

  it('incluir cabeceras de seguridad y /health explícito', () => {
    const lines = parseFile(headersFile)

    expect(lines).toContain('  Strict-Transport-Security: max-age=31536000; includeSubDomains')
    expect(lines).toContain('  X-Content-Type-Options: nosniff')
    expect(lines).toContain('  X-Frame-Options: DENY')
    expect(lines).toContain('  Permissions-Policy: camera=(), microphone=(), geolocation=()')
    expect(lines).toContain('/health')
    expect(lines).toContain('  Cache-Control: no-store')
    expect(lines).toContain('  Content-Type: text/plain; charset=utf-8')
  })

  it('exportar /health como recurso estático', () => {
    const body = fs.readFileSync(healthFile, 'utf8')
    expect(body.trim()).toBe('ok')
  })

  it('configurar assets SPA y entornos', () => {
    const raw = fs.readFileSync(wranglerFile, 'utf8')

    expect(raw).toContain('"not_found_handling": "none"')
    expect(raw).toContain('"directory": "./dist"')
    expect(raw).toContain('"name": "diedo-frontend-preview"')
    expect(raw).toContain('"name": "diedo-frontend-production"')
  })

  it('usar assets versionados para cache de largo plazo', () => {
    const distAssets = fs.readdirSync(path.join(projectRoot, 'dist', 'assets'))
    const hasVersionedJs = distAssets.some((name) => name.endsWith('.js') && /-.+\.(js|mjs)$/.test(name))
    const hasVersionedCss = distAssets.some((name) => name.endsWith('.css') && /-.+\.css$/.test(name))

    expect(hasVersionedJs).toBe(true)
    expect(hasVersionedCss).toBe(true)
  })
})

