import { apiClient } from './apiClient'

export const permissionsApi = {
  listRoles: () => apiClient.get('/api/v1/roles'),
  roleSummary: () => apiClient.get('/api/v1/roles/summary'),
  matrix: () => apiClient.get('/api/v1/permissions/matrix'),
  replaceBatch: (payload) => apiClient.put('/api/v1/roles/permissions:batch', payload),
  replaceRolePermissions: (roleId, payload) =>
    apiClient.put(`/api/v1/roles/${roleId}/permissions`, payload),
}
