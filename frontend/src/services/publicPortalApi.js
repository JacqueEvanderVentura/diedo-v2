import { apiClient } from '@/services/apiClient'

const base = (branchId) => `/api/v1/public/portal/branches/${branchId}`
const publicGet = (path, params) => apiClient.get(path, params, { auth: false })
const publicPost = (path, payload) => apiClient.post(path, payload, { auth: false })

function docParams(session) {
  return {
    documentType: session.docType,
    documentId: session.documentId,
  }
}

function invoicePdfPath(branchId, saleId) {
  return `${base(branchId)}/invoices/${saleId}/pdf`
}

function resolvePublicApiUrl(path, params) {
  const apiBase = (apiClient.baseUrl || '/api-backend').replace(/\/$/, '')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const root = /^https?:\/\//i.test(apiBase)
    ? apiBase
    : `${origin}${apiBase.startsWith('/') ? apiBase : `/${apiBase}`}`
  const query = params ? `?${new URLSearchParams(params)}` : ''
  return `${root}${path}${query}`
}

async function readPdfBlob(blob) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('La factura llegó vacía.')
  }
  const type = (blob.type || '').toLowerCase()
  if (type.includes('pdf') || type === 'application/octet-stream') return blob
  let message = 'No se pudo cargar la factura.'
  try {
    const payload = JSON.parse(await blob.text())
    if (payload?.message) message = payload.message
  } catch {
    // non-JSON error body
  }
  throw new Error(message)
}

export const publicPortalApi = {
  me: (branchId, session) => publicGet(`${base(branchId)}/me`, docParams(session)),
  register: (branchId, payload) => publicPost(`${base(branchId)}/register`, payload),
  listAppointments: (branchId, session) => publicGet(`${base(branchId)}/appointments`, docParams(session)),
  listReceivables: (branchId, session) => publicGet(`${base(branchId)}/receivables`, docParams(session)),
  listPayments: (branchId, session) => publicGet(`${base(branchId)}/payments`, docParams(session)),
  listInvoices: (branchId, session) => publicGet(`${base(branchId)}/invoices`, docParams(session)),
  invoicePdfUrl: (branchId, saleId, session) => resolvePublicApiUrl(
    invoicePdfPath(branchId, saleId),
    docParams(session),
  ),
  fetchInvoicePdf: async (branchId, saleId, session) => readPdfBlob(
    await apiClient.blob(invoicePdfPath(branchId, saleId), {
      params: docParams(session),
      auth: false,
    }),
  ),
}
