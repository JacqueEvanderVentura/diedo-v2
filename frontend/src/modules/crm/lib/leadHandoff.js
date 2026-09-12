export function buildLeadHandoffPaths({ opportunityId, customerId }) {
  return {
    pipeline: opportunityId ? '/crm/pipeline' : null,
    quote: opportunityId
      ? `/crm/cotizaciones?opportunityId=${encodeURIComponent(opportunityId)}`
      : customerId
        ? `/crm/cotizaciones?customerId=${encodeURIComponent(customerId)}`
        : null,
    customer: customerId
      ? `/crm/clientes?customerId=${encodeURIComponent(customerId)}`
      : null,
  }
}

export function readLeadHandoffContext(leads, leadId) {
  const lead = leads.find((row) => row.id === leadId)
  if (!lead) return null
  return {
    leadId,
    opportunityId: lead.opportunityId || null,
    customerId: lead.customerId || null,
  }
}
