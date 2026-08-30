import { apiClient } from './apiClient'

const PAGE_SIZE = 100

async function listAllProducts(params = {}) {
  const first = await apiClient.get('/api/v1/catalog/products', {
    ...params,
    page: 1,
    pageSize: PAGE_SIZE,
  })
  const totalPages = Math.max(1, Number(first.totalPages) || 1)
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.get('/api/v1/catalog/products', {
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

export const catalogApi = {
  listCategories: (params) => apiClient.get('/api/v1/catalog/categories', params),
  createCategory: (payload) => apiClient.post('/api/v1/catalog/categories', payload),
  updateCategory: (id, payload) => apiClient.patch(`/api/v1/catalog/categories/${id}`, payload),
  listProducts: (params) => apiClient.get('/api/v1/catalog/products', params),
  listAllProducts,
  createProduct: (payload) => apiClient.post('/api/v1/catalog/products', payload),
  updateProduct: (id, payload) => apiClient.patch(`/api/v1/catalog/products/${id}`, payload),
  listUnitsOfMeasure: () => apiClient.get('/api/v1/catalog/units-of-measure'),
}
