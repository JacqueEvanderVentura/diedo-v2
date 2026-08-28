import { apiClient } from './apiClient'

export const catalogApi = {
  listCategories: (params) => apiClient.get('/api/v1/catalog/categories', params),
  createCategory: (payload) => apiClient.post('/api/v1/catalog/categories', payload),
  updateCategory: (id, payload) => apiClient.patch(`/api/v1/catalog/categories/${id}`, payload),
  listProducts: (params) => apiClient.get('/api/v1/catalog/products', params),
  createProduct: (payload) => apiClient.post('/api/v1/catalog/products', payload),
  updateProduct: (id, payload) => apiClient.patch(`/api/v1/catalog/products/${id}`, payload),
  listUnitsOfMeasure: () => apiClient.get('/api/v1/catalog/units-of-measure'),
}
