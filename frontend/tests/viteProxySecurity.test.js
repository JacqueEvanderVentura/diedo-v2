import { describe, expect, it, vi } from 'vitest'
import viteConfig from '../vite.config.js'

function resolvedConfig() {
  return viteConfig({ command: 'serve', mode: 'test' })
}

function captureProxyRequestHandler(rule) {
  let handler
  rule.configure({
    on: vi.fn((event, callback) => {
      if (event === 'proxyReq') handler = callback
    }),
  })
  expect(handler).toBeTypeOf('function')
  return handler
}

describe('Vite proxy cookie boundaries', () => {
  it('reescribe la cookie de auth al prefijo público sin abrirla al resto del sitio', () => {
    const backend = resolvedConfig().server.proxy['/api-backend']

    expect(backend.cookiePathRewrite).toEqual({
      '/api/v1/auth': '/api-backend/api/v1/auth',
    })
  })

  it.each(['/api/serp', '/api/serper'])('elimina Cookie antes de salir por %s', (prefix) => {
    const rule = resolvedConfig().server.proxy[prefix]
    const handler = captureProxyRequestHandler(rule)
    const proxyRequest = {
      path: '/search',
      removeHeader: vi.fn(),
      setHeader: vi.fn(),
    }

    handler(proxyRequest, {})

    expect(proxyRequest.removeHeader).toHaveBeenCalledWith('cookie')
  })
})
