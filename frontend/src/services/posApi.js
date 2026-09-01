import { apiClient } from './apiClient'

const POS_BASE = '/api/v1/pos'

export function createPosIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

const idempotencyOptions = (idempotencyKey) => ({
  headers: { 'Idempotency-Key': idempotencyKey || createPosIdempotencyKey() },
})

function paymentFormData(payload) {
  const formData = new FormData()
  const fields = {
    amount: payload.amount,
    methodId: payload.methodId,
    reference: payload.reference,
    note: payload.note,
    registerId: payload.registerId,
    version: payload.version,
  }
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, String(value))
    }
  })
  if (payload.proof) formData.append('file', payload.proof, payload.proof.name)
  return formData
}

function proofFormData(payload) {
  const formData = new FormData()
  formData.append('file', payload.file, payload.file.name)
  return formData
}

async function postWithLegacyFallback(primaryPath, fallbackPath, payload, options) {
  try {
    return await apiClient.post(primaryPath, payload, options)
  } catch (error) {
    if (![404, 405].includes(error.status) || !fallbackPath) throw error
    return apiClient.post(fallbackPath, payload, options)
  }
}

function proofUrl(proofOrUrl) {
  if (typeof proofOrUrl === 'string' && proofOrUrl.startsWith('/')) return proofOrUrl
  if (proofOrUrl?.downloadUrl) return proofOrUrl.downloadUrl
  const paymentId = typeof proofOrUrl === 'string' ? proofOrUrl : proofOrUrl?.paymentId
  if (!paymentId) throw new Error('El comprobante no tiene una URL de descarga válida.')
  return `${POS_BASE}/payments/${paymentId}/proof`
}

export const posApi = {
  state: (params) => apiClient.get(`${POS_BASE}/state`, params),
  paymentMethods: () => apiClient.get('/api/v1/payment-methods'),
  listRegisters: (params) => apiClient.get(`${POS_BASE}/registers`, params),
  getRegister: (registerId) => apiClient.get(`${POS_BASE}/registers/${registerId}`),
  listRegisterMovements: (registerId, params) => apiClient.get(
    `${POS_BASE}/registers/${registerId}/movements`,
    params
  ),

  openRegister: (payload, { idempotencyKey } = {}) => postWithLegacyFallback(
    `${POS_BASE}/registers`,
    `${POS_BASE}/registers/open`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),
  closeRegister: (registerId, payload, { idempotencyKey } = {}) => apiClient.post(
    `${POS_BASE}/registers/${registerId}/close`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),
  createRegisterMovement: (registerId, payload, { idempotencyKey } = {}) => apiClient.post(
    `${POS_BASE}/registers/${registerId}/movements`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),

  checkout: (payload, { idempotencyKey } = {}) => apiClient.post(
    `${POS_BASE}/checkout`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),

  listQuotes: (params) => apiClient.get(`${POS_BASE}/quotes`, params),
  quotesSummary: (params) => apiClient.get(`${POS_BASE}/quotes/summary`, params),
  getQuote: (quoteId) => apiClient.get(`${POS_BASE}/quotes/${quoteId}`),
  createQuote: (payload, { idempotencyKey } = {}) => apiClient.post(
    `${POS_BASE}/quotes`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),
  updateQuote: (quoteId, payload, { idempotencyKey } = {}) => apiClient.patch(
    `${POS_BASE}/quotes/${quoteId}`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),
  cancelQuote: (quoteId, payload, { idempotencyKey } = {}) => apiClient.post(
    `${POS_BASE}/quotes/${quoteId}/cancel`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),

  listSales: (params) => apiClient.get(`${POS_BASE}/sales`, params),
  getSale: (saleId) => apiClient.get(`${POS_BASE}/sales/${saleId}`),
  voidSale: (saleId, payload, { idempotencyKey } = {}) => apiClient.post(
    `${POS_BASE}/sales/${saleId}/void`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),

  listReceivables: (params) => apiClient.get(`${POS_BASE}/receivables`, params),
  receivablesSummary: (params) => apiClient.get(`${POS_BASE}/receivables/summary`, params),
  getReceivable: (receivableId) => apiClient.get(`${POS_BASE}/receivables/${receivableId}`),
  updateReceivable: (receivableId, payload, { idempotencyKey } = {}) => apiClient.patch(
    `${POS_BASE}/receivables/${receivableId}`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),
  createReceivablePayment: (receivableId, payload, { idempotencyKey } = {}) => apiClient.upload(
    `${POS_BASE}/receivables/${receivableId}/payments`,
    paymentFormData(payload),
    idempotencyOptions(idempotencyKey)
  ),
  uploadReceivableProof: (receivableId, payload, { idempotencyKey } = {}) => apiClient.upload(
    `${POS_BASE}/receivables/${receivableId}/proofs`,
    proofFormData(payload),
    idempotencyOptions(idempotencyKey)
  ),
  voidReceivable: (receivableId, payload, { idempotencyKey } = {}) => {
    const options = idempotencyOptions(idempotencyKey)
    return postWithLegacyFallback(
      `${POS_BASE}/receivables/${receivableId}/cancel`,
      `${POS_BASE}/receivables/${receivableId}/void`,
      payload,
      options
    )
  },
  reversePayment: (paymentId, payload, { idempotencyKey } = {}) => apiClient.post(
    `${POS_BASE}/payments/${paymentId}/reverse`,
    payload,
    idempotencyOptions(idempotencyKey)
  ),
  downloadProof: (proofOrUrl) => apiClient.blob(proofUrl(proofOrUrl)),
}

export default posApi
