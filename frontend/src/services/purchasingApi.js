import { apiClient } from './apiClient'

const PAGE_SIZE = 200

const idempotencyOptions = () => ({
  headers: { 'Idempotency-Key': crypto.randomUUID() },
})

async function listAll(path, params = {}) {
  const first = await apiClient.get(path, { ...params, page: 1, pageSize: PAGE_SIZE })
  const totalPages = Math.max(1, Number(first.totalPages) || 1)
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.get(path, { ...params, page: index + 2, pageSize: PAGE_SIZE })
        )
      )
    : []

  return {
    ...first,
    items: [first, ...remaining].flatMap((page) => page.items || []),
  }
}

export const purchasingApi = {
  listSuppliers: (params) => apiClient.get('/api/v1/purchasing/suppliers', params),
  listAllSuppliers: (params) => listAll('/api/v1/purchasing/suppliers', params),
  createSupplier: (payload) => apiClient.post(
    '/api/v1/purchasing/suppliers',
    payload,
    idempotencyOptions()
  ),
  updateSupplier: (id, payload) => apiClient.patch(`/api/v1/purchasing/suppliers/${id}`, payload),
  deleteSupplier: (id) => apiClient.delete(`/api/v1/purchasing/suppliers/${id}`),

  listRequests: (params) => apiClient.get('/api/v1/purchasing/requests', params),
  listAllRequests: (params) => listAll('/api/v1/purchasing/requests', params),
  getRequestStats: (params) => apiClient.get('/api/v1/purchasing/requests/stats', params),
  createRequest: (payload) => apiClient.post(
    '/api/v1/purchasing/requests',
    payload,
    idempotencyOptions()
  ),
  updateRequest: (id, payload) => apiClient.patch(`/api/v1/purchasing/requests/${id}`, payload),
  reviewRequest: (id, payload) => apiClient.post(
    `/api/v1/purchasing/requests/${id}/review`,
    payload
  ),
  deliverRequest: (id, payload) => apiClient.post(
    `/api/v1/purchasing/requests/${id}/deliver`,
    payload
  ),

  getSettings: () => apiClient.get('/api/v1/purchasing/settings'),
  listApprovers: () => apiClient.get('/api/v1/purchasing/settings/approvers'),
  updateSettings: (payload) => apiClient.put('/api/v1/purchasing/settings', payload),
}
