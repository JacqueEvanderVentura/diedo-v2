import { describe, expect, it } from 'vitest'
import {
  buildSimplifiedLeadQuery,
  countSimplifiedWorkspaceStageCounts,
  defaultSimplifiedDateFilter,
  needsSimplifiedWorkspaceClientFilter,
  SIMPLIFIED_WORKSPACE_DATE_PERIODS,
  SIMPLIFIED_WORKSPACE_STAGES,
} from '@/modules/crm/lib/simplifiedWorkspaceQuery'

describe('simplifiedWorkspaceQuery', () => {
  it('defaults to the current week of updates', () => {
    const filter = defaultSimplifiedDateFilter()
    expect(filter.period).toBe('week')
    const { params, dateFilter } = buildSimplifiedLeadQuery({
      stage: 'propuesta',
      page: 2,
      pageSize: 25,
      search: '',
      branchIds: [],
      dateFilter: filter,
    })
    expect(params.status).toBe('propuesta')
    expect(params.page).toBe(2)
    expect(params.pageSize).toBe(25)
    expect(dateFilter).toEqual(filter)
    expect(params).not.toHaveProperty('updatedAfter')
    expect(params).not.toHaveProperty('updatedBefore')
  })

  it('passes search and branch filters', () => {
    const { params, branchIds } = buildSimplifiedLeadQuery({
      stage: 'nuevo',
      page: 1,
      pageSize: 50,
      search: '809',
      branchIds: ['branch-a', 'branch-b'],
      dateFilter: defaultSimplifiedDateFilter(),
    })
    expect(params.search).toBe('809')
    expect(branchIds).toEqual(['branch-a', 'branch-b'])
    expect(params).not.toHaveProperty('branchIds')
  })

  it('incluye pérdidas y permite consultar todo el historial sin límites de fecha', () => {
    expect(SIMPLIFIED_WORKSPACE_STAGES).toContain('perdido')
    expect(SIMPLIFIED_WORKSPACE_DATE_PERIODS).toContainEqual({ id: 'all', label: 'Todo el historial' })
    const { params, dateFilter } = buildSimplifiedLeadQuery({
      stage: 'perdido', page: 1, pageSize: 25, search: '', branchIds: [],
      dateFilter: { period: 'all', dateFrom: null, dateTo: null },
    })
    expect(params).toMatchObject({ status: 'perdido', page: 1, pageSize: 25 })
    expect(dateFilter.period).toBe('all')
    expect(params).not.toHaveProperty('updatedAfter')
    expect(params).not.toHaveProperty('updatedBefore')
  })

  it('counts stages using the same filters as the workspace queue', () => {
    const now = new Date().toISOString()
    const old = '2020-01-01T12:00:00.000Z'
    const leads = [
      { id: '1', status: 'nuevo', name: 'DEMO', updatedAt: now, branchId: 'a' },
      { id: '2', status: 'nuevo', name: 'Otro', updatedAt: old, branchId: 'a' },
      { id: '3', status: 'contactado', name: 'DEMO', updatedAt: now, branchId: 'a' },
    ]
    const filters = { search: 'demo', branchIds: [], dateFilter: defaultSimplifiedDateFilter() }
    expect(needsSimplifiedWorkspaceClientFilter(filters)).toBe(true)
    expect(countSimplifiedWorkspaceStageCounts(leads, filters)).toEqual({
      nuevo: 1,
      contactado: 1,
      propuesta: 0,
      negociacion: 0,
      cerrado: 0,
      perdido: 0,
    })
  })
})
