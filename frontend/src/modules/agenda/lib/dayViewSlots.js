import { normalizeAppointmentTime, timeRangesOverlap } from '@/modules/agenda/lib/selfBooking'
import { formatHoldCountdown, holdRemainingMs } from '@/modules/agenda/lib/slotHoldCountdown'
import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'
export const CALENDAR_SLOT_MINUTES = 30
export const CALENDAR_ROW_PX = 88
/** Vertical padding on slot cells (`p-1` = 8px total). */
export const CALENDAR_SLOT_PAD_PX = 8
export const UNASSIGNED_RESOURCE_ID = '__unassigned__'
export const UNASSIGNED_RESOURCE = Object.freeze({
  id: UNASSIGNED_RESOURCE_ID,
  name: 'Sin cabina',
  access: 'view',
  active: true,
})

function appointmentStartMinutes(appointment) {
  const normalized = normalizeAppointmentTime(appointment?.time)
  const [hours, minutes] = normalized.split(':').map(Number)
  return hours * 60 + minutes
}

function matchesResource(appointment, resourceId) {
  const cabina = appointment.cabinaId || appointment.resourceId
  if (resourceId === UNASSIGNED_RESOURCE_ID) return !cabina
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

/** Adds a "Sin cabina" column only when the day has appointments without `resource_id`. */
export function calendarResourcesWithUnassigned(
  resources = [],
  appointments = [],
  dateKey,
  { includeCancelled = false } = {},
) {
  const hasUnassigned = appointmentsForResource(appointments, dateKey, UNASSIGNED_RESOURCE_ID, {
    includeCancelled,
  }).length > 0
  return hasUnassigned ? [...resources, UNASSIGNED_RESOURCE] : resources
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

export function sameAgendaRecordId(left, right) {
  if (left == null || right == null) return false
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase()
}

function holdMatchesCell(hold, dateKey, resourceId, slot) {
  return (
    hold.date === dateKey
    && sameAgendaRecordId(hold.resourceId, resourceId)
    && normalizeAppointmentTime(hold.time) === normalizeAppointmentTime(slot)
  )
}

export function slotHoldsAtCell(slotHolds, dateKey, resourceId, slot) {
  if (!slotHolds?.length) return null
  return slotHolds.find((hold) => holdMatchesCell(hold, dateKey, resourceId, slot)) || null
}

/** Active hold at the start of a calendar cell (skips expired holds). */
export function activeSlotHoldAtCell(slotHolds, dateKey, resourceId, slot, nowMs = Date.now()) {
  const hold = slotHoldsAtCell(slotHolds, dateKey, resourceId, slot)
  if (!hold || holdRemainingMs(hold.expiresAt, nowMs) <= 0) return null
  return hold
}

export function holdOverlapsSlot(hold, slot, slotMinutes = CALENDAR_SLOT_MINUTES) {
  if (!hold) return false
  const duration = Number(hold.durationMinutes) || slotMinutes
  return timeRangesOverlap(slot, slotMinutes, hold.time, duration)
}

export function holdLaneIndex({ paintedLaneCount, holdStartsHere }) {
  if (!holdStartsHere) return -1
  return Math.max(0, Number(paintedLaneCount) || 0)
}

export function dayViewLaneCount({ overlapping, laneCountById, holdStartsHere }) {
  const paintedLaneCount = overlapping.length ? slotLaneCount(overlapping, laneCountById) : 0
  let laneCount = Math.max(1, paintedLaneCount)
  if (holdStartsHere) {
    laneCount = Math.max(laneCount, paintedLaneCount + 1, 2)
  }
  return { laneCount, paintedLaneCount }
}

export function formatHoldCountdownLabel(expiresAt, nowMs = Date.now()) {
  return formatHoldCountdown(expiresAt, nowMs)
}

export function appointmentStartsAtSlot(appointment, slot) {
  if (!appointment) return false
  return normalizeAppointmentTime(appointment.time) === normalizeAppointmentTime(slot)
}

function appointmentEndMinutes(appointment) {
  return appointmentStartMinutes(appointment) + (Number(appointment?.duration) || CALENDAR_SLOT_MINUTES)
}

function assignClusterLanes(cluster, assignment, laneCountById) {
  const lanes = []
  for (const appointment of cluster) {
    let laneIndex = lanes.findIndex((lane) => !lane.some((other) => timeRangesOverlap(
      appointment.time,
      appointment.duration,
      other.time,
      other.duration
    )))
    if (laneIndex === -1) {
      laneIndex = lanes.length
      lanes.push([])
    }
    lanes[laneIndex].push(appointment)
    assignment.set(appointment.id, laneIndex)
  }
  for (const appointment of cluster) laneCountById.set(appointment.id, lanes.length)
  return lanes.length
}

/**
 * Assign parallel lanes so overlapping appointments remain visible side by side.
 * Lanes are scoped to each group of transitively overlapping appointments, so a single
 * overlap does not narrow every other card in the same column.
 */
export function assignAppointmentLanes(appointments) {
  const sorted = [...appointments].sort(
    (a, b) => appointmentStartMinutes(a) - appointmentStartMinutes(b)
  )
  const assignment = new Map()
  const laneCountById = new Map()
  let laneCount = 1
  let cluster = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (!cluster.length) return
    laneCount = Math.max(laneCount, assignClusterLanes(cluster, assignment, laneCountById))
    cluster = []
  }

  for (const appointment of sorted) {
    if (appointmentStartMinutes(appointment) >= clusterEnd) {
      flush()
      clusterEnd = -Infinity
    }
    cluster.push(appointment)
    clusterEnd = Math.max(clusterEnd, appointmentEndMinutes(appointment))
  }
  flush()

  return { assignment, laneCount, laneCountById }
}

/** Lane count for a slot: the widest overlap group among the appointments visible in it. */
export function slotLaneCount(overlappingAppointments, laneCountById) {
  return overlappingAppointments.reduce(
    (max, appointment) => Math.max(max, laneCountById?.get(appointment.id) || 1),
    1,
  )
}

/** Lanes to render for a slot: only painted appointments, no spare bookable column. */
export function bookableSlotLaneCount({ paintedLaneCount }) {
  return Math.max(1, Number(paintedLaneCount) || 1)
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
