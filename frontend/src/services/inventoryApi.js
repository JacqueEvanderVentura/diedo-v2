import { apiClient } from './apiClient'

const PAGE_SIZE = 200

const idempotencyOptions = () => ({
  headers: { 'Idempotency-Key': crypto.randomUUID() },
})

async function listAllItems(params = {}) {
  const first = await apiClient.get('/api/v1/inventory/items', {
    ...params,
    page: 1,
    pageSize: PAGE_SIZE,
  })
  const totalPages = Math.max(1, Number(first.totalPages) || 1)
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.get('/api/v1/inventory/items', {
            ...params,
            page: index + 2,
            pageSize: PAGE_SIZE,
          })
        )
      )
    : []

  return {
    ...first,
    items: [first, ...remaining].flatMap((page) => page.items || []),
  }
}

export const inventoryApi = {
  listItems: (params) => apiClient.get('/api/v1/inventory/items', params),
  listAllItems,
  createProduct: (payload) => apiClient.post('/api/v1/inventory/products', payload, idempotencyOptions()),
  createSupply: (payload) => apiClient.post('/api/v1/inventory/supplies', payload, idempotencyOptions()),
  createService: (payload) => apiClient.post('/api/v1/inventory/services', payload, idempotencyOptions()),
  updateItem: (id, payload) => apiClient.patch(`/api/v1/inventory/items/${id}`, payload),
}
