import { apiClient } from '@/services/apiClient'
import { slotHoldHeaders } from '@/modules/agenda/lib/slotHoldToken'

const base = (branchId) => `/api/v1/public/booking/branches/${branchId}`
const publicGet = (path, options = {}) =>
  apiClient.get(path, options.params, { auth: false, headers: options.headers })
const publicPost = (path, payload, options = {}) => apiClient.post(path, payload, { ...options, auth: false })

export const publicBookingApi = {
  sendBookingLink: (payload, idempotencyKey) => apiClient.post('/api/v1/agenda/booking-links/email', payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  }),
  getAppointment: (branchId, appointmentId, token) => publicGet(`${base(branchId)}/appointments/${appointmentId}`, { params: { token } }),
  managementSlots: (branchId, appointmentId, params) => publicGet(`${base(branchId)}/appointments/${appointmentId}/slots`, { params }),
  getEntryContext: (branchId) => publicGet('/api/v1/public/booking/context', {
    params: branchId ? { branchId } : undefined,
  }),
  getContext: (branchId) => publicGet(`${base(branchId)}/context`),
  identify: (branchId, payload) => publicPost(`${base(branchId)}/identify`, payload),
  listSlots: (branchId, params) => {
    const query = { ...params }
    if (!query.employeeId) delete query.employeeId
    if (!query.documentId) delete query.documentId
    if (!query.documentType) delete query.documentType
    return publicGet(`${base(branchId)}/slots`, {
      params: query,
      headers: slotHoldHeaders(),
    })
  },
  listAvailability: (branchId, params) => {
    const query = { ...params }
    if (!query.employeeId) delete query.employeeId
    return publicGet(`${base(branchId)}/availability`, { params: query })
  },
  claimSlotHold: (branchId, payload) =>
    publicPost(`${base(branchId)}/slot-holds`, payload, { headers: slotHoldHeaders() }),
  releaseSlotHold: (branchId) =>
    apiClient.delete(`${base(branchId)}/slot-holds`, undefined, { auth: false, headers: slotHoldHeaders() }),
  book: (branchId, payload, idempotencyKey) =>
    publicPost(`${base(branchId)}/appointments`, payload, {
      headers: {
        ...slotHoldHeaders(),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
    }),
  getProfile: (branchId, params) => publicGet(`${base(branchId)}/me`, { params }),
  updateProfile: (branchId, payload) => apiClient.patch(`${base(branchId)}/profile`, payload, { auth: false }),
  cancelAppointment: (branchId, appointmentId, payload) =>
    publicPost(`${base(branchId)}/appointments/${appointmentId}/cancel`, payload),
  rescheduleAppointment: (branchId, appointmentId, payload) =>
    publicPost(`${base(branchId)}/appointments/${appointmentId}/reschedule`, payload),
}
