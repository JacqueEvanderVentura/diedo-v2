import { buildLeadOfflineCustomer } from './leadConversion'
import { leadCustomerDefaults } from './pipelineForm'

export async function ensureCustomerForLeadQuote({
  lead,
  addCustomer,
  updateLead,
}) {
  if (!lead?.id) return null
  if (lead.customerId) {
    return { id: lead.customerId, leadId: lead.id }
  }
  const branchId = lead.branchId
  if (!branchId) return null
  const customer = await addCustomer({
    ...buildLeadOfflineCustomer(lead),
    branchId,
  })
  return { id: customer.id, leadId: lead.id }
}

export async function ensureCustomerForQuote({
  customerId,
  lead,
  addCustomer,
  updateLead,
}) {
  if (customerId) {
    return { id: customerId }
  }
  if (!lead) return null

  const defaults = leadCustomerDefaults(lead)
  const name = defaults.name?.trim()
  const branchId = defaults.branchIds?.[0] || lead.branchId
  if (!name || !branchId) return null

  const customer = await addCustomer({
    ...defaults,
    branchId,
    customerStatus: 'prospecto',
  })

  return customer
}

export async function syncLeadPipelineValue({ leadId, total, updateLead }) {
  if (!leadId || !updateLead || !Number.isFinite(total)) return
  await updateLead(leadId, { pipelineValue: total })
}
