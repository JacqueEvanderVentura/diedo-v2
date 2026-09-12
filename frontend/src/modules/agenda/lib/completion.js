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
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false })
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

export function buildCompletionPayload({ punctuality, delayResponsibility, completionNote }) {
  const completedAt = new Date().toISOString()
  if (punctuality === 'delayed') {
    return {
      status: 'cumplida',
      completed: true,
      completedAt,
      completionPunctuality: 'delayed',
      delayResponsibility,
      completionNote: completionNote?.trim() || null,
    }
  }
  return {
    status: 'cumplida',
    completed: true,
    completedAt,
    completionPunctuality: 'on_time',
    delayResponsibility: null,
    completionNote: null,
  }
}
