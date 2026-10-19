export function leadCompanyLabel(lead) {
  if (!lead) return ''
  return (lead.company || lead.name || '').trim()
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveCustomerForLead(lead, customers = []) {
  if (!lead) return null
  if (lead.customerId) {
    return customers.find((customer) => customer.id === lead.customerId) || null
  }

  const label = leadCompanyLabel(lead)
  if (!label) return null
  const target = normalizeName(label)

  const pool = customers.filter((customer) => !customer.isDefault)
  const exact = pool.find((customer) => normalizeName(customer.name) === target)
  if (exact) return exact

  return pool.find((customer) => {
    const name = normalizeName(customer.name)
    return name.includes(target) || target.includes(name)
  }) || null
}

export function effectiveLeadCustomerId(lead, customers = []) {
  if (!lead) return null
  if (lead.customerId) return lead.customerId
  return resolveCustomerForLead(lead, customers)?.id || null
}

/** @deprecated Use lead-based helpers */
export const opportunityCompanyLabel = leadCompanyLabel
export const resolveCustomerForOpportunity = resolveCustomerForLead
export const effectiveOpportunityCustomerId = effectiveLeadCustomerId
