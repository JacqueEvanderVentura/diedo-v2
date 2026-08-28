import { todayKey } from '@/stores/agendaStore'

const CLOSED_STATUSES = new Set(['cancelada', 'completada', 'noshow'])

export function isProximoAppointment(appointment) {
  if (!appointment) return false
  if (CLOSED_STATUSES.has(appointment.status)) return false
  return appointment.date >= todayKey()
}
