import { canBookResource, canEditResource } from '@/modules/configuracion/lib/agendaCabinas'
import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'
import { normalizeAppointmentTime, timeRangesOverlap } from '@/modules/agenda/lib/selfBooking'

/** Mirrors backend `SHARED_RESOURCE_CAPACITY`: the internal agenda allows two people per cabin. */
export const SHARED_RESOURCE_CAPACITY = 2

export function appointmentBlocksConfirmedSlot(appointment) {
  return normalizeAppointmentStatus(appointment?.status) === 'confirmada'
}

function toMinutes(time) {
  const [hours, minutes] = normalizeAppointmentTime(time).split(':').map(Number)
  return hours * 60 + minutes
}

function durationMinutes(duration) {
  return Number(duration) || 30
}

/** Confirmed appointments in the cabin that overlap the given window. */
export function resourceSlotOccupants({
  appointments = [],
  resourceId,
  date,
  time,
  duration,
  excludeId = null,
}) {
  if (!resourceId || !date || !time) return []
  return appointments.filter((other) => (
    other.id !== excludeId
    && (other.cabinaId || other.resourceId) === resourceId
    && other.date === date
    && appointmentBlocksConfirmedSlot(other)
    && timeRangesOverlap(time, duration, other.time, other.duration)
  ))
}

/** Max people simultaneously in the cabin during the window, counting the new appointment. */
export function resourcePeakOccupancy(args) {
  const occupants = resourceSlotOccupants(args)
  const start = toMinutes(args.time)
  const end = start + durationMinutes(args.duration)
  const windows = occupants.map((other) => {
    const otherStart = toMinutes(other.time)
    return [otherStart, otherStart + durationMinutes(other.duration)]
  })
  const checkpoints = [start, ...windows.map(([otherStart]) => otherStart).filter((s) => s > start && s < end)]
  const busiest = Math.max(
    0,
    ...checkpoints.map((point) => windows.filter(([s, e]) => s <= point && point < e).length),
  )
  return 1 + busiest
}

export function findResourceSharing(args) {
  return resourceSlotOccupants(args)[0] || null
}

export function resourceCapacityMessage(resourceName) {
  return `${resourceName || 'La cabina'} ya tiene ${SHARED_RESOURCE_CAPACITY} personas en ese horario.`
}

export function sharedResourceWarning({ resourceName, occupant }) {
  return `Ya hay una persona en ${resourceName || 'la cabina'} (${occupant.customerName}) a las ${normalizeAppointmentTime(occupant.time)}. Tomas el riesgo de doble acumulación.`
}

export function findEmployeeSlotConflict({
  appointments = [],
  appointment,
  time,
}) {
  if (!appointment?.employeeId || !time) return null
  return appointments.find((other) => (
    other.id !== appointment.id
    && other.employeeId === appointment.employeeId
    && other.date === appointment.date
    && appointmentBlocksConfirmedSlot(other)
    && timeRangesOverlap(time, appointment.duration, other.time, other.duration)
  )) || null
}

export function explainAppointmentResourceMove({
  appointment,
  targetResource,
  sourceResource,
  targetTime,
  appointments = [],
  canManage = true,
}) {
  if (!canManage) return 'No tienes permiso para mover citas.'
  if (!appointment) return 'No se encontró la cita.'
  if (normalizeAppointmentStatus(appointment.status) === 'cancelada') {
    return 'No se puede mover una cita cancelada.'
  }
  if (sourceResource && !canEditResource(sourceResource.access)) {
    return `No tienes permiso para editar citas en ${sourceResource.name}.`
  }
  if (!targetResource) return 'Suelta la cita sobre una cabina para moverla.'
  if (!canEditResource(targetResource.access)) {
    if (targetResource.access === 'view' || !canBookResource(targetResource.access)) {
      return `No tienes permiso para usar ${targetResource.name}.`
    }
    return `No tienes permiso para mover citas a ${targetResource.name}.`
  }
  if (targetResource.active === false) {
    return `${targetResource.name} no está activa.`
  }

  const time = targetTime || appointment.time
  const sameSlot = targetResource.id === appointment.cabinaId
    && time === appointment.time
  if (sameSlot) return null

  const peak = resourcePeakOccupancy({
    appointments,
    resourceId: targetResource.id,
    date: appointment.date,
    time,
    duration: appointment.duration,
    excludeId: appointment.id,
  })
  if (peak > SHARED_RESOURCE_CAPACITY) {
    return `No se puede mover: ${targetResource.name} ya tiene ${SHARED_RESOURCE_CAPACITY} personas a las ${normalizeAppointmentTime(time)}.`
  }

  const employeeConflict = findEmployeeSlotConflict({
    appointments,
    appointment,
    time,
  })
  if (employeeConflict) {
    return `No se puede mover: el empleado ya atiende a ${employeeConflict.customerName} a las ${employeeConflict.time}.`
  }

  return null
}
