import { normalizeAppointmentTime, timeRangesOverlap } from '@/modules/agenda/lib/selfBooking'
import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'

export const CALENDAR_SLOT_MINUTES = 30
export const CALENDAR_ROW_PX = 88
/** Vertical padding on slot cells (`p-1` = 8px total). */
export const CALENDAR_SLOT_PAD_PX = 8

function appointmentStartMinutes(appointment) {
  const normalized = normalizeAppointmentTime(appointment?.time)
  const [hours, minutes] = normalized.split(':').map(Number)
  return hours * 60 + minutes
}

function matchesResource(appointment, resourceId) {
  const cabina = appointment.cabinaId || appointment.resourceId
  return cabina === resourceId
}

export function appointmentsForResource(appointments, dateKey, resourceId, { includeCancelled = false } = {}) {
  return appointments.filter((appointment) => {
    if (appointment.date !== dateKey) return false
    if (!matchesResource(appointment, resourceId)) return false
    if (!includeCancelled && normalizeAppointmentStatus(appointment.status) === 'cancelada') return false
    return true
  })
}

/** Appointments that block scheduling (excludes cancelled). */
export function activeAppointmentsForResource(appointments, dateKey, resourceId) {
  return appointmentsForResource(appointments, dateKey, resourceId, { includeCancelled: false })
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

export function appointmentsOverlappingSlot(appointments, slot, slotMinutes = CALENDAR_SLOT_MINUTES) {
  return appointments.filter((appointment) => timeRangesOverlap(
    slot,
    slotMinutes,
    appointment.time,
    appointment.duration
  ))
}

export function appointmentStartsAtSlot(appointment, slot) {
  if (!appointment) return false
  return normalizeAppointmentTime(appointment.time) === normalizeAppointmentTime(slot)
}

/** Assign parallel lanes so overlapping appointments remain visible side by side. */
export function assignAppointmentLanes(appointments) {
  const sorted = [...appointments].sort(
    (a, b) => appointmentStartMinutes(a) - appointmentStartMinutes(b)
  )
  const lanes = []
  const assignment = new Map()

  for (const appointment of sorted) {
    let placed = false
    for (let laneIndex = 0; laneIndex < lanes.length; laneIndex += 1) {
      const conflicts = lanes[laneIndex].some((other) => timeRangesOverlap(
        appointment.time,
        appointment.duration,
        other.time,
        other.duration
      ))
      if (!conflicts) {
        lanes[laneIndex].push(appointment)
        assignment.set(appointment.id, laneIndex)
        placed = true
        break
      }
    }
    if (!placed) {
      assignment.set(appointment.id, lanes.length)
      lanes.push([appointment])
    }
  }

  return { assignment, laneCount: Math.max(1, lanes.length) }
}

export function calendarRowSpan(durationMinutes = 30, slotMinutes = CALENDAR_SLOT_MINUTES) {
  const duration = Number(durationMinutes) || slotMinutes
  return Math.max(1, Math.ceil(duration / slotMinutes))
}

/** Pixel height of an appointment block proportional to duration (not rounded to whole slots). */
export function calendarBlockHeight(
  durationMinutes = 30,
  rowPx = CALENDAR_ROW_PX,
  slotMinutes = CALENDAR_SLOT_MINUTES,
  padPx = CALENDAR_SLOT_PAD_PX,
) {
  const duration = Number(durationMinutes) || slotMinutes
  const contentRowPx = rowPx - padPx
  return (duration / slotMinutes) * contentRowPx
}

export function isSlotBlockedByAppointment(appointments, slot) {
  return Boolean(appointmentOverlappingSlot(appointments, slot))
}
