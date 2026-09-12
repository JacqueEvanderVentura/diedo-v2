import { describe, expect, it } from 'vitest'
import {
  getAvailableSlots,
  isSlotAvailable,
  timeRangesOverlap,
  normalizeAppointmentTime,
} from '@/modules/agenda/lib/selfBooking'

const TUESDAY = '2026-09-16'
const PEPE = 'emp-pepe'

describe('selfBooking availability', () => {
  it('normalizes appointment times with seconds', () => {
    expect(normalizeAppointmentTime('10:00:00')).toBe('10:00')
    expect(normalizeAppointmentTime('15:30')).toBe('15:30')
  })

  it('detects overlap for 10-11 and 15-16 appointments', () => {
    expect(timeRangesOverlap('10:00', 60, '10:30', 30)).toBe(true)
    expect(timeRangesOverlap('10:00', 30, '11:00', 30)).toBe(false)
    expect(timeRangesOverlap('15:00', 60, '15:30', 30)).toBe(true)
    expect(timeRangesOverlap('14:00', 30, '15:00', 60)).toBe(false)
  })

  it('hides slots that collide with Pepe calendar on Tuesday', () => {
    const appointments = [
      { id: 'a1', date: TUESDAY, time: '10:00', duration: 60, employeeId: PEPE, status: 'confirmada' },
      { id: 'a2', date: TUESDAY, time: '15:00', duration: 60, employeeId: PEPE, status: 'confirmada' },
      { id: 'a3', date: TUESDAY, time: '12:00', duration: 30, employeeId: 'emp-other', status: 'confirmada' },
    ]

    const slots = getAvailableSlots({
      date: TUESDAY,
      employeeId: PEPE,
      duration: 30,
      appointments,
      employee: null,
      vacationRequests: [],
    })

    expect(slots).not.toContain('10:00')
    expect(slots).not.toContain('10:30')
    expect(slots).not.toContain('15:00')
    expect(slots).not.toContain('15:30')
    expect(slots).toContain('11:00')
    expect(slots).toContain('14:30')
    expect(slots).toContain('16:00')
  })

  it('ignores cancelled appointments', () => {
    const appointments = [
      { id: 'a1', date: TUESDAY, time: '10:00', duration: 60, employeeId: PEPE, status: 'cancelada' },
    ]
    const slots = getAvailableSlots({
      date: TUESDAY,
      employeeId: PEPE,
      duration: 30,
      appointments,
      employee: null,
      vacationRequests: [],
    })
    expect(slots).toContain('10:00')
    expect(slots).toContain('10:30')
  })

  it('validates a single slot choice', () => {
    const appointments = [
      { id: 'a1', date: TUESDAY, time: '15:00', duration: 60, employeeId: PEPE, status: 'confirmada' },
    ]
    expect(isSlotAvailable({
      date: TUESDAY,
      employeeId: PEPE,
      duration: 30,
      time: '15:30',
      appointments,
      employee: null,
      vacationRequests: [],
    })).toBe(false)
    expect(isSlotAvailable({
      date: TUESDAY,
      employeeId: PEPE,
      duration: 30,
      time: '16:00',
      appointments,
      employee: null,
      vacationRequests: [],
    })).toBe(true)
  })
})
