import { describe, expect, it } from 'vitest'
import { nextSelectAllState } from '@/lib/listSelection'

describe('nextSelectAllState', () => {
  it('selects all when not fully selected', () => {
    const next = nextSelectAllState(new Set(['a']), ['a', 'b'])
    expect([...next].sort()).toEqual(['a', 'b'])
  })

  it('clears when all are selected', () => {
    const next = nextSelectAllState(new Set(['a', 'b']), ['a', 'b'])
    expect(next.size).toBe(0)
  })
})
