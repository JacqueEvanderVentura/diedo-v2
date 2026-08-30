import { apiClient } from './apiClient'

export const authApi = {
  login: (email, password) =>
    apiClient.post('/api/v1/auth/login', { email, password }, { auth: false, retry: false }),

  refresh: () => apiClient.refreshSession(),

  logout: () => apiClient.post('/api/v1/auth/logout'),

  me: () => apiClient.get('/api/v1/auth/me'),
  workspaces: () => apiClient.get('/api/v1/auth/workspaces'),
  switchWorkspace: (workspaceId) => apiClient.post('/api/v1/auth/switch-workspace', { workspaceId }),
  changePassword: (currentPassword, newPassword) =>
    apiClient.post('/api/v1/auth/change-password', { currentPassword, newPassword }),
  updateProfile: (displayName) => apiClient.patch('/api/v1/auth/profile', { displayName }),
  sessions: () => apiClient.get('/api/v1/auth/sessions'),
  revokeSession: (sessionId) => apiClient.delete(`/api/v1/auth/sessions/${sessionId}`),
}
