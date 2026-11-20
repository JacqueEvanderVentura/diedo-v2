import { formatClock12h } from '@/lib/format'

const LEGACY_STATUS_MAP = {
  completada: 'cumplida',
  asistio: 'cumplida',
  pendiente: 'confirmada',
  retrasada: 'confirmada',
  reprogramada: 'confirmada',
}

export function normalizeAppointmentStatus(status) {
  const raw = String(status || '').trim()
  if (!raw) return 'confirmada'
  return LEGACY_STATUS_MAP[raw] || raw
}

export function formatCompletionTime(value) {
  if (!value) return null
  const label = formatClock12h(value)
  return label || null
}

export function formatCompletionSummary(appointment) {
  if (normalizeAppointmentStatus(appointment?.status) !== 'cumplida') return null
  if (appointment?.completionPunctuality === 'delayed') {
    const who = appointment.delayResponsibility === 'customer' ? 'Cliente' : 'Centro'
    const note = appointment.completionNote ? ` · ${appointment.completionNote}` : ''
    return `Cumplida en retraso · ${who}${note}`
  }
  const time = formatCompletionTime(appointment.completedAt)
  return time ? `Cumplida a las ${time}` : 'Cumplida'
}

export function buildCompletionPayload({ punctuality, delayResponsibility, completionNote, employeeId }) {
  const completedAt = new Date().toISOString()
  const specialist = employeeId ? { employeeId } : {}
  if (punctuality === 'delayed') {
    return {
      status: 'cumplida',
      completed: true,
      completedAt,
      completionPunctuality: 'delayed',
      delayResponsibility,
      completionNote: completionNote?.trim() || null,
      ...specialist,
    }
  }
  return {
    status: 'cumplida',
    completed: true,
    completedAt,
    completionPunctuality: 'on_time',
    delayResponsibility: null,
    completionNote: null,
    ...specialist,
  }
}
