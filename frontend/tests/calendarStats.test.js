import { describe, expect, it } from 'vitest'
import {
  computeCalendarStats,
  rangeKeysForView,
} from '@/modules/agenda/lib/calendarStats'

const base = (overrides = {}) => ({
  id: '1',
  date: '2026-10-15',
  status: 'confirmada',
  branchId: 'b1',
  ...overrides,
})

describe('computeCalendarStats', () => {
  it('month range uses calendar month days only', () => {
    const appointments = [
      base({ id: 'a', date: '2026-09-30' }),
      base({ id: 'b', date: '2026-10-01' }),
      base({ id: 'c', date: '2026-10-31' }),
      base({ id: 'd', date: '2026-11-01' }),
    ]
    const keys = rangeKeysForView('month', '2026-10-05')
    expect(keys).toContain('2026-10-01')
    expect(keys).not.toContain('2026-09-30')

    const stats = computeCalendarStats({
      appointments,
      view: 'month',
      cursor: '2026-10-05',
    })
    expect(stats.total).toBe(2)
    expect(stats.pending).toBe(2)
    expect(stats.rangeScopeLabel).toBe('del mes visible')
  })

  it('breaks down statuses in week range', () => {
    const appointments = [
      base({ id: 'a', date: '2026-10-05', status: 'confirmada' }),
      base({ id: 'b', date: '2026-10-06', status: 'cumplida' }),
      base({ id: 'c', date: '2026-10-07', status: 'cancelada' }),
      base({ id: 'd', date: '2026-10-08', status: 'noshow' }),
      base({ id: 'e', date: '2026-11-01', status: 'confirmada' }),
    ]
    const stats = computeCalendarStats({
      appointments,
      view: 'week',
      cursor: '2026-10-08',
    })
    expect(stats.total).toBe(4)
    expect(stats.pending).toBe(1)
    expect(stats.completed).toBe(1)
    expect(stats.cancelled).toBe(1)
    expect(stats.noShow).toBe(1)
  })

  it('counts all statuses on day view including cancelled', () => {
    const appointments = [
      base({ id: 'a', date: '2026-10-10' }),
      base({ id: 'b', date: '2026-10-10', status: 'cancelada' }),
      base({ id: 'c', date: '2026-10-11' }),
    ]
    const stats = computeCalendarStats({
      appointments,
      view: 'day',
      cursor: '2026-10-10',
    })
    expect(stats.total).toBe(2)
    expect(stats.pending).toBe(1)
    expect(stats.cancelled).toBe(1)
  })
})
