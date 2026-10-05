import { mapSaleFromApi } from './pos'

const numberValue = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const items = (response) => response?.items || []

export function mapLeadFromApi(lead) {
  const starRating = lead.starRating
  return {
    ...lead,
    createdAt: lead.createdAt || lead.created_at,
    updatedAt: lead.updatedAt || lead.updated_at,
    assignedUserId: lead.assignedMembershipId,
    starRating: starRating == null || starRating === '' ? null : Number(starRating),
    rawSnippet: lead.rawSnippet || '',
    location: lead.location || '',
    pipelineValue: numberValue(lead.pipelineValue),
    lostReason: lead.lostReason || null,
    pipelineClosedAt: lead.pipelineClosedAt || null,
    customerId: lead.customerId || null,
  }
}

export function mapActivityFromApi(activity) {
  return {
    ...activity,
    assignedUserId: activity.assignedMembershipId,
    description: activity.description || '',
    customerName: activity.customerName || '',
    leadId: activity.leadId || null,
  }
}

export function mapCrmQuoteFromApi(record) {
  const quote = record?.quote || record
  const lines = quote?.lines || quote?.items || []
  return {
    id: quote.id,
    number: quote.number,
    leadId: record?.leadId || record?.lead_id || quote.leadId || quote.lead_id || null,
    customerId: quote.customer?.id || quote.customerId || null,
    customerName: quote.customer?.name || quote.customerName || 'Cliente sin nombre',
    branchId: quote.branch?.id || quote.branchId || null,
    status: record?.crmStatus || quote.crmStatus || 'borrador',
    structuralStatus: quote.status,
    total: numberValue(quote.total),
    items: lines.map((line) => ({
      id: line.id || line.itemId || line.item?.id,
      itemId: line.itemId || line.item?.id,
      name: line.name || line.itemName || line.item?.name || 'Ítem sin nombre',
      qty: numberValue(line.quantity ?? line.qty),
      price: numberValue(line.unitPrice ?? line.price),
    })),
    validUntil: quote.dueAt || quote.expiresAt || null,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt || quote.createdAt,
    version: quote.version,
    convertedSaleId:
      record?.convertedSaleId
      || record?.converted_sale_id
      || quote.convertedSaleId
      || quote.converted_sale_id
      || null,
    invoiceNumber:
      record?.invoiceNumber
      || record?.invoice_number
      || quote.invoiceNumber
      || quote.invoice_number
      || null,
    receivableId:
      record?.receivableId
      || record?.receivable_id
      || null,
    invoiceCollection:
      record?.invoiceCollection
      || record?.invoice_collection
      || null,
    revisions: (quote.revisions || []).map((revision) => ({
      revision: revision.revision,
      event: revision.event,
      occurredAt: revision.occurredAt || revision.occurred_at,
      snapshot: revision.snapshot || {},
    })),
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
    instagramUrl: customer.instagramUrl || null,
    customerType: customer.customerType === 'business' ? 'b2b' : 'b2c',
    customerStatus: customer.lifecycleStatus,
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
    activities: (state?.activities || []).map(mapActivityFromApi),
    quotes: (state?.quotes || []).map(mapCrmQuoteFromApi),
    uiMode: state?.settings?.uiMode || 'standard',
    uiModeVersion: state?.settings?.version || 1,
  }
}

export function mapLeadsPageFromApi(response) {
  return items(response).map(mapLeadFromApi)
}

export function mapLeadsPaginatedFromApi(response) {
  const totalItems = Number(response?.totalItems ?? response?.total_items ?? 0)
  const pageSize = Number(response?.pageSize ?? response?.page_size ?? 50)
  const page = Number(response?.page ?? 1)
  const totalPages = Number(
    response?.totalPages ?? response?.total_pages ?? Math.max(1, Math.ceil(totalItems / pageSize))
  )
  return {
    items: mapLeadsPageFromApi(response),
    page,
    pageSize,
    totalItems,
    totalPages,
  }
}

export function mapActivitiesPageFromApi(response) {
  return items(response).map(mapActivityFromApi)
}

export function mapCrmQuotesPageFromApi(response) {
  return items(response).map(mapCrmQuoteFromApi)
}

export function mapQuotesPaginatedFromApi(response) {
  const totalItems = Number(response?.totalItems ?? response?.total_items ?? 0)
  const pageSize = Number(response?.pageSize ?? response?.page_size ?? 50)
  const page = Number(response?.page ?? 1)
  const totalPages = Number(
    response?.totalPages ?? response?.total_pages ?? Math.max(1, Math.ceil(totalItems / pageSize))
  )
  return {
    items: mapCrmQuotesPageFromApi(response),
    page,
    pageSize,
    totalItems,
    totalPages,
  }
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

export function mapCrmCustomersPaginatedFromApi(response) {
  const totalItems = Number(response?.totalItems ?? response?.total_items ?? 0)
  const pageSize = Number(response?.pageSize ?? response?.page_size ?? 50)
  const page = Number(response?.page ?? 1)
  const totalPages = Number(
    response?.totalPages ?? response?.total_pages ?? Math.max(1, Math.ceil(totalItems / pageSize))
  )
  return {
    items: mapCrmCustomersPageFromApi(response),
    page,
    pageSize,
    totalItems,
    totalPages,
  }
}

export function mapCrmSalesPageFromApi(response) {
  return items(response).map(mapSaleFromApi)
}
