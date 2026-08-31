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

async function listAllAssets(params = {}) {
  const first = await apiClient.get('/api/v1/inventory/assets', {
    ...params,
    page: 1,
    pageSize: PAGE_SIZE,
  })
  const totalPages = Math.max(1, Number(first.totalPages) || 1)
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.get('/api/v1/inventory/assets', {
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

async function listAllMovements(params = {}) {
  const first = await apiClient.get('/api/v1/inventory/movements', {
    ...params,
    page: 1,
    pageSize: PAGE_SIZE,
  })
  const totalPages = Math.max(1, Number(first.totalPages) || 1)
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.get('/api/v1/inventory/movements', {
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
  listAssetCategories: () => apiClient.get('/api/v1/inventory/asset-categories'),
  getAssetSummary: (params) => apiClient.get('/api/v1/inventory/assets/summary', params),
  listAssets: (params) => apiClient.get('/api/v1/inventory/assets', params),
  listAllAssets,
  getAsset: (id) => apiClient.get(`/api/v1/inventory/assets/${id}`),
  createAsset: (payload) => apiClient.post('/api/v1/inventory/assets', payload, idempotencyOptions()),
  updateAsset: (id, payload) => apiClient.patch(`/api/v1/inventory/assets/${id}`, payload),
  listMovements: (params) => apiClient.get('/api/v1/inventory/movements', params),
  listAllMovements,
  getMovement: (id) => apiClient.get(`/api/v1/inventory/movements/${id}`),
  createOutboundMovement: (payload) => apiClient.post(
    '/api/v1/inventory/movements/outbound',
    payload,
    idempotencyOptions()
  ),
  createAdjustmentMovement: (payload) => apiClient.post(
    '/api/v1/inventory/movements/adjustments',
    payload,
    idempotencyOptions()
  ),
  getSupplyUsage: (params) => apiClient.get('/api/v1/inventory/supply-usage', params),
}
