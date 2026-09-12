import { applyBranchFilter } from '@/lib/branches'
import { ACQUISITION_SOURCE_LABELS } from '@/data/crm'
import { filterByPeriod } from './reportes'

export const SALE_CHANNEL_META = {
  crm: { id: 'crm', label: 'Ventas (CRM)', color: '#8b5cf6' },
  pos: { id: 'pos', label: 'Comercio (POS)', color: '#3b82f6' },
}

const SOCIAL_SOURCES = new Set(['whatsapp', 'instagram'])
const IN_STORE_SOURCES = new Set(['pos_walk_in'])

export function classifySaleChannel(sale) {
  const origin = sale?.origin || sale?.quoteOrigin
  if (sale?.channel === 'crm' || origin === 'crm' || origin === 'pipeline') {
    return 'crm'
  }
  return 'pos'
}

export function acquisitionBucket(source, channel) {
  if (!source) return channel === 'pos' ? 'pos_walk_in' : 'unknown'
  if (IN_STORE_SOURCES.has(source)) return 'pos_walk_in'
  if (SOCIAL_SOURCES.has(source)) return 'social'
  if (source === 'referral') return 'referral'
  if (source === 'app' || source === 'self_booking') return 'app'
  if (source === 'otros') return 'otros'
  return 'otros'
}

export const ACQUISITION_BUCKET_LABELS = {
  pos_walk_in: 'Comercio / mostrador',
  social: 'Redes sociales',
  referral: 'Referidos',
  app: 'App Helios 360',
  otros: ACQUISITION_SOURCE_LABELS.otros,
  unknown: 'Sin origen',
}

export const ACQUISITION_BUCKET_COLORS = {
  pos_walk_in: '#3b82f6',
  social: '#22c55e',
  referral: '#f59e0b',
  app: '#a855f7',
  otros: '#64748b',
  unknown: '#94a3b8',
}

function saleTotal(sale) {
  return Number(sale?.total) || 0
}

function saleCustomerId(sale) {
  return sale?.customer?.id || sale?.customerId || null
}

function scopedSales(sales, params) {
  const branchScoped = applyBranchFilter(sales, {
    branchId: params.branchId,
    branchIds: params.branchIds,
  })
  return filterByPeriod(
    branchScoped.filter((sale) => sale?.status !== 'voided'),
    params.period,
    (sale) => sale.createdAt || sale.completedAt,
    params,
  )
}

export function buildConsolidatedReport({ sales = [], customers = [] }, params = {}) {
  const customerById = Object.fromEntries((customers || []).map((customer) => [customer.id, customer]))
  const rows = scopedSales(sales, params)

  const channels = {
    crm: { id: 'crm', amount: 0, count: 0, people: new Set() },
    pos: { id: 'pos', amount: 0, count: 0, people: new Set() },
  }
  const acquisitions = {}

  rows.forEach((sale, index) => {
    const channel = classifySaleChannel(sale)
    const personKey = saleCustomerId(sale) || `anon:${sale.id || index}`
    channels[channel].amount += saleTotal(sale)
    channels[channel].count += 1
    channels[channel].people.add(personKey)

    const customerId = saleCustomerId(sale)
    const source = customerId ? customerById[customerId]?.acquisitionSource : null
    const bucket = acquisitionBucket(source, channel)
    if (!acquisitions[bucket]) {
      acquisitions[bucket] = { id: bucket, amount: 0, count: 0, people: new Set() }
    }
    acquisitions[bucket].amount += saleTotal(sale)
    acquisitions[bucket].count += 1
    acquisitions[bucket].people.add(personKey)
  })

  const salesByChannel = Object.values(channels).map((row) => ({
    id: row.id,
    amount: row.amount,
    count: row.count,
    customers: row.people.size,
    label: SALE_CHANNEL_META[row.id].label,
    color: SALE_CHANNEL_META[row.id].color,
  }))

  const salesByAcquisition = Object.values(acquisitions)
    .map((row) => ({
      id: row.id,
      label: ACQUISITION_BUCKET_LABELS[row.id] || row.id,
      color: ACQUISITION_BUCKET_COLORS[row.id] || '#64748b',
      amount: row.amount,
      count: row.count,
      customers: row.people.size,
    }))
    .sort((left, right) => right.amount - left.amount)

  const totalAmount = salesByChannel.reduce((sum, row) => sum + row.amount, 0)

  return {
    totalAmount,
    totalSales: rows.length,
    salesByChannel,
    salesByAcquisition,
  }
}

export function mapConsolidatedFromApi(data) {
  const salesByChannel = (data?.salesByChannel || data?.sales_by_channel || []).map((row) => ({
    id: row.id,
    label: row.label || row.name || SALE_CHANNEL_META[row.id]?.label || row.id,
    color: row.color || SALE_CHANNEL_META[row.id]?.color || '#64748b',
    amount: Number(row.amount) || 0,
    count: Number(row.count) || 0,
    customers: Number(row.customers) || 0,
  }))
  const salesByAcquisition = (data?.salesByAcquisition || data?.sales_by_acquisition || []).map((row) => ({
    id: row.id,
    label: row.label || row.name || ACQUISITION_BUCKET_LABELS[row.id] || row.id,
    color: row.color || ACQUISITION_BUCKET_COLORS[row.id] || '#64748b',
    amount: Number(row.amount) || 0,
    count: Number(row.count) || 0,
    customers: Number(row.customers) || 0,
  }))
  return {
    totalAmount: Number(data?.totalAmount ?? data?.total_amount) || 0,
    totalSales: Number(data?.totalSales ?? data?.total_sales) || 0,
    salesByChannel,
    salesByAcquisition,
  }
}
