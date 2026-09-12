import { apiClient } from '@/services/apiClient'

const base = (branchId) => `/api/v1/public/booking/branches/${branchId}`

export const publicBookingApi = {
  getContext: (branchId) => apiClient.get(`${base(branchId)}/context`),
  identify: (branchId, payload) => apiClient.post(`${base(branchId)}/identify`, payload),
  listSlots: (branchId, params) => apiClient.get(`${base(branchId)}/slots`, { params }),
  book: (branchId, payload, idempotencyKey) =>
    apiClient.post(`${base(branchId)}/appointments`, payload, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    }),
  getProfile: (branchId, params) => apiClient.get(`${base(branchId)}/me`, { params }),
  updateProfile: (branchId, payload) => apiClient.patch(`${base(branchId)}/profile`, payload),
  cancelAppointment: (branchId, appointmentId, payload) =>
    apiClient.post(`${base(branchId)}/appointments/${appointmentId}/cancel`, payload),
  rescheduleAppointment: (branchId, appointmentId, payload) =>
    apiClient.post(`${base(branchId)}/appointments/${appointmentId}/reschedule`, payload),
}
