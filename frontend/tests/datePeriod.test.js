import { describe, expect, it } from 'vitest'
import { isCustomPeriod, periodFilterLabel, resolvePeriodRange } from '@/lib/datePeriod'

describe('datePeriod', () => {
  it('acepta un solo día como período personalizado', () => {
    const range = { period: 'custom', dateFrom: '2026-09-01', dateTo: null }
    expect(isCustomPeriod(range)).toBe(true)
    const { start, end } = resolvePeriodRange(range)
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(1)
  })

  it('formatea etiqueta de día único', () => {
    const label = periodFilterLabel({
      period: 'custom',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-01',
    })
    expect(label).toMatch(/^Día /)
  })
})
