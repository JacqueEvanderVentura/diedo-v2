import { describe, expect, it } from 'vitest'
import {
  ACL_LABELS,
  accessButtonClass,
  cycleResourceAccess,
  sortResources,
} from '@/modules/configuracion/lib/agendaCabinas'
import { boundsForDate } from '@/modules/agenda/lib/branchOpeningHours'

describe('agendaCabinas helpers', () => {
  it('cycles acl states', () => {
    expect(cycleResourceAccess(null)).toBe('view')
    expect(cycleResourceAccess('view')).toBe('use')
    expect(cycleResourceAccess('use')).toBe(null)
  })

  it('styles access buttons', () => {
    expect(accessButtonClass('use')).toContain('emerald')
    expect(accessButtonClass('view')).toContain('blue')
    expect(accessButtonClass(null)).toContain('slate')
  })

  it('sorts resources by sortOrder', () => {
    const sorted = sortResources([
      { id: 'b', name: 'B', sortOrder: 2 },
      { id: 'a', name: 'A', sortOrder: 1 },
    ])
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('exposes acl labels', () => {
    expect(ACL_LABELS.none).toBe('Sin acceso')
  })
})

describe('branchOpeningHours', () => {
  it('uses configured day bounds', () => {
    const bounds = boundsForDate(
      [{ weekday: 'mon', opensAt: '09:00', closesAt: '18:00' }],
      '2026-09-14',
    )
    expect(bounds.startHour).toBe(9)
    expect(bounds.endHour).toBe(18)
    expect(bounds.closed).toBe(false)
  })

  it('falls back when no hours configured', () => {
    const bounds = boundsForDate([], '2026-09-14')
    expect(bounds.startHour).toBe(8)
    expect(bounds.endHour).toBe(20)
  })
})
