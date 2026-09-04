import { describe, expect, it } from 'vitest'
import { resolveFeatureFlag } from '@/config/features'

describe('production feature flags', () => {
  it('defaults unfinished features off in production', () => {
    expect(resolveFeatureFlag(undefined, true)).toBe(false)
  })

  it('keeps local development convenient unless explicitly disabled', () => {
    expect(resolveFeatureFlag(undefined, false)).toBe(true)
    expect(resolveFeatureFlag('false', false)).toBe(false)
  })

  it('allows an explicit production activation after acceptance', () => {
    expect(resolveFeatureFlag('true', true)).toBe(true)
  })
})
