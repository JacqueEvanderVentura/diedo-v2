import { fromKey } from './calendar'

const JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function weekdayKeyFromDateKey(dateKey) {
  const date = fromKey(dateKey)
  return JS_DAY_TO_KEY[date.getDay()]
}

export function parseTimeToMinutes(value) {
  if (!value) return 0
  const [hours, minutes = 0] = String(value).split(':').map(Number)
  return hours * 60 + minutes
}

export function calendarHourBoundsFromDayRow(row, fallback = { startHour: 8, endHour: 20 }) {
  if (!row) return { ...fallback, closed: true }
  const startMinutes = parseTimeToMinutes(row.opensAt)
  const endMinutes = parseTimeToMinutes(row.closesAt)
  const startHour = Math.floor(startMinutes / 60)
  const endHour = Math.max(startHour + 1, Math.ceil(endMinutes / 60))
  return { startHour, endHour, closed: false }
}

export function boundsForDate(openingHours, dateKey, fallback = { startHour: 8, endHour: 20 }) {
  if (!openingHours?.length) return { ...fallback, closed: false }
  const weekday = weekdayKeyFromDateKey(dateKey)
  const row = openingHours.find((item) => item.weekday === weekday)
  return calendarHourBoundsFromDayRow(row, fallback)
}

export function unionBoundsForWeek(openingHours, weekDateKeys, fallback = { startHour: 8, endHour: 20 }) {
  if (!openingHours?.length) return fallback
  let startHour = 24
  let endHour = 0
  let anyOpen = false
  for (const dateKey of weekDateKeys) {
    const bounds = boundsForDate(openingHours, dateKey, fallback)
    if (bounds.closed) continue
    anyOpen = true
    startHour = Math.min(startHour, bounds.startHour)
    endHour = Math.max(endHour, bounds.endHour)
  }
  if (!anyOpen) return { startHour: fallback.startHour, endHour: fallback.endHour, closed: true }
  return { startHour, endHour, closed: false }
}
