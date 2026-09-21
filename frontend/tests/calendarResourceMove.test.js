import { describe, expect, it } from 'vitest'
import { explainAppointmentResourceMove } from '@/modules/agenda/lib/calendarResourceMove'

const DATE = '2026-09-21'
const appointment = {
  id: 'apt-1',
  date: DATE,
  time: '10:00',
  duration: 60,
  cabinaId: 'cab1',
  employeeId: 'emp-1',
  status: 'confirmada',
  customerName: 'Ana',
}

const cab2 = { id: 'cab2', name: 'Cabina 2', access: 'use', active: true }

describe('explainAppointmentResourceMove', () => {
  it('allows moving to a free cabina at the same time', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      targetResource: cab2,
      targetTime: '10:00',
      appointments: [appointment],
      canManage: true,
    })).toBeNull()
  })

  it('rejects a drop outside any cabina', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      targetResource: null,
      targetTime: '10:00',
      appointments: [appointment],
    })).toBe('Suelta la cita sobre una cabina para moverla.')
  })

  it('rejects a view-only cabina', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      targetResource: { ...cab2, access: 'view' },
      appointments: [appointment],
    })).toBe('No tienes permiso para usar Cabina 2.')
  })

  it('rejects a confirmed overlap on the destination cabina', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      targetResource: cab2,
      targetTime: '10:00',
      appointments: [
        appointment,
        {
          id: 'apt-2',
          date: DATE,
          time: '10:00',
          duration: 30,
          cabinaId: 'cab2',
          status: 'confirmada',
          customerName: 'María Fernández',
        },
      ],
    })).toBe('No se puede mover: Cabina 2 ya tiene a María Fernández a las 10:00.')
  })

  it('rejects an employee overlap when the time changes', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      targetResource: cab2,
      targetTime: '11:00',
      appointments: [
        appointment,
        {
          id: 'apt-3',
          date: DATE,
          time: '11:00',
          duration: 30,
          cabinaId: 'cab3',
          employeeId: 'emp-1',
          status: 'confirmada',
          customerName: 'Luis',
        },
      ],
    })).toBe('No se puede mover: el empleado ya atiende a Luis a las 11:00.')
  })

  it('does not treat cancelled appointments as blocking', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      targetResource: cab2,
      targetTime: '10:00',
      appointments: [
        appointment,
        {
          id: 'apt-4',
          date: DATE,
          time: '10:00',
          duration: 60,
          cabinaId: 'cab2',
          status: 'cancelada',
          customerName: 'Cancelada',
        },
      ],
    })).toBeNull()
  })
})
