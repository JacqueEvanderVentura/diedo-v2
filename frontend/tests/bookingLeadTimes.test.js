import { describe, expect, it } from 'vitest'
import {
  PUBLIC_BOOKING_LEAD_TIME_OPTIONS,
  normalizePublicBookingLeadMinutes,
  publicBookingLeadTimeLabel,
} from '@/lib/bookingLeadTimes'

describe('bookingLeadTimes', () => {
  it('expone las nueve opciones de anticipo', () => {
    expect(PUBLIC_BOOKING_LEAD_TIME_OPTIONS).toHaveLength(9)
    expect(PUBLIC_BOOKING_LEAD_TIME_OPTIONS.map((option) => option.value)).toContain('90')
  })

  it('normaliza valores inválidos al mínimo de 5 minutos', () => {
    expect(normalizePublicBookingLeadMinutes(60)).toBe(60)
    expect(normalizePublicBookingLeadMinutes(999)).toBe(5)
  })

  it('resuelve etiquetas legibles', () => {
    expect(publicBookingLeadTimeLabel(240)).toBe('4 horas')
  })
})
