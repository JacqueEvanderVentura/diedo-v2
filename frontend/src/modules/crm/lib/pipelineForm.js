export function opportunityCustomerDefaults(opportunity) {
  const name = opportunity?.customerName?.trim() || ''
  return {
    name,
    company: name,
    customerType: 'b2b',
    branchIds: opportunity?.branchId ? [opportunity.branchId] : [],
  }
}

export function isOpportunityCreateReady(form) {
  return Boolean(
    form.title?.trim()
    && form.customerName?.trim()
    && form.branchId,
  )
}

export function customersForOpportunityBranch(customers = [], branchId) {
  if (!branchId) return customers
  return customers.filter((customer) => {
    const branchIds = customer.branchIds?.length
      ? customer.branchIds
      : [customer.branchId].filter(Boolean)
    return branchIds.includes(branchId)
  })
}
