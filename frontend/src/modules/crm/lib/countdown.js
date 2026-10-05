function plural(n, singular, pluralForm) {
  return n === 1 ? singular : pluralForm
}

export function formatTaskCountdown(dueAt, now = new Date()) {
  if (!dueAt) return null
  const due = new Date(dueAt)
  const diffMs = due - now
  const abs = Math.abs(diffMs)
  const totalMinutes = Math.floor(abs / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  const parts = []
  if (hours > 0) parts.push(`${hours} ${plural(hours, 'hora', 'horas')}`)
  if (minutes > 0 || hours === 0) parts.push(`${minutes} ${plural(minutes, 'minuto', 'minutos')}`)
  const timeStr = parts.join(' y ')

  if (diffMs > 60000) {
    return { tone: 'upcoming', text: `Te faltan ${timeStr}…` }
  }
  if (diffMs < -60000) {
    return { tone: 'overdue', text: `Retrasado por ${timeStr}` }
  }
  return { tone: 'now', text: 'Vence ahora' }
}

const MS_PER_HOUR = 60 * 60 * 1000

/** Urgencia visual para vencimiento de tareas (48 h → amarillo, 10 h → rojo). */
export function activityDueUrgencyTone(dueAt, now = new Date()) {
  if (!dueAt) return 'none'
  const diffMs = new Date(dueAt) - now
  if (diffMs <= 0) return 'overdue'
  const hoursLeft = diffMs / MS_PER_HOUR
  if (hoursLeft < 10) return 'critical'
  if (hoursLeft < 48) return 'warning'
  return 'normal'
}

export function activityDueUrgencyClass(tone) {
  if (tone === 'critical' || tone === 'overdue') {
    return 'font-semibold text-red-600'
  }
  if (tone === 'warning') {
    return 'font-semibold text-amber-600'
  }
  return 'text-slate-500'
}
