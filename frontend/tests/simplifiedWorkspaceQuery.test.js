import { describe, expect, it } from 'vitest'
import {
  buildSimplifiedOpportunityQuery,
  defaultSimplifiedDateFilter,
} from '@/modules/crm/lib/simplifiedWorkspaceQuery'

describe('simplifiedWorkspaceQuery', () => {
  it('defaults to last 28 days of updates', () => {
    const filter = defaultSimplifiedDateFilter()
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
    const start = new Date(params.updatedAfter)
    const end = new Date(params.updatedBefore)
    const diffDays = Math.round((end - start) / 86400000)
    expect(diffDays).toBeGreaterThanOrEqual(27)
    expect(diffDays).toBeLessThanOrEqual(28)
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
})
