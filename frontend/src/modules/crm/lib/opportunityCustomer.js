export function opportunityCompanyLabel(opportunity) {
  if (!opportunity) return ''
  const raw = opportunity.customerName || opportunity.title || ''
  return raw.replace(/\s*[—-]\s*Oportunidad\s*$/i, '').trim()
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Match CRM customer from opportunity company name (B2B) or existing link. */
export function resolveCustomerForOpportunity(opportunity, customers = []) {
  if (!opportunity) return null
  if (opportunity.customerId) {
    return customers.find((customer) => customer.id === opportunity.customerId) || null
  }

  const label = opportunityCompanyLabel(opportunity)
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

export function effectiveOpportunityCustomerId(opportunity, customers = []) {
  if (!opportunity) return null
  if (opportunity.customerId) return opportunity.customerId
  return resolveCustomerForOpportunity(opportunity, customers)?.id || null
}
