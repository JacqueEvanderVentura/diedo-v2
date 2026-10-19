export function quotePartyLabel(party, { leads = [], customers = [] } = {}) {
  if (!party?.id) return ''
  if (party.type === 'customer') {
    const customer = customers.find((item) => item.id === party.id)
    return customer?.name || ''
  }
  const lead = leads.find((item) => item.id === party.id)
  return (lead?.company || lead?.name || '').trim()
}

export function filterQuoteParties({ query, leads, customers, branchId }) {
  const q = query.trim().toLowerCase()
  const matchText = (text) => !q || String(text || '').toLowerCase().includes(q)

  const leadRows = (leads || [])
    .filter((lead) => !['perdido'].includes(lead.status))
    .filter((lead) => !branchId || lead.branchId === branchId)
    .filter((lead) => matchText(lead.name) || matchText(lead.company) || matchText(lead.phone))
    .map((lead) => ({
      type: 'lead',
      id: lead.id,
      title: (lead.company || lead.name || 'Lead sin nombre').trim(),
      subtitle: lead.phone || lead.email || '',
      badge: 'Lead',
    }))

  const customerRows = (customers || [])
    .filter((customer) => !customer.isDefault)
    .filter((customer) => {
      if (!branchId) return true
      const ids = customer.branchIds?.length ? customer.branchIds : [customer.branchId].filter(Boolean)
      return ids.includes(branchId)
    })
    .filter((customer) => matchText(customer.name) || matchText(customer.phone) || matchText(customer.company))
    .map((customer) => ({
      type: 'customer',
      id: customer.id,
      title: customer.name,
      subtitle: customer.phone || customer.email || '',
      badge: 'Cliente',
    }))

  return [...leadRows, ...customerRows].sort((a, b) => a.title.localeCompare(b.title, 'es'))
}
