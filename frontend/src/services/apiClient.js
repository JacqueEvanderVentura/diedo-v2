const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api-backend'
const BASE_URL_IS_ABSOLUTE = /^[a-z][a-z\d+.-]*:\/\//i.test(BASE_URL)

let sessionHandlers = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  setTokens: () => {},
  clearSession: () => {},
}

let refreshPromise = null
const REFRESH_LOCK_NAME = 'erp-auth-refresh'

export function bindSessionHandlers(handlers) {
  sessionHandlers = { ...sessionHandlers, ...handlers }
}

function buildUrl(path, params) {
  const base = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL
  const apiPath = path.startsWith('/') ? path : `/${path}`
  const url = new URL(`${base}${apiPath}`, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
  }
  return BASE_URL_IS_ABSOLUTE ? url.href : url.pathname + url.search
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

async function requestRefreshedAccessToken({ retryConflict = false } = {}) {
  const request = () => fetch(buildUrl('/api/v1/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
  })
  let response = await request()

  // Browsers without Web Locks can still collide with a rotation in another
  // tab. Give the winning response time to install its Set-Cookie, then retry
  // once with that shared cookie.
  if (response.status === 401 && retryConflict) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    response = await request()
  }

  if (!response.ok) {
    sessionHandlers.clearSession()
    return false
  }

  const data = await parseBody(response)
  sessionHandlers.setTokens({
    accessToken: data.accessToken,
  })
  return true
}

async function refreshAccessToken() {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(
      REFRESH_LOCK_NAME,
      { mode: 'exclusive' },
      () => requestRefreshedAccessToken()
    )
  }
  return requestRefreshedAccessToken({ retryConflict: true })
}

async function request(path, { method = 'GET', params, body, headers: extraHeaders = {}, auth = true, retry = true } = {}) {
  const headers = { Accept: 'application/json', ...extraHeaders }
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'

  const accessToken = auth ? sessionHandlers.getAccessToken() : null
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const response = await fetch(buildUrl(path, params), {
    method,
    headers,
    body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    credentials: 'include',
  })

  if (response.status === 401 && auth && retry) {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    const refreshed = await refreshPromise
    if (refreshed) return request(path, { method, params, body, headers: extraHeaders, auth, retry: false })
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
  upload: (path, formData, options) => request(path, { method: 'POST', body: formData, ...options }),
  refreshSession: refreshAccessToken,
}

export default apiClient
