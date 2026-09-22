import { todayKey } from '@/stores/agendaStore'

const CLOSED_STATUSES = new Set(['cancelada', 'cumplida', 'noshow'])

export const APPOINTMENT_NOTES_MAX_LENGTH = 60
export const APPOINTMENT_CARD_NOTE_MAX_LENGTH = 15

export function normalizeAppointmentNote(note) {
  return String(note || '').trim().replace(/\s+/g, ' ')
}

export function appointmentCardNote(note) {
  const normalized = normalizeAppointmentNote(note)
  if (!normalized) return 'Sin nota'
  const characters = Array.from(normalized)
  if (characters.length <= APPOINTMENT_CARD_NOTE_MAX_LENGTH) return normalized
  return `${characters.slice(0, APPOINTMENT_CARD_NOTE_MAX_LENGTH - 1).join('')}…`
}

export function isProximoAppointment(appointment) {
  if (!appointment) return false
  if (CLOSED_STATUSES.has(appointment.status)) return false
  return appointment.date >= todayKey()
}
