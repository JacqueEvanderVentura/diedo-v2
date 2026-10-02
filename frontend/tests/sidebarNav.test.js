import { describe, expect, it } from 'vitest'
import { BACKOFFICE_NAV } from '@/data/navigation'
import { deriveOpenNavGroups, isNavGroupActive } from '@/lib/sidebarNav'

describe('sidebarNav', () => {
  it('opens backoffice sub-routes by default via alwaysExpanded', () => {
    expect(deriveOpenNavGroups([BACKOFFICE_NAV], '/login')).toEqual({ backoffice: true })
  })

  it('detects active backoffice child routes', () => {
    expect(isNavGroupActive(BACKOFFICE_NAV, '/backoffice/companias')).toBe(true)
    expect(isNavGroupActive(BACKOFFICE_NAV, '/backoffice/companias/ws-1')).toBe(true)
  })
})
