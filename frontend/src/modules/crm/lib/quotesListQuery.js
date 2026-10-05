import { resolvePeriodRange } from '@/lib/datePeriod'

export const QUOTES_DATE_PERIODS = [
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Este trimestre' },
  { id: 'all', label: 'Todo el historial' },
]

export function defaultQuotesDateFilter() {
  return { period: 'month', dateFrom: null, dateTo: null }
}

export function quotesUpdatedRange(dateFilter) {
  if (!dateFilter || dateFilter.period === 'all') return null
  return resolvePeriodRange(dateFilter)
}
