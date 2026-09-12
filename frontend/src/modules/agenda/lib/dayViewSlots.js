import { normalizeAppointmentTime, timeRangesOverlap } from '@/modules/agenda/lib/selfBooking'
import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'

export const CALENDAR_SLOT_MINUTES = 30

export function activeAppointmentsForResource(appointments, dateKey, resourceId) {
  return appointments.filter(
    (appointment) =>
      appointment.date === dateKey
      && appointment.cabinaId === resourceId
      && normalizeAppointmentStatus(appointment.status) !== 'cancelada'
  )
}

export function appointmentStartingAtSlot(appointments, slot) {
  const normalizedSlot = normalizeAppointmentTime(slot)
  return appointments.find(
    (appointment) => normalizeAppointmentTime(appointment.time) === normalizedSlot
  ) || null
}

export function appointmentOverlappingSlot(appointments, slot, slotMinutes = CALENDAR_SLOT_MINUTES) {
  return appointments.find((appointment) => timeRangesOverlap(
    slot,
    slotMinutes,
    appointment.time,
    appointment.duration
  )) || null
}

export function calendarRowSpan(durationMinutes = 30, slotMinutes = CALENDAR_SLOT_MINUTES) {
  const duration = Number(durationMinutes) || slotMinutes
  return Math.max(1, Math.ceil(duration / slotMinutes))
}

export function isSlotBlockedByAppointment(appointments, slot) {
  return Boolean(appointmentOverlappingSlot(appointments, slot))
}
