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

export function simplifiedLeadUpdatedRange(dateFilter) {
  if (!dateFilter || dateFilter.period === 'all') return null
  return resolvePeriodRange(dateFilter)
}

export function buildSimplifiedLeadQuery({
  stage,
  page,
  pageSize,
  search,
  branchIds,
  dateFilter,
}) {
  const params = {
    status: stage,
    page,
    pageSize,
    sort: 'updated_at',
    sortDir: 'desc',
  }
  const q = (search || '').trim()
  if (q) params.search = q
  if (branchIds?.length === 1) params.branchId = branchIds[0]
  const range = simplifiedLeadUpdatedRange(dateFilter)
  if (range) {
    params.updatedAfter = range.start.toISOString()
    params.updatedBefore = range.end.toISOString()
  }
  return { params, dateFilter, branchIds }
}

/** @deprecated */
export const buildSimplifiedOpportunityQuery = ({
  stage,
  page,
  pageSize,
  search,
  branchIds,
  dateFilter,
}) => {
  const { params } = buildSimplifiedLeadQuery({
    stage,
    page,
    pageSize,
    search,
    branchIds,
    dateFilter,
  })
  return { ...params, stage }
}

export function filterLeadsForSimplifiedWorkspace(leads, { branchIds = [], dateFilter } = {}) {
  const range = dateFilter?.period === 'all' ? null : resolvePeriodRange(dateFilter || defaultSimplifiedDateFilter())
  return (leads || []).filter((lead) => {
    if (branchIds?.length && !branchIds.includes(lead.branchId)) return false
    if (!range) return true
    const updated = new Date(lead.updatedAt || lead.createdAt || 0)
    return updated >= range.start && updated <= range.end
  })
}

export function needsSimplifiedWorkspaceClientFilter({ branchIds = [] } = {}) {
  return branchIds?.length > 1
}

export function matchesSimplifiedWorkspaceLeadSearch(lead, search = '') {
  const q = (search || '').trim().toLowerCase()
  if (!q) return true
  const title = (lead.company || lead.name || '').toLowerCase()
  const phone = (lead.phone || '').toLowerCase()
  return title.includes(q) || phone.includes(q)
}

export function leadsMatchingSimplifiedWorkspaceFilters(leads, { search = '', branchIds = [], dateFilter } = {}) {
  return filterLeadsForSimplifiedWorkspace(leads, { branchIds, dateFilter })
    .filter((lead) => matchesSimplifiedWorkspaceLeadSearch(lead, search))
}

export function countSimplifiedWorkspaceStageCounts(leads, { search = '', branchIds = [], dateFilter } = {}) {
  const stageCounts = Object.fromEntries(SIMPLIFIED_WORKSPACE_STAGES.map((id) => [id, 0]))
  leadsMatchingSimplifiedWorkspaceFilters(leads, { search, branchIds, dateFilter })
    .forEach((item) => {
      if (stageCounts[item.status] !== undefined) stageCounts[item.status] += 1
    })
  return stageCounts
}
