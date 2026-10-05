import { leadDisplayTitle } from './pipelineLeads'

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function collectSearchText(lead, customer) {
  const parts = [
    lead?.id,
    lead?.name,
    lead?.company,
    lead?.phone,
    lead?.email,
    lead?.rawSnippet,
    leadDisplayTitle(lead),
    customer?.id,
    customer?.name,
    customer?.displayName,
    customer?.businessName,
    customer?.phone,
    customer?.email,
    customer?.documentId,
  ]
  return parts.filter(Boolean).join(' ')
}

export function leadMatchesQuery(lead, { customer = null }, query) {
  const trimmed = String(query || '').trim()
  if (!trimmed) return true

  const haystack = collectSearchText(lead, customer)
  const lowerHaystack = haystack.toLowerCase()
  const lowerQuery = trimmed.toLowerCase()
  if (lowerHaystack.includes(lowerQuery)) return true

  const queryDigits = digitsOnly(trimmed)
  if (queryDigits.length >= 3) {
    const digitHaystack = digitsOnly(haystack)
    if (digitHaystack.includes(queryDigits)) return true
  }

  return false
}

/** @deprecated */
export function opportunityMatchesQuery(opportunity, ctx, query) {
  const lead = ctx?.lead || opportunity
  return leadMatchesQuery(lead, { customer: ctx?.customer }, query)
}
