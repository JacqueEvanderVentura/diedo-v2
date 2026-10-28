export function leadCompanyLabel(lead) {
  if (!lead) return ''
  return (lead.company || lead.name || '').trim()
}

export function normalizePartyName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function linkedQuoteCustomerId(lead, quotes = []) {
  const linked = (quotes || [])
    .filter((quote) => quote.leadId === lead.id && quote.customerId && quote.customerId !== 'walk-in')
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))
  return linked[0]?.customerId || null
}

/** Customer explicitly linked to the lead, or the customer of its latest quote. Never guessed by name. */
export function effectiveLeadCustomerId(lead, quotes = []) {
  if (!lead) return null
  if (lead.customerId) return lead.customerId
  return linkedQuoteCustomerId(lead, quotes)
}

export function resolveCustomerForLead(lead, customers = [], quotes = []) {
  const customerId = effectiveLeadCustomerId(lead, quotes)
  if (!customerId) return null
  return customers.find((customer) => customer.id === customerId) || null
}

/** @deprecated Use lead-based helpers */
export const opportunityCompanyLabel = leadCompanyLabel
export const resolveCustomerForOpportunity = resolveCustomerForLead
export const effectiveOpportunityCustomerId = effectiveLeadCustomerId
