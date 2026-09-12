import { opportunityCustomerDefaults } from './pipelineForm'

/**
 * Crea o resuelve cliente CRM para persistir una cotización cuando solo hay oportunidad/prospecto.
 */
export async function ensureCustomerForQuote({
  customerId,
  opportunity,
  addCustomer,
  updateOpportunity,
}) {
  if (customerId) {
    return { id: customerId }
  }
  if (!opportunity) return null

  const defaults = opportunityCustomerDefaults(opportunity)
  const name = defaults.name?.trim()
  const branchId = defaults.branchIds?.[0] || opportunity.branchId
  if (!name || !branchId) return null

  const customer = await addCustomer({
    ...defaults,
    branchId,
    customerStatus: 'prospecto',
  })

  if (updateOpportunity && opportunity.id) {
    await updateOpportunity(opportunity.id, {
      customerId: customer.id,
      customerName: customer.name,
    })
  }

  return customer
}
