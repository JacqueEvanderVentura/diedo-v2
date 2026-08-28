import { apiClient } from './apiClient'

export const authApi = {
  login: (email, password) =>
    apiClient.post('/api/v1/auth/login', { email, password }, { auth: false, retry: false }),

  refresh: (refreshToken) =>
    apiClient.post('/api/v1/auth/refresh', { refreshToken }, { auth: false, retry: false }),

  logout: () => apiClient.post('/api/v1/auth/logout'),

  me: () => apiClient.get('/api/v1/auth/me'),
}
