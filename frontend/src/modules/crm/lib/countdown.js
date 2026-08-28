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
