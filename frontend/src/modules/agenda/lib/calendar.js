import { toKey } from '@/stores/agendaStore'

export const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
export const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfWeekMonday(key) {
  const d = fromKey(key)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return toKey(d)
}

export function addDaysKey(key, n) {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

export function addMonthsKey(key, n) {
  const d = fromKey(key)
  d.setMonth(d.getMonth() + n)
  return toKey(d)
}

export function weekKeysMonday(key) {
  const start = startOfWeekMonday(key)
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i))
}

export function monthGrid(key) {
  const d = fromKey(key)
  const year = d.getFullYear()
  const month = d.getMonth()
  const first = new Date(year, month, 1)
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1
  const cells = []
  const start = new Date(year, month, 1 - startOffset)
  for (let i = 0; i < 42; i++) {
    const cell = new Date(start)
    cell.setDate(start.getDate() + i)
    cells.push({ key: toKey(cell), inMonth: cell.getMonth() === month, date: cell })
  }
  return cells
}

export function formatLongDate(key) {
  const d = fromKey(key)
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return `${days[d.getDay()]}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`
}

export function formatMonthYear(key) {
  const d = fromKey(key)
  return `${MONTH_NAMES[d.getMonth()]} de ${d.getFullYear()}`
}

export function formatShortDate(key) {
  const d = fromKey(key)
  const days = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return `${days[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

export function endTime(time, duration) {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + (Number(duration) || 30)
  const eh = Math.floor(total / 60) % 24
  const em = total % 60
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
}

export function timeSlots(startHour = 8, endHour = 20, stepMin = 30) {
  const slots = []
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}

export function aptTone(apt) {
  if (apt.status === 'cancelada') return 'cancelled'
  if (apt.pendingPayment) return 'pending'
  if (apt.freeTrial) return 'trial'
  return 'default'
}
