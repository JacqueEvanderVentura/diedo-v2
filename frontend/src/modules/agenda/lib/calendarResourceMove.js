import { canBookResource, canEditResource } from '@/modules/configuracion/lib/agendaCabinas'
import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'
import { fitsInSchedule, normalizeAppointmentTime, timeRangesOverlap } from '@/modules/agenda/lib/selfBooking'

/** Mirrors backend `SHARED_RESOURCE_CAPACITY`: a cabin holds two simultaneous appointments. */
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

export function employeeSlotOccupants({
  appointments = [],
  employeeId,
  date,
  time,
  duration,
  excludeId = null,
}) {
  if (!employeeId || !date || !time) return []
  return appointments.filter((other) => (
    other.id !== excludeId
    && other.employeeId === employeeId
    && other.date === date
    && appointmentBlocksConfirmedSlot(other)
    && timeRangesOverlap(time, duration, other.time, other.duration)
  ))
}

export function employeePeakOccupancy(args) {
  const occupants = employeeSlotOccupants(args)
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

export function findEmployeeSharing(args) {
  return employeeSlotOccupants(args)[0] || null
}

export function employeeCapacityMessage(employeeName) {
  return `${employeeName || 'El especialista'} ya tiene ${SHARED_RESOURCE_CAPACITY} personas en ese horario.`
}

export function sharedEmployeeConfirmMessage({ employeeName }) {
  return `${employeeName || 'El especialista'} ya tiene una cita para este bloque. ¿Desea proceder igualmente?`
}

export function sharedEmployeeOutsideScheduleConfirmMessage({ employeeName } = {}) {
  return `Este horario está fuera del horario designado para ${employeeName || 'este colaborador'}. ¿Seguro que deseas continuar?`
}

export function appointmentOutsideEmployeeSchedule({
  employee,
  date,
  time,
  duration = 30,
}) {
  if (!employee?.id || !date || !time) return false
  return !fitsInSchedule({ employee, date, time, duration })
}

export function appointmentMoveConfirmMessage({
  customerName,
  fromTime,
  fromResourceName,
  toTime,
  toResourceName,
}) {
  const who = (customerName || '').trim() || 'esta cita'
  const origin = (fromResourceName || '').trim() || 'Sin cabina'
  const destination = (toResourceName || '').trim() || 'Sin cabina'
  const from = normalizeAppointmentTime(fromTime || '')
  const to = normalizeAppointmentTime(toTime || '')
  return `¿Mover ${who} de las ${from} en ${origin} a ${to} en ${destination}?`
}

/** @deprecated Prefer employeePeakOccupancy for staff double-booking. */
export function findEmployeeSlotConflict({
  appointments = [],
  appointment,
  time,
}) {
  if (!appointment?.employeeId || !time) return null
  const peak = employeePeakOccupancy({
    appointments,
    employeeId: appointment.employeeId,
    date: appointment.date,
    time,
    duration: appointment.duration,
    excludeId: appointment.id,
  })
  if (peak > SHARED_RESOURCE_CAPACITY) {
    return findEmployeeSharing({
      appointments,
      employeeId: appointment.employeeId,
      date: appointment.date,
      time,
      duration: appointment.duration,
      excludeId: appointment.id,
    })
  }
  return null
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

  if (appointment.employeeId) {
    const employeePeak = employeePeakOccupancy({
      appointments,
      employeeId: appointment.employeeId,
      date: appointment.date,
      time,
      duration: appointment.duration,
      excludeId: appointment.id,
    })
    if (employeePeak > SHARED_RESOURCE_CAPACITY) {
      return `No se puede mover: el especialista ya atiende a ${SHARED_RESOURCE_CAPACITY} personas a las ${normalizeAppointmentTime(time)}.`
    }
  }

  return null
}
