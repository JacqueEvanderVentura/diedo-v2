import { resolvePeriodRange } from '@/lib/datePeriod'

export const SIMPLIFIED_WORKSPACE_DATE_PERIODS = [
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Este trimestre' },
  { id: 'all', label: 'Todo el historial' },
]

export const SIMPLIFIED_WORKSPACE_STAGES = [
  'nuevo',
  'contactado',
  'propuesta',
  'negociacion',
  'cerrado',
  'perdido',
]

export function defaultSimplifiedDateFilter() {
  return { period: 'week', dateFrom: null, dateTo: null }
}

export function buildSimplifiedOpportunityQuery({
  stage,
  page,
  pageSize,
  search,
  branchIds,
  dateFilter,
}) {
  const params = {
    stage,
    page,
    pageSize,
  }
  if (dateFilter?.period !== 'all') {
    const { start, end } = resolvePeriodRange(dateFilter || defaultSimplifiedDateFilter())
    params.updatedAfter = start.toISOString()
    params.updatedBefore = end.toISOString()
  }
  const q = (search || '').trim()
  if (q) params.search = q
  if (branchIds?.length) params.branchIds = branchIds
  return params
}
