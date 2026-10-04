import { buildLeadOfflineCustomer } from './leadConversion'
import { opportunityCustomerDefaults } from './pipelineForm'

const CLOSED_OPPORTUNITY_STAGES = new Set(['cerrado', 'perdido'])

export function isOpenOpportunity(opportunity) {
  return Boolean(opportunity?.id && !CLOSED_OPPORTUNITY_STAGES.has(opportunity.stage))
}

/** Oportunidades abiertas del mismo cliente o lead en la sucursal indicada. */
export function findOpenOpportunitiesForQuote({
  opportunities = [],
  customerId = null,
  leadId = null,
  branchId = null,
}) {
  return opportunities.filter((opportunity) => {
    if (!isOpenOpportunity(opportunity)) return false
    if (branchId && opportunity.branchId && opportunity.branchId !== branchId) return false
    if (leadId && opportunity.leadId === leadId) return true
    if (customerId && opportunity.customerId === customerId) return true
    return false
  })
}

export function pickMostRecentOpportunity(opportunities = []) {
  if (!opportunities.length) return null
  return [...opportunities].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return tb - ta
  })[0]
}

/**
 * Resuelve opportunityId al crear una cotización (reutilizar abierta o crear en Propuesta).
 * Al editar, no reasigna el trato.
 */
export async function resolveOpportunityForQuote({
  editing = false,
  explicitOpportunityId = null,
  opportunities = [],
  customerId = null,
  leadId = null,
  lead = null,
  branchId = null,
  customerName = '',
  items = [],
  total = 0,
  addOpportunity,
  updateOpportunity,
  assignedUserId = null,
}) {
  if (editing) {
    return explicitOpportunityId || null
  }
  if (explicitOpportunityId) {
    return explicitOpportunityId
  }

  const open = findOpenOpportunitiesForQuote({
    opportunities,
    customerId,
    leadId,
    branchId,
  })
  const existing = pickMostRecentOpportunity(open)
  if (existing?.id) {
    if (updateOpportunity && Number.isFinite(total)) {
      await updateOpportunity(existing.id, { value: total })
    }
    return existing.id
  }

  const firstItemName = items[0]?.name?.trim() || 'Cotización'
  const partyName = customerName?.trim() || lead?.company?.trim() || lead?.name?.trim() || 'Cliente'
  const created = await addOpportunity({
    title: `${partyName} — ${firstItemName}`,
    customerName: partyName,
    customerId: customerId || null,
    leadId: leadId || null,
    stage: 'propuesta',
    value: total,
    branchId,
    assignedUserId,
    notes: '',
  })
  return created?.id || null
}

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

export async function ensureCustomerForLeadQuote({
  lead,
  opportunities = [],
  addCustomer,
  updateOpportunity,
}) {
  if (!lead?.id) return null
  const opportunity = opportunities.find((item) => item.leadId === lead.id)
  if (opportunity?.customerId) {
    return { id: opportunity.customerId, opportunityId: opportunity.id }
  }
  const branchId = lead.branchId || opportunity?.branchId
  if (!branchId) return null
  const customer = await addCustomer({
    ...buildLeadOfflineCustomer(lead),
    branchId,
  })
  if (updateOpportunity && opportunity?.id) {
    await updateOpportunity(opportunity.id, {
      customerId: customer.id,
      customerName: customer.name,
    })
  }
  return { id: customer.id, opportunityId: opportunity?.id || null }
}
