import { apiClient } from '@/services/apiClient'

const base = '/api/v1/carwash'
export const carwashApi = {
  indicators: (branchId) => apiClient.get(`${base}/indicators`, { branchId }),
  reports: (params) => apiClient.get(`${base}/reports`, params),
  commissions: (params) => apiClient.get(`${base}/commissions`, params),
  commissionContext: (branchId) => apiClient.get(`${base}/commission-context`, { branchId }),
  settlements: (params) => apiClient.get(`${base}/settlements`, params),
  settlement: (id) => apiClient.get(`${base}/settlements/${id}`),
  settleCommissions: (payload, key) => apiClient.post(`${base}/settlements`, payload, { headers: { 'Idempotency-Key': key } }),
  reverseSettlement: (id, payload, key) => apiClient.post(`${base}/settlements/${id}/reverse`, payload, { headers: { 'Idempotency-Key': key } }),
  checkoutContext: (id) => apiClient.get(`${base}/washes/${id}/checkout-context`),
  previewWash: (id, payload) => apiClient.post(`${base}/washes/${id}/preview`, payload),
  billing: (id) => apiClient.get(`${base}/washes/${id}/billing`),
  operationContext: (branchId) => apiClient.get(`${base}/operation-context`, { branchId }),
  washOptions: (params) => apiClient.get(`${base}/wash-options`, params),
  washes: (params) => apiClient.get(`${base}/washes`, params),
  wash: (id) => apiClient.get(`${base}/washes/${id}`),
  createWash: (payload, key) => apiClient.post(`${base}/washes`, payload, { headers: { 'Idempotency-Key': key } }),
  updateWash: (id, payload) => apiClient.patch(`${base}/washes/${id}`, payload),
  washAction: (id, action, payload, key) => apiClient.post(`${base}/washes/${id}/${action}`, payload, { headers: { 'Idempotency-Key': key } }),
  list: (params) => apiClient.get(`${base}/services`, params),
  options: (params) => apiClient.get(`${base}/service-options`, params),
  formOptions: (branchId) => apiClient.get(`${base}/form-options`, { branchId }),
  get: (id) => apiClient.get(`${base}/services/${id}`),
  create: (payload, key) => apiClient.post(`${base}/services/batch`, payload, { headers: { 'Idempotency-Key': key } }),
  update: (id, payload) => apiClient.patch(`${base}/services/${id}`, payload),
}
