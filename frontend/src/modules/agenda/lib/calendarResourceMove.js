import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'
import { timeRangesOverlap } from '@/modules/agenda/lib/selfBooking'

export function appointmentBlocksConfirmedSlot(appointment) {
  return normalizeAppointmentStatus(appointment?.status) === 'confirmada'
}

export function findResourceSlotConflict({
  appointments = [],
  appointment,
  resourceId,
  time,
}) {
  if (!appointment || !resourceId || !time) return null
  return appointments.find((other) => (
    other.id !== appointment.id
    && other.cabinaId === resourceId
    && other.date === appointment.date
    && appointmentBlocksConfirmedSlot(other)
    && timeRangesOverlap(time, appointment.duration, other.time, other.duration)
  )) || null
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
  targetTime,
  appointments = [],
  canManage = true,
}) {
  if (!canManage) return 'No tienes permiso para mover citas.'
  if (!appointment) return 'No se encontró la cita.'
  if (normalizeAppointmentStatus(appointment.status) === 'cancelada') {
    return 'No se puede mover una cita cancelada.'
  }
  if (!targetResource) return 'Suelta la cita sobre una cabina para moverla.'
  if (targetResource.access === 'view') {
    return `No tienes permiso para usar ${targetResource.name}.`
  }
  if (targetResource.active === false) {
    return `${targetResource.name} no está activa.`
  }

  const time = targetTime || appointment.time
  const sameSlot = targetResource.id === appointment.cabinaId
    && time === appointment.time
  if (sameSlot) return null

  const resourceConflict = findResourceSlotConflict({
    appointments,
    appointment,
    resourceId: targetResource.id,
    time,
  })
  if (resourceConflict) {
    return `No se puede mover: ${targetResource.name} ya tiene a ${resourceConflict.customerName} a las ${resourceConflict.time}.`
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
