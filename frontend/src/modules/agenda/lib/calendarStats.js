import { fromKey, monthGrid, weekKeysMonday } from './calendar'
import { normalizeAppointmentStatus } from './completion'

export function rangeKeysForView(view, cursor) {
  if (view === 'day') return [cursor]
  if (view === 'week') return weekKeysMonday(cursor)
  return monthGrid(cursor).filter((cell) => cell.inMonth).map((cell) => cell.key)
}

export function rangeScopeLabel(view) {
  if (view === 'day') return 'del día visible'
  if (view === 'week') return 'de la semana visible'
  return 'del mes visible'
}

function appointmentsInRange(appointments, view, cursor) {
  const keys = new Set(rangeKeysForView(view, cursor))
  return appointments.filter((a) => a.date && keys.has(a.date))
}

function countByStatus(appointments, statusId) {
  return appointments.filter(
    (a) => normalizeAppointmentStatus(a.status) === statusId,
  ).length
}

/**
 * @param {{ appointments: object[], view: 'day'|'week'|'month', cursor: string }} input
 */
export function computeCalendarStats({ appointments, view, cursor }) {
  const inRange = appointmentsInRange(appointments, view, cursor)
  const pending = countByStatus(inRange, 'confirmada')
  const completed = countByStatus(inRange, 'cumplida')
  const noShow = countByStatus(inRange, 'noshow')
  const cancelled = countByStatus(inRange, 'cancelada')

  return {
    rangeScopeLabel: rangeScopeLabel(view),
    total: inRange.length,
    pending,
    completed,
    noShow,
    cancelled,
  }
}
