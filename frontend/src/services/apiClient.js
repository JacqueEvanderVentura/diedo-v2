// Placeholder API client. Fase 1 is 100% mock — this never hits a real network,
// it only simulates latency so components can wire real endpoints later without changes.
import { ENDPOINTS } from './endpoints'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const MOCK_LATENCY = 350

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// registry of mock resolvers keyed by endpoint. Swap for real fetch() later.
const mockRegistry = new Map()

export function registerMock(endpoint, resolver) {
  mockRegistry.set(endpoint, resolver)
}

async function request(endpoint, { method = 'GET', params, body } = {}) {
  await delay(MOCK_LATENCY)
  const resolver = mockRegistry.get(endpoint)
  if (resolver) {
    return resolver({ method, params, body })
  }
  // Real implementation placeholder (unused in Fase 1):
  // const res = await fetch(`${BASE_URL}${endpoint}`, { method, ... })
  // return res.json()
  throw new Error(`No mock registered for endpoint: ${endpoint}`)
}

export const apiClient = {
  baseUrl: BASE_URL,
  endpoints: ENDPOINTS,
  get: (endpoint, params) => request(endpoint, { method: 'GET', params }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body }),
  delete: (endpoint, params) => request(endpoint, { method: 'DELETE', params }),
}

export default apiClient
