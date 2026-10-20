/** @typedef {'b2b' | 'b2c'} LeadCustomerType */

export function inferLeadCustomerType(lead) {
  if (lead?.customerType === 'b2b' || lead?.customerType === 'b2c') {
    return lead.customerType
  }
  const name = String(lead?.name || '').trim()
  const company = String(lead?.company || '').trim()
  if (company && (!name || company.toLowerCase() !== name.toLowerCase())) return 'b2b'
  if (company && !name) return 'b2b'
  return 'b2c'
}

export function buildLeadSubmitPayload(form) {
  const customerType = form.customerType === 'b2b' ? 'b2b' : 'b2c'
  const name = form.name.trim()
  const company = form.company.trim()

  if (customerType === 'b2c') {
    if (!name) {
      return { error: 'Indica el nombre del cliente' }
    }
    return {
      customerType,
      name,
      company: '',
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      website: null,
      instagramUrl: form.instagramUrl.trim() || null,
      location: form.location.trim() || null,
      acquisitionSource: form.acquisitionSource || null,
    }
  }

  if (!name && !company) {
    return { error: 'Indica la empresa o el contacto' }
  }
  return {
    customerType,
    name,
    company: company || name,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    website: form.website.trim() || null,
    instagramUrl: form.instagramUrl.trim() || null,
    location: form.location.trim() || null,
    acquisitionSource: form.acquisitionSource || null,
  }
}
