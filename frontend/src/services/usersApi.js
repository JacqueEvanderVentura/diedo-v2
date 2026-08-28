import { apiClient } from './apiClient'

export const usersApi = {
  list: (params) => apiClient.get('/api/v1/users', params),
  summary: () => apiClient.get('/api/v1/users/summary'),
  formOptions: () => apiClient.get('/api/v1/users/form-options'),
  create: (payload) => apiClient.post('/api/v1/users', payload),
}
