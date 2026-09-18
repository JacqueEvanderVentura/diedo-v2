import { describe, expect, it } from 'vitest'
import { inDateRange, isCustomPeriod, periodFilterLabel, resolvePeriodRange, toDateInputValue } from '@/lib/datePeriod'

describe('datePeriod', () => {
  it('acepta un solo día como período personalizado', () => {
    const range = { period: 'custom', dateFrom: '2026-09-01', dateTo: null }
    expect(isCustomPeriod(range)).toBe(true)
    const { start, end } = resolvePeriodRange(range)
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(1)
  })

  it('filtra fechas dentro del mes actual', () => {
    const range = { period: 'month', dateFrom: null, dateTo: null }
    const today = toDateInputValue(new Date())
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    expect(inDateRange(today, range)).toBe(true)
    expect(inDateRange(toDateInputValue(lastMonth), range)).toBe(false)
  })

  it('resuelve últimos 28 días', () => {
    const now = new Date('2026-09-18T12:00:00')
    const { start, end } = resolvePeriodRange({ period: 'last28' }, now)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7)
    expect(start.getDate()).toBe(22)
    expect(end.getDate()).toBe(18)
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
