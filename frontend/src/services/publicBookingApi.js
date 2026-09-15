import { apiClient } from '@/services/apiClient'

const base = (branchId) => `/api/v1/public/booking/branches/${branchId}`
const publicGet = (path, options = {}) => apiClient.get(path, options.params, { auth: false })
const publicPost = (path, payload, options = {}) => apiClient.post(path, payload, { ...options, auth: false })

export const publicBookingApi = {
  sendBookingLink: (payload, idempotencyKey) => apiClient.post('/api/v1/agenda/booking-links/email', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
  getAppointment: (branchId, appointmentId, token) => publicGet(`${base(branchId)}/appointments/${appointmentId}`, { params: { token } }),
  managementSlots: (branchId, appointmentId, params) => publicGet(`${base(branchId)}/appointments/${appointmentId}/slots`, { params }),
  getContext: (branchId) => publicGet(`${base(branchId)}/context`),
  identify: (branchId, payload) => publicPost(`${base(branchId)}/identify`, payload),
  listSlots: (branchId, params) => publicGet(`${base(branchId)}/slots`, { params }),
  book: (branchId, payload, idempotencyKey) =>
    publicPost(`${base(branchId)}/appointments`, payload, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    }),
  getProfile: (branchId, params) => publicGet(`${base(branchId)}/me`, { params }),
  updateProfile: (branchId, payload) => apiClient.patch(`${base(branchId)}/profile`, payload, { auth: false }),
  cancelAppointment: (branchId, appointmentId, payload) =>
    publicPost(`${base(branchId)}/appointments/${appointmentId}/cancel`, payload),
  rescheduleAppointment: (branchId, appointmentId, payload) =>
    publicPost(`${base(branchId)}/appointments/${appointmentId}/reschedule`, payload),
}
