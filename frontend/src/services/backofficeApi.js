import { apiClient } from './apiClient'

export const backofficeApi = {
  context: () => apiClient.get('/api/v1/backoffice/context'),
  listWorkspaces: () => apiClient.get('/api/v1/backoffice/workspaces'),
  getWorkspace: (workspaceId) => apiClient.get(`/api/v1/backoffice/workspaces/${workspaceId}`),
  createWorkspace: (payload) => apiClient.post('/api/v1/backoffice/workspaces', payload),
  updateWorkspace: (workspaceId, payload) =>
    apiClient.patch(`/api/v1/backoffice/workspaces/${workspaceId}`, payload),
  listPlans: () => apiClient.get('/api/v1/backoffice/plans'),
  updatePlan: (planId, payload) => apiClient.patch(`/api/v1/backoffice/plans/${planId}`, payload),
  listModules: () => apiClient.get('/api/v1/backoffice/modules'),
  getOverview: () => apiClient.get('/api/v1/backoffice/overview'),
  listUsers: (params = {}) => {
    const query = new URLSearchParams()
    if (params.search) query.set('search', params.search)
    if (params.workspaceId) query.set('workspaceId', params.workspaceId)
    if (params.status) query.set('status', params.status)
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return apiClient.get(`/api/v1/backoffice/users${suffix}`)
  },
  listWorkspaceMembers: (workspaceId) =>
    apiClient.get(`/api/v1/backoffice/workspaces/${workspaceId}/members`),
  createUser: (payload) => apiClient.post('/api/v1/backoffice/users', payload),
  updateUser: (userId, payload) => apiClient.patch(`/api/v1/backoffice/users/${userId}`, payload),
}
