import { describe, expect, it } from 'vitest'
import {
  buildSimplifiedOpportunityQuery,
  defaultSimplifiedDateFilter,
  SIMPLIFIED_WORKSPACE_DATE_PERIODS,
  SIMPLIFIED_WORKSPACE_STAGES,
} from '@/modules/crm/lib/simplifiedWorkspaceQuery'

describe('simplifiedWorkspaceQuery', () => {
  it('defaults to the current week of updates', () => {
    const filter = defaultSimplifiedDateFilter()
    expect(filter.period).toBe('week')
    const params = buildSimplifiedOpportunityQuery({
      stage: 'propuesta',
      page: 2,
      pageSize: 25,
      search: '',
      branchIds: [],
      dateFilter: filter,
    })
    expect(params.stage).toBe('propuesta')
    expect(params.page).toBe(2)
    expect(params.pageSize).toBe(25)
    expect(params.updatedAfter).toBeTruthy()
    expect(params.updatedBefore).toBeTruthy()
  })

  it('passes search and branch filters', () => {
    const params = buildSimplifiedOpportunityQuery({
      stage: 'nuevo',
      page: 1,
      pageSize: 50,
      search: '809',
      branchIds: ['branch-a', 'branch-b'],
      dateFilter: defaultSimplifiedDateFilter(),
    })
    expect(params.search).toBe('809')
    expect(params.branchIds).toEqual(['branch-a', 'branch-b'])
  })

  it('incluye pérdidas y permite consultar todo el historial sin límites de fecha', () => {
    expect(SIMPLIFIED_WORKSPACE_STAGES).toContain('perdido')
    expect(SIMPLIFIED_WORKSPACE_DATE_PERIODS).toContainEqual({ id: 'all', label: 'Todo el historial' })
    const params = buildSimplifiedOpportunityQuery({
      stage: 'perdido', page: 1, pageSize: 25, search: '', branchIds: [],
      dateFilter: { period: 'all', dateFrom: null, dateTo: null },
    })
    expect(params).toMatchObject({ stage: 'perdido', page: 1, pageSize: 25 })
    expect(params).not.toHaveProperty('updatedAfter')
    expect(params).not.toHaveProperty('updatedBefore')
  })
})
