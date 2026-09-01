import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function loadApiClient(baseUrl) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', baseUrl)
  return import('@/services/apiClient')
}

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'https://frontend.example.test' } })
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('apiClient URL base', () => {
  it('mantiene una base relativa para usar el proxy de Vite', async () => {
    const { apiClient } = await loadApiClient('/api-backend/')

    await apiClient.get('/api/v1/branches', { status: 'active' })

    expect(fetch).toHaveBeenCalledWith(
      '/api-backend/api/v1/branches?status=active',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('conserva protocolo, host y puerto de una base absoluta', async () => {
    const { apiClient } = await loadApiClient('https://api.example.test:8443/erp/')

    await apiClient.get('/api/v1/branches', { status: 'active' })

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.test:8443/erp/api/v1/branches?status=active',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('descarga blobs autenticados para previews protegidos', async () => {
    const { apiClient, bindSessionHandlers } = await loadApiClient('/api-backend')
    bindSessionHandlers({ getAccessToken: () => 'preview-token' })
    fetch.mockResolvedValueOnce(
      new Response(new Blob(['image'], { type: 'image/png' }), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    )

    const blob = await apiClient.blob('/api/v1/incidents/id/attachments/image/content')

    expect(blob.type).toBe('image/png')
    expect(fetch).toHaveBeenCalledWith(
      '/api-backend/api/v1/incidents/id/attachments/image/content',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer preview-token' }),
      })
    )
  })

  it('comparte un solo refresh cuando varias requests reciben 401 a la vez', async () => {
    const { apiClient, bindSessionHandlers } = await loadApiClient('/api-backend')
    let accessToken = 'expired-access'
    const setTokens = vi.fn(({ accessToken: nextToken }) => {
      accessToken = nextToken
    })
    const clearSession = vi.fn()
    bindSessionHandlers({
      getAccessToken: () => accessToken,
      setTokens,
      clearSession,
    })

    let refreshCalls = 0
    fetch.mockImplementation(async (url, options) => {
      if (url.endsWith('/api/v1/auth/refresh')) {
        refreshCalls += 1
        return new Response(JSON.stringify({ accessToken: 'fresh-access' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (options.headers.Authorization === 'Bearer expired-access') {
        return new Response(JSON.stringify({ message: 'Access expirado' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const [branches, users] = await Promise.all([
      apiClient.get('/api/v1/branches'),
      apiClient.get('/api/v1/users'),
    ])

    expect(refreshCalls).toBe(1)
    expect(setTokens).toHaveBeenCalledOnce()
    expect(clearSession).not.toHaveBeenCalled()
    expect(branches.url).toContain('/api/v1/branches')
    expect(users.url).toContain('/api/v1/users')
  })

  it('serializa la rotación con un Web Lock compartido entre pestañas', async () => {
    const requestLock = vi.fn((_name, _options, callback) => callback())
    vi.stubGlobal('navigator', { locks: { request: requestLock } })
    const { apiClient, bindSessionHandlers } = await loadApiClient('/api-backend')
    const setTokens = vi.fn()
    bindSessionHandlers({ setTokens, clearSession: vi.fn() })
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: 'fresh-access' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await apiClient.refreshSession()

    expect(requestLock).toHaveBeenCalledWith(
      'erp-auth-refresh',
      { mode: 'exclusive' },
      expect.any(Function)
    )
    expect(setTokens).toHaveBeenCalledWith({ accessToken: 'fresh-access' })
  })
})
