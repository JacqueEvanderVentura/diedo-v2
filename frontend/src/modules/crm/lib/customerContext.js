export function mergeSalesForCustomer(posSales, crmSales, customerId) {
  if (!customerId) return []
  const byId = new Map()
  for (const sale of [...posSales, ...crmSales]) {
    if (sale.customer?.id !== customerId) continue
    byId.set(sale.id, sale)
  }
  return [...byId.values()].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
  )
}

export function filterOpenOpportunities(opportunities, customerId) {
  return opportunities.filter(
    (row) => row.customerId === customerId && !['cerrado', 'perdido'].includes(row.stage),
  )
}

export function filterCustomerQuotes(quotes, customerId) {
  return quotes
    .filter((row) => row.customerId === customerId)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
}

export function filterPendingActivities(activities, customerId) {
  return activities
    .filter((row) => row.customerId === customerId && !row.completedAt)
    .sort((left, right) => new Date(left.dueAt || left.createdAt) - new Date(right.dueAt || right.createdAt))
}
