import { describe, expect, it } from 'vitest'
import {
  gestionCitasAppointmentParams,
  gestionCitasMatchesDate,
} from '@/modules/agenda/lib/gestionCitasQuery'

describe('gestionCitasQuery', () => {
  it('does not filter when period is all', () => {
    expect(gestionCitasMatchesDate('2020-01-01', { period: 'all' })).toBe(true)
    expect(gestionCitasAppointmentParams({ period: 'all' })).toEqual({})
  })

  it('builds API params for custom range', () => {
    expect(gestionCitasAppointmentParams({
      period: 'custom',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-15',
    })).toEqual({ dateFrom: '2026-10-01', dateTo: '2026-10-15' })
  })

  it('matches dates inside custom range', () => {
    const filter = { period: 'custom', dateFrom: '2026-10-05', dateTo: '2026-10-10' }
    expect(gestionCitasMatchesDate('2026-10-05', filter)).toBe(true)
    expect(gestionCitasMatchesDate('2026-10-11', filter)).toBe(false)
  })
})
