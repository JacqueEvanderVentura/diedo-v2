import { apiClient } from './apiClient'

export const usersApi = {
  list: (params) => apiClient.get('/api/v1/users', params),
  summary: () => apiClient.get('/api/v1/users/summary'),
  formOptions: () => apiClient.get('/api/v1/users/form-options'),
  create: (payload) => apiClient.post('/api/v1/users', payload),
  get: (membershipId) => apiClient.get(`/api/v1/users/${membershipId}`),
  update: (membershipId, payload) => apiClient.patch(`/api/v1/users/${membershipId}`, payload),
  invite: (payload) => apiClient.post('/api/v1/users/invitations', payload),
  acceptInvitation: (token, password) =>
    apiClient.post('/api/v1/users/invitations/accept', { token, password }, { auth: false, retry: false }),
  revokeInvitation: (invitationId) => apiClient.delete(`/api/v1/users/invitations/${invitationId}`),
  resetPassword: (membershipId, newPassword) =>
    apiClient.post(`/api/v1/users/${membershipId}/password-reset`, { newPassword }),
}
