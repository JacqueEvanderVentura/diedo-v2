import { isAgendaBookable } from '@/stores/catalogStore'

export function servicesForBranch(products, branchId, { online = false } = {}) {
  if (!branchId) return []
  return products.filter((product) => {
    if (!isAgendaBookable(product)) return false
    if (product.status === 'inactive' || product.status === 'archived') return false
    if (online && product.apiSynced !== true) return false
    const branchIds = Array.isArray(product.branchIds)
      ? product.branchIds
      : product.branchId
        ? [product.branchId]
        : []
    return branchIds.includes(branchId)
  })
}
