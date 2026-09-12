import { describe, expect, it } from 'vitest'
import {
  activeAppointmentsForResource,
  appointmentStartingAtSlot,
  isSlotBlockedByAppointment,
  calendarRowSpan,
} from '@/modules/agenda/lib/dayViewSlots'

const DATE = '2026-09-16'
const CAB = 'cab1'

describe('dayViewSlots', () => {
  const appointments = [
    {
      id: 'a1',
      date: DATE,
      time: '10:00',
      duration: 60,
      cabinaId: CAB,
      status: 'confirmada',
      customerName: 'Pepe',
    },
    {
      id: 'a2',
      date: DATE,
      time: '15:00',
      duration: 60,
      cabinaId: CAB,
      status: 'cancelada',
      customerName: 'Anulada',
    },
  ]

  it('filters active appointments per resource', () => {
    const list = activeAppointmentsForResource(appointments, DATE, CAB)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('a1')
  })

  it('marks continuation slots as blocked', () => {
    const active = activeAppointmentsForResource(appointments, DATE, CAB)
    expect(appointmentStartingAtSlot(active, '10:00')?.id).toBe('a1')
    expect(appointmentStartingAtSlot(active, '10:30')).toBeNull()
    expect(isSlotBlockedByAppointment(active, '10:30')).toBe(true)
    expect(isSlotBlockedByAppointment(active, '11:00')).toBe(false)
  })

  it('ignores cancelled appointments for blocking', () => {
    const active = activeAppointmentsForResource(appointments, DATE, CAB)
    expect(isSlotBlockedByAppointment(active, '15:00')).toBe(false)
    expect(isSlotBlockedByAppointment(active, '15:30')).toBe(false)
  })

  it('computes row span from duration', () => {
    expect(calendarRowSpan(60)).toBe(2)
    expect(calendarRowSpan(30)).toBe(1)
    expect(calendarRowSpan(90)).toBe(3)
  })
})
