export const SALE_ORIGIN_FILTERS = [
  { id: 'all', label: 'Todos los orígenes' },
  { id: 'pos', label: 'POS' },
  { id: 'pipeline', label: 'Pipeline / CRM' },
]

export function saleOriginKey(sale) {
  if (!sale) return 'pos'
  const channelOrigin = sale.channelOrigin || sale.channel_origin
  if (
    sale.origin === 'pipeline'
    || sale.origin === 'crm'
    || sale.channel === 'crm'
    || channelOrigin === 'pipeline'
  ) {
    return 'pipeline'
  }
  return 'pos'
}

export function saleOriginLabel(sale) {
  return saleOriginKey(sale) === 'pipeline' ? 'Pipeline' : 'POS'
}

export function mergeCrmSalesLists(posSales = [], crmSales = []) {
  const byId = new Map()
  for (const sale of [...posSales, ...crmSales]) {
    if (!sale?.id) continue
    byId.set(sale.id, sale)
  }
  return [...byId.values()].sort(
    (left, right) => new Date(right.createdAt) - new Date(left.createdAt),
  )
}

export function saleDisplayReference(sale) {
  if (sale?.reference) return sale.reference
  if (sale?.number) return sale.number
  if (sale?.quoteId) return 'Cotización vinculada'
  return '—'
}
