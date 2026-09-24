import { describe, expect, it } from 'vitest'
import { getAllowedBranches, isUuid, resolveActiveBranchId } from '../src/lib/workspaceBranch'

describe('workspaceBranch', () => {
  const branches = [
    { id: 'a', name: 'A', active: true },
    { id: 'b', name: 'B', active: true },
    { id: 'c', name: 'C', active: false },
  ]

  it('filters inactive branches and respects user scope', () => {
    expect(getAllowedBranches(branches, ['b']).map((b) => b.id)).toEqual(['b'])
    expect(getAllowedBranches(branches, []).map((b) => b.id)).toEqual(['a', 'b'])
  })

  it('resolves active branch from current, fallback, or first allowed', () => {
    expect(resolveActiveBranchId({
      branches,
      userBranchIds: ['a', 'b'],
      currentId: 'b',
      fallbackId: 'a',
    })).toBe('b')

    expect(resolveActiveBranchId({
      branches,
      userBranchIds: ['a'],
      currentId: 'b',
      fallbackId: 'a',
    })).toBe('a')
  })

  it('treats persisted demo slugs as not UUIDs', () => {
    expect(isUuid('charm-dn')).toBe(false)
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true)
  })
})
