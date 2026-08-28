const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api-backend'

let sessionHandlers = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  setTokens: () => {},
  clearSession: () => {},
}

let refreshPromise = null

export function bindSessionHandlers(handlers) {
  sessionHandlers = { ...sessionHandlers, ...handlers }
}

function buildUrl(path, params) {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }
  return url.pathname + url.search
}

async function parseBody(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

async function refreshAccessToken() {
  const refreshToken = sessionHandlers.getRefreshToken()
  if (!refreshToken) return false

  const response = await fetch(buildUrl('/api/v1/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) {
    sessionHandlers.clearSession()
    return false
  }

  const data = await parseBody(response)
  sessionHandlers.setTokens({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  })
  return true
}

async function request(path, { method = 'GET', params, body, auth = true, retry = true } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const accessToken = auth ? sessionHandlers.getAccessToken() : null
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const response = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401 && auth && retry) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    const refreshed = await refreshPromise
    if (refreshed) return request(path, { method, params, body, auth, retry: false })
  }

  const data = await parseBody(response)

  if (!response.ok) {
    const error = new Error(data?.message || `Error ${response.status}`)
    error.status = response.status
    error.parameter = data?.parameter
    error.data = data
    throw error
  }

  return data
}

export const apiClient = {
  baseUrl: BASE_URL,
  get: (path, params, options) => request(path, { method: 'GET', params, ...options }),
  post: (path, body, options) => request(path, { method: 'POST', body, ...options }),
  put: (path, body, options) => request(path, { method: 'PUT', body, ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body, ...options }),
  delete: (path, params, options) => request(path, { method: 'DELETE', params, ...options }),
}

export default apiClient
