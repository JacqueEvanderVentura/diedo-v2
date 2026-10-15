import { resolveInstagramUrl } from './simplifiedOffer'

export function leadHasDocument(lead) {
  return Boolean(String(lead?.documentId || '').trim())
}

function resolveLeadCustomerType(lead) {
  const raw = String(lead?.customerType || lead?.type || lead?.segment || '').toLowerCase()
  if (['b2c', 'consumer', 'individual', 'persona'].some((token) => raw.includes(token))) {
    return { api: 'individual', offline: 'b2c' }
  }
  return { api: 'business', offline: 'b2b' }
}

function resolveConversionDocument(lead, documentOverride = null) {
  const docType = documentOverride?.docType
    ?? documentOverride?.documentType
    ?? lead?.docType
    ?? lead?.documentType
    ?? 'cedula'
  const documentId = String(
    documentOverride?.documentId ?? lead?.documentId ?? '',
  ).trim()
  return { docType, documentId }
}

/** Payload para convertir un lead en cliente (API + demo). */
export function buildLeadConvertRequest(lead, documentOverride = null) {
  const displayName = (lead?.company || lead?.name || '').trim()
  const customerType = resolveLeadCustomerType(lead).api
  const { docType, documentId } = resolveConversionDocument(lead, documentOverride)
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
    documentType: docType,
    documentId,
  }
}

export function buildLeadOfflineCustomer(lead, documentOverride = null) {
  const name = (lead?.company || lead?.name || '').trim()
  const customerType = resolveLeadCustomerType(lead).offline
  const { docType, documentId } = resolveConversionDocument(lead, documentOverride)
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
    docType,
    documentId,
  }
}
