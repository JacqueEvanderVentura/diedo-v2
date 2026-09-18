import { resolvePeriodRange } from '@/lib/datePeriod'

export const SIMPLIFIED_WORKSPACE_DATE_PERIODS = [
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Este trimestre' },
]

export const SIMPLIFIED_WORKSPACE_STAGES = [
  'nuevo',
  'contactado',
  'propuesta',
  'negociacion',
  'cerrado',
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
  const { start, end } = resolvePeriodRange(dateFilter || defaultSimplifiedDateFilter())
  const params = {
    stage,
    page,
    pageSize,
    updatedAfter: start.toISOString(),
    updatedBefore: end.toISOString(),
  }
  const q = (search || '').trim()
  if (q) params.search = q
  if (branchIds?.length) params.branchIds = branchIds
  return params
}
