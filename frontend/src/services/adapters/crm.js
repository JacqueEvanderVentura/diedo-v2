import { mapSaleFromApi } from './pos'

const numberValue = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const items = (response) => response?.items || []

export function mapLeadFromApi(lead) {
  return {
    ...lead,
    assignedUserId: lead.assignedMembershipId,
    score: numberValue(lead.score),
    scoreAuto: numberValue(lead.scoreAuto),
    scoreManual: lead.scoreManual == null ? null : numberValue(lead.scoreManual),
    scoreNotes: lead.scoreNotes || '',
    rawSnippet: lead.rawSnippet || '',
    location: lead.location || '',
  }
}

export function mapOpportunityFromApi(opportunity) {
  return {
    ...opportunity,
    assignedUserId: opportunity.assignedMembershipId,
    value: numberValue(opportunity.value),
  }
}

export function mapActivityFromApi(activity) {
  return {
    ...activity,
    assignedUserId: activity.assignedMembershipId,
    description: activity.description || '',
    customerName: activity.customerName || '',
  }
}

export function mapCrmQuoteFromApi(record) {
  const quote = record?.quote || record
  const lines = quote?.lines || quote?.items || []
  return {
    id: quote.id,
    number: quote.number,
    opportunityId: record?.opportunityId || quote.opportunityId || null,
    customerId: quote.customer?.id || quote.customerId || null,
    customerName: quote.customer?.name || quote.customerName || 'Cliente sin nombre',
    branchId: quote.branch?.id || quote.branchId || null,
    status: record?.crmStatus || quote.crmStatus || 'borrador',
    structuralStatus: quote.status,
    total: numberValue(quote.total),
    items: lines.map((line) => ({
      id: line.id || line.itemId,
      itemId: line.itemId,
      name: line.name || line.itemName,
      qty: numberValue(line.quantity ?? line.qty),
      price: numberValue(line.unitPrice ?? line.price),
    })),
    validUntil: quote.dueAt || quote.expiresAt || null,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt || quote.createdAt,
    version: quote.version,
  }
}

export function mapCrmCustomerFromApi(customer) {
  const branches = customer.branches || []
  return {
    id: customer.id,
    name: customer.displayName,
    displayName: customer.displayName,
    businessName: customer.businessName,
    phone: customer.phone,
    email: customer.email,
    customerType: customer.customerType === 'business' ? 'b2b' : 'b2c',
    customerStatus: customer.lifecycleStatus,
    points: numberValue(customer.loyaltyPoints),
    notes: customer.notes || '',
    branchId: branches[0]?.id || null,
    branchIds: branches.map((branch) => branch.id),
    branches,
    purchaseCount: numberValue(customer.purchaseCount),
    totalSpent: numberValue(customer.totalSpent),
    lastPurchaseAt: customer.lastPurchaseAt,
    profileVersion: customer.profileVersion,
    version: customer.version,
    status: customer.masterStatus,
    active: customer.masterStatus === 'active',
    source: 'api',
  }
}

export function mapCrmStateFromApi(state) {
  return {
    leads: (state?.leads || []).map(mapLeadFromApi),
    opportunities: (state?.opportunities || []).map(mapOpportunityFromApi),
    activities: (state?.activities || []).map(mapActivityFromApi),
    quotes: (state?.quotes || []).map(mapCrmQuoteFromApi),
    scoringWeights: state?.settings?.weights || {},
    scoringVersion: state?.settings?.version || 1,
  }
}

export function mapLeadsPageFromApi(response) {
  return items(response).map(mapLeadFromApi)
}

export function mapOpportunitiesPageFromApi(response) {
  return items(response).map(mapOpportunityFromApi)
}

export function mapActivitiesPageFromApi(response) {
  return items(response).map(mapActivityFromApi)
}

export function mapCrmQuotesPageFromApi(response) {
  return items(response).map(mapCrmQuoteFromApi)
}

export function mapCrmOverviewFromApi(response) {
  if (!response) return null
  return {
    ...response,
    pipelineValue: numberValue(response.pipelineValue),
    salesValueThisMonth: numberValue(response.salesValueThisMonth),
  }
}

export function mapCrmCustomersPageFromApi(response) {
  return items(response).map(mapCrmCustomerFromApi)
}

export function mapCrmSalesPageFromApi(response) {
  return items(response).map(mapSaleFromApi)
}
