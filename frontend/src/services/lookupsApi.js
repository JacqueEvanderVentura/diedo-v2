import { apiClient } from './apiClient'

export const lookupsApi = {
  roles: () => apiClient.get('/api/v1/lookups/roles'),
  branches: () => apiClient.get('/api/v1/lookups/branches'),
}
