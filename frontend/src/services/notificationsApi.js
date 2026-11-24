import { apiClient } from './apiClient'

export function listNotifications({ page = 1, pageSize = 10 } = {}) {
  return apiClient.get('/api/v1/notifications', { page, pageSize })
}

export function markNotificationRead(id) {
  return apiClient.post(`/api/v1/notifications/${id}/read`)
}

/** Resolves the booking link for an abandoned booking at click time (date/time dropped when stale). */
export function getSlotHoldResumeLink(id) {
  return apiClient.get(`/api/v1/notifications/${id}/slot-hold-resume`)
}

export function markAllNotificationsRead() {
  return apiClient.post('/api/v1/notifications/read-all')
}