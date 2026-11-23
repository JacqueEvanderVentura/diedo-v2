import { apiClient } from './apiClient'

export function listNotifications({ page = 1, pageSize = 10 } = {}) {
  return apiClient.get('/api/v1/notifications', { page, pageSize })
}

export function markNotificationRead(id) {
  return apiClient.post(`/api/v1/notifications/${id}/read`)
}

export function markAllNotificationsRead() {
  return apiClient.post('/api/v1/notifications/read-all')
}