import { describe, expect, it } from 'vitest'
import { computeCalendarStats } from '@/modules/agenda/lib/calendarStats'

const base = (overrides = {}) => ({
  id: '1',
  date: '2026-10-15',
  status: 'confirmada',
  branchId: 'b1',
  ...overrides,
})

describe('computeCalendarStats', () => {
  it('counts month by calendar month, not month grid spillover', () => {
    const appointments = [
      base({ id: 'a', date: '2026-09-30' }),
      base({ id: 'b', date: '2026-10-01' }),
      base({ id: 'c', date: '2026-10-31' }),
      base({ id: 'd', date: '2026-11-01' }),
    ]
    const stats = computeCalendarStats({
      appointments,
      view: 'month',
      cursor: '2026-10-05',
      showCancelled: false,
    })
    expect(stats.monthCount).toBe(2)
    expect(stats.rangeCount).toBe(2)
    expect(stats.rangeDays).toBe(31)
    expect(stats.averagePerDay).toBe(0.1)
  })

  it('computes week average over 7 days', () => {
    const appointments = [
      base({ id: 'a', date: '2026-10-05' }),
      base({ id: 'b', date: '2026-10-06' }),
      base({ id: 'c', date: '2026-10-07' }),
      base({ id: 'd', date: '2026-10-08' }),
    ]
    const stats = computeCalendarStats({
      appointments,
      view: 'week',
      cursor: '2026-10-08',
      showCancelled: false,
    })
    expect(stats.weekCount).toBe(4)
    expect(stats.rangeCount).toBe(4)
    expect(stats.averagePerDay).toBe(0.6)
  })

  it('excludes cancelled unless showCancelled is true', () => {
    const appointments = [
      base({ id: 'a', date: '2026-10-10' }),
      base({ id: 'b', date: '2026-10-10', status: 'cancelada' }),
    ]
    const hidden = computeCalendarStats({
      appointments,
      view: 'day',
      cursor: '2026-10-10',
      showCancelled: false,
    })
    expect(hidden.dayCount).toBe(1)

    const shown = computeCalendarStats({
      appointments,
      view: 'day',
      cursor: '2026-10-10',
      showCancelled: true,
    })
    expect(shown.dayCount).toBe(2)
  })

  it('day view sets dayCount and zero average', () => {
    const appointments = [
      base({ id: 'a', date: '2026-10-20' }),
      base({ id: 'b', date: '2026-10-20' }),
      base({ id: 'c', date: '2026-10-21' }),
    ]
    const stats = computeCalendarStats({
      appointments,
      view: 'day',
      cursor: '2026-10-20',
      showCancelled: false,
    })
    expect(stats.dayCount).toBe(2)
    expect(stats.averagePerDay).toBe(0)
    expect(stats.rangeCount).toBe(2)
  })
})
