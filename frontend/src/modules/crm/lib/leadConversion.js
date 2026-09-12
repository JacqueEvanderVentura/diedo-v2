/** Payload para convertir un lead en cliente B2B (API + demo). */
export function buildLeadConvertRequest(lead) {
  const displayName = (lead?.company || lead?.name || '').trim()
  return {
    version: lead.version,
    customerType: 'business',
    displayName,
    businessName: displayName,
    email: lead.email,
    phone: lead.phone,
    branchIds: lead.branchId ? [lead.branchId] : undefined,
    lifecycleStatus: 'prospecto',
    notes: lead.scoreNotes || null,
  }
}

export function buildLeadOfflineCustomer(lead) {
  const name = (lead?.company || lead?.name || '').trim()
  return {
    name,
    company: name,
    phone: lead.phone,
    email: lead.email,
    notes: lead.scoreNotes || '',
    customerType: 'b2b',
    customerStatus: 'prospecto',
    branchId: lead.branchId,
    branchIds: lead.branchId ? [lead.branchId] : undefined,
    leadId: lead.id,
  }
}
