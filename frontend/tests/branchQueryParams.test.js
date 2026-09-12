import { describe, expect, it } from 'vitest'
import { branchQueryParams } from '@/lib/branches'

describe('branchQueryParams', () => {
  it('returns empty object when no branch is selected', () => {
    expect(branchQueryParams('all', [])).toEqual({})
    expect(branchQueryParams(null, null)).toEqual({})
  })

  it('returns branchId for a single selection', () => {
    expect(branchQueryParams('all', ['branch-a'])).toEqual({ branchId: 'branch-a' })
    expect(branchQueryParams('branch-b', [])).toEqual({ branchId: 'branch-b' })
  })

  it('returns branchIds array for multiple selections', () => {
    expect(branchQueryParams('all', ['branch-a', 'branch-b'])).toEqual({
      branchIds: ['branch-a', 'branch-b'],
    })
  })
})
