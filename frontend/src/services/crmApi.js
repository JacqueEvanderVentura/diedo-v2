import { apiClient } from './apiClient'

const CRM_BASE = '/api/v1/crm'

export function createCrmIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `crm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

const idempotencyOptions = (key) => ({
  headers: { 'Idempotency-Key': key || createCrmIdempotencyKey() },
})

export const crmApi = {
  state: (params) => apiClient.get(`${CRM_BASE}/state`, params),
  overview: (params) => apiClient.get(`${CRM_BASE}/overview`, params),
  leads: (params) => apiClient.get(`${CRM_BASE}/leads`, params),
  opportunities: (params) => apiClient.get(`${CRM_BASE}/opportunities`, params),
  activities: (params) => apiClient.get(`${CRM_BASE}/activities`, params),
  customers: (params) => apiClient.get(`${CRM_BASE}/customers`, params),
  quotes: (params) => apiClient.get(`${CRM_BASE}/quotes`, params),
  sales: (params) => apiClient.get(`${CRM_BASE}/sales`, params),
  scoring: () => apiClient.get(`${CRM_BASE}/settings/scoring`),
  discoveryCapabilities: () => apiClient.get(`${CRM_BASE}/discovery/capabilities`),
  searchDiscovery: (payload) => apiClient.post(`${CRM_BASE}/discovery/search`, payload),
  updateScoring: (payload) => apiClient.patch(`${CRM_BASE}/settings/scoring`, payload),

  createLead: (payload, key) => apiClient.post(
    `${CRM_BASE}/leads`,
    payload,
    idempotencyOptions(key)
  ),
  importLeads: (payload, key) => apiClient.post(
    `${CRM_BASE}/leads/import`,
    payload,
    idempotencyOptions(key)
  ),
  updateLead: (leadId, payload) => apiClient.patch(`${CRM_BASE}/leads/${leadId}`, payload),
  convertLead: (leadId, payload, key) => apiClient.post(
    `${CRM_BASE}/leads/${leadId}/convert`,
    payload,
    idempotencyOptions(key)
  ),
  createLeadOpportunity: (leadId, payload, key) => apiClient.post(
    `${CRM_BASE}/leads/${leadId}/opportunity`,
    payload,
    idempotencyOptions(key)
  ),

  createOpportunity: (payload, key) => apiClient.post(
    `${CRM_BASE}/opportunities`,
    payload,
    idempotencyOptions(key)
  ),
  updateOpportunity: (opportunityId, payload) => apiClient.patch(
    `${CRM_BASE}/opportunities/${opportunityId}`,
    payload
  ),

  createActivity: (payload, key) => apiClient.post(
    `${CRM_BASE}/activities`,
    payload,
    idempotencyOptions(key)
  ),
  updateActivity: (activityId, payload) => apiClient.patch(
    `${CRM_BASE}/activities/${activityId}`,
    payload
  ),
  completeActivity: (activityId, version) => apiClient.post(
    `${CRM_BASE}/activities/${activityId}/complete`,
    { version }
  ),
  reopenActivity: (activityId, version) => apiClient.post(
    `${CRM_BASE}/activities/${activityId}/reopen`,
    { version }
  ),

  createQuote: (payload, key) => apiClient.post(
    `${CRM_BASE}/quotes`,
    payload,
    idempotencyOptions(key)
  ),
  updateQuote: (quoteId, payload) => apiClient.patch(`${CRM_BASE}/quotes/${quoteId}`, payload),
  cancelQuote: (quoteId, version, reason = 'Cancelada desde CRM') => apiClient.post(
    `${CRM_BASE}/quotes/${quoteId}/cancel`,
    { version, reason }
  ),
}

export default crmApi
