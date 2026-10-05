export function buildLeadHandoffPaths({ leadId, customerId }) {
  const inPipeline = Boolean(leadId)
  return {
    pipeline: inPipeline ? '/crm/pipeline' : null,
    quote: leadId
      ? `/crm/cotizaciones?leadId=${encodeURIComponent(leadId)}`
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
    customerId: lead.customerId || null,
  }
}
