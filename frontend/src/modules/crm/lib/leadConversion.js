import { resolveInstagramUrl } from './simplifiedOffer'

function resolveLeadCustomerType(lead) {
  const raw = String(lead?.customerType || lead?.type || lead?.segment || '').toLowerCase()
  if (['b2c', 'consumer', 'individual', 'persona'].some((token) => raw.includes(token))) {
    return { api: 'individual', offline: 'b2c' }
  }
  return { api: 'business', offline: 'b2b' }
}

/** Payload para convertir un lead en cliente (API + demo). */
export function buildLeadConvertRequest(lead) {
  const displayName = (lead?.company || lead?.name || '').trim()
  const customerType = resolveLeadCustomerType(lead).api
  return {
    version: lead.version,
    customerType,
    displayName,
    businessName: customerType === 'business' ? displayName : undefined,
    email: lead.email,
    phone: lead.phone,
    branchIds: lead.branchId ? [lead.branchId] : undefined,
    lifecycleStatus: 'prospecto',
    notes: lead.scoreNotes || null,
  }
}

export function buildLeadOfflineCustomer(lead) {
  const name = (lead?.company || lead?.name || '').trim()
  const customerType = resolveLeadCustomerType(lead).offline
  return {
    name,
    company: customerType === 'b2b' ? name : '',
    phone: lead.phone,
    email: lead.email,
    instagramUrl: resolveInstagramUrl(lead),
    notes: lead.scoreNotes || '',
    customerType,
    customerStatus: 'prospecto',
    branchId: lead.branchId,
    branchIds: lead.branchId ? [lead.branchId] : undefined,
    leadId: lead.id,
  }
}
