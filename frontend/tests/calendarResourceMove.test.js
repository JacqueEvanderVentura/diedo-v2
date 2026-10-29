import { describe, expect, it } from 'vitest'
import {
  explainAppointmentResourceMove,
  findResourceSharing,
  resourceCapacityMessage,
  resourcePeakOccupancy,
  sharedResourceWarning,
} from '@/modules/agenda/lib/calendarResourceMove'

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

const cab1 = { id: 'cab1', name: 'Cabina 1', access: 'edit', active: true }
const cab2 = { id: 'cab2', name: 'Cabina 2', access: 'edit', active: true }

function occupant(id, time, duration, customerName, status = 'confirmada') {
  return { id, date: DATE, time, duration, cabinaId: 'cab2', status, customerName }
}

describe('explainAppointmentResourceMove', () => {
  it('allows moving to a free cabina at the same time', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      sourceResource: cab1,
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
      sourceResource: cab1,
      targetResource: { ...cab2, access: 'view' },
      appointments: [appointment],
    })).toBe('No tienes permiso para usar Cabina 2.')
  })

  it('rejects moving when destination is use-only', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      sourceResource: cab1,
      targetResource: { ...cab2, access: 'use' },
      appointments: [appointment],
    })).toBe('No tienes permiso para mover citas a Cabina 2.')
  })

  it('allows a second person in the destination cabina', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      sourceResource: cab1,
      targetResource: cab2,
      targetTime: '10:00',
      appointments: [appointment, occupant('apt-2', '10:00', 30, 'María Fernández')],
    })).toBeNull()
  })

  it('rejects a third person in the destination cabina', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      sourceResource: cab1,
      targetResource: cab2,
      targetTime: '10:00',
      appointments: [
        appointment,
        occupant('apt-2', '10:00', 30, 'María Fernández'),
        occupant('apt-5', '10:00', 60, 'Rosa'),
      ],
    })).toBe('No se puede mover: Cabina 2 ya tiene 2 personas a las 10:00.')
  })

  it('rejects an employee overlap when the time changes', () => {
    expect(explainAppointmentResourceMove({
      appointment,
      sourceResource: cab1,
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
      sourceResource: cab1,
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

describe('cabina shared occupancy', () => {
  const query = (appointments, overrides = {}) => ({
    appointments,
    resourceId: 'cab2',
    date: DATE,
    time: '10:00',
    duration: 60,
    excludeId: 'apt-1',
    ...overrides,
  })

  it('counts chained appointments by their busiest moment', () => {
    const chained = [occupant('a', '10:00', 30, 'A'), occupant('b', '10:30', 30, 'B')]
    expect(resourcePeakOccupancy(query(chained))).toBe(2)
    expect(resourcePeakOccupancy(query([...chained, occupant('c', '10:15', 30, 'C')]))).toBe(3)
  })

  it('ignores cumplida, noshow and other cabinas', () => {
    const others = [
      occupant('a', '10:00', 60, 'A', 'cumplida'),
      occupant('b', '10:00', 60, 'B', 'noshow'),
      { ...occupant('c', '10:00', 60, 'C'), cabinaId: 'cab1' },
    ]
    expect(resourcePeakOccupancy(query(others))).toBe(1)
    expect(findResourceSharing(query(others))).toBeNull()
  })

  it('excludes the appointment being moved', () => {
    expect(resourcePeakOccupancy(query([{ ...occupant('apt-1', '10:00', 60, 'Ana') }]))).toBe(1)
  })

  it('builds the shared and full cabina messages', () => {
    const shared = findResourceSharing(query([occupant('a', '10:00', 30, 'María')]))
    expect(sharedResourceWarning({ resourceName: 'Cabina 2', occupant: shared })).toBe(
      'Ya hay una persona en Cabina 2 (María) a las 10:00. Tomas el riesgo de doble acumulación.',
    )
    expect(resourceCapacityMessage('Cabina 2')).toBe('Cabina 2 ya tiene 2 personas en ese horario.')
    expect(resourceCapacityMessage()).toBe('La cabina ya tiene 2 personas en ese horario.')
  })
})
