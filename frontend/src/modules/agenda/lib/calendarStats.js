import { fromKey, monthGrid, weekKeysMonday } from './calendar'

function monthKeyFromCursor(cursor) {
  const d = fromKey(cursor)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function daysInCalendarMonth(cursor) {
  const d = fromKey(cursor)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function includeAppointment(appointment, showCancelled) {
  if (!showCancelled && appointment.status === 'cancelada') return false
  return true
}

function countInDateSet(appointments, dateSet, showCancelled) {
  return appointments.filter(
    (a) => includeAppointment(a, showCancelled) && dateSet.has(a.date),
  ).length
}

function countInMonth(appointments, cursor, showCancelled) {
  const prefix = monthKeyFromCursor(cursor)
  return appointments.filter((a) => {
    if (!includeAppointment(a, showCancelled)) return false
    return a.date && a.date.startsWith(`${prefix}-`)
  }).length
}

function roundAverage(total, days) {
  if (!days || days <= 0) return 0
  const raw = total / days
  return Math.round(raw * 10) / 10
}

/**
 * @param {{ appointments: object[], view: 'day'|'week'|'month', cursor: string, showCancelled: boolean }} input
 */
export function computeCalendarStats({ appointments, view, cursor, showCancelled }) {
  const monthCount = countInMonth(appointments, cursor, showCancelled)
  const dayCount = countInDateSet(appointments, new Set([cursor]), showCancelled)

  let rangeCount = 0
  let rangeDays = 0

  if (view === 'day') {
    rangeCount = dayCount
    rangeDays = 1
  } else if (view === 'week') {
    const days = weekKeysMonday(cursor)
    rangeCount = countInDateSet(appointments, new Set(days), showCancelled)
    rangeDays = 7
  } else if (view === 'month') {
    const inMonthKeys = monthGrid(cursor)
      .filter((cell) => cell.inMonth)
      .map((cell) => cell.key)
    rangeCount = countInDateSet(appointments, new Set(inMonthKeys), showCancelled)
    rangeDays = daysInCalendarMonth(cursor)
  }

  const averagePerDay = view === 'day' ? 0 : roundAverage(rangeCount, rangeDays)

  const weekDays = weekKeysMonday(cursor)
  const weekCount = countInDateSet(appointments, new Set(weekDays), showCancelled)

  return {
    monthCount,
    rangeCount,
    rangeDays,
    averagePerDay,
    dayCount,
    weekCount,
  }
}
