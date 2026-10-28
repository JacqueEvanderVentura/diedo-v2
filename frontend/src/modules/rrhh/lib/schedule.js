import { fromKey } from '@/modules/agenda/lib/calendar'
import { timeSlots } from '@/modules/agenda/lib/calendar'

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export const WEEKDAY_LABELS = {
  mon: 'Lunes',
  tue: 'Martes',
  wed: 'Miércoles',
  thu: 'Jueves',
  fri: 'Viernes',
  sat: 'Sábado',
  sun: 'Domingo',
}

export const WEEKDAY_SHORT = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mié',
  thu: 'Jue',
  fri: 'Vie',
  sat: 'Sáb',
  sun: 'Dom',
}

const JS_DAY_TO_KEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const DEFAULT_START = 8
const DEFAULT_END = 20
const DEFAULT_STEP = 30

export function emptyWorkSchedule() {
  return Object.fromEntries(WEEKDAY_KEYS.map((day) => [day, []]))
}

export function timeToMinutes(time) {
  if (!time) return 0
  const [h, m] = String(time).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function minutesToTime(total) {
  const h = Math.floor(total / 60) % 24
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function normalizeTime(value) {
  if (!value) return ''
  const str = String(value).trim()
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return str
}

export const OVERNIGHT_HINT =
  'Si el turno pasa de medianoche, divídelo en dos bloques (ej. 20:00–23:59 y 00:00–02:00 del día siguiente).'

export function coerceWorkSchedule(input) {
  const schedule = emptyWorkSchedule()
  if (!input || typeof input !== 'object') return schedule
  for (const day of WEEKDAY_KEYS) {
    schedule[day] = Array.isArray(input[day])
      ? input[day].map((block) => ({ start: block?.start ?? '', end: block?.end ?? '' }))
      : []
  }
  return schedule
}

function isValidBlock(block) {
  const start = normalizeTime(block?.start)
  const end = normalizeTime(block?.end)
  return Boolean(start && end) && timeToMinutes(end) > timeToMinutes(start)
}

function blockIssue(blocks, index) {
  const block = blocks[index]
  const start = normalizeTime(block?.start)
  const end = normalizeTime(block?.end)
  if (!start || !end) {
    return { kind: 'incomplete', message: 'Completa la hora de entrada y de salida.' }
  }
  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  if (startMin === endMin) {
    return { kind: 'order', message: `La entrada y la salida no pueden ser la misma hora (${start}).` }
  }
  if (endMin < startMin) {
    return {
      kind: 'order',
      message: `La entrada no puede ser posterior a la salida (${start} – ${end}). ${OVERNIGHT_HINT}`,
    }
  }
  const otherIndex = blocks.findIndex((other, i) => {
    if (i === index || !isValidBlock(other)) return false
    return startMin < timeToMinutes(other.end) && timeToMinutes(other.start) < endMin
  })
  if (otherIndex >= 0) {
    const other = blocks[otherIndex]
    return {
      kind: 'overlap',
      otherIndex,
      message: `Se solapa con el bloque ${normalizeTime(other.start)} – ${normalizeTime(other.end)}.`,
    }
  }
  return null
}

export function getBlockError(blocks, index) {
  if (!Array.isArray(blocks) || !blocks[index]) return null
  return blockIssue(blocks, index)?.message || null
}

export function dayHasErrors(blocks) {
  return Array.isArray(blocks) && blocks.some((_, index) => getBlockError(blocks, index))
}

export function validateWorkSchedule(input) {
  const errors = []
  if (!input || typeof input !== 'object') return errors

  for (const day of WEEKDAY_KEYS) {
    const blocks = Array.isArray(input[day]) ? input[day] : []
    blocks.forEach((_, index) => {
      const issue = blockIssue(blocks, index)
      if (!issue) return
      if (issue.kind === 'overlap' && issue.otherIndex < index) return
      errors.push(`${WEEKDAY_LABELS[day]}: ${issue.message}`)
    })
  }

  return errors
}

export function normalizeWorkSchedule(input) {
  const schedule = emptyWorkSchedule()
  if (!input || typeof input !== 'object') return schedule

  for (const day of WEEKDAY_KEYS) {
    const blocks = Array.isArray(input[day]) ? input[day] : []
    schedule[day] = blocks
      .map((block) => ({
        start: normalizeTime(block.start),
        end: normalizeTime(block.end),
      }))
      .filter((block) => block.start && block.end && timeToMinutes(block.end) > timeToMinutes(block.start))
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))
  }

  return schedule
}

export function dayKeyFromDate(dateKey) {
  const d = fromKey(dateKey)
  return JS_DAY_TO_KEY[d.getDay()]
}

export function hasConfiguredSchedule(schedule) {
  const normalized = normalizeWorkSchedule(schedule)
  return WEEKDAY_KEYS.some((day) => normalized[day].length > 0)
}

export function getBlocksForDate(schedule, dateKey) {
  const day = dayKeyFromDate(dateKey)
  return normalizeWorkSchedule(schedule)[day] || []
}

export function slotsFromBlocks(blocks, { duration = 30, stepMin = 30 } = {}) {
  const dur = Number(duration) || 30
  const step = Number(stepMin) || 30
  const slots = []

  for (const block of blocks) {
    const start = timeToMinutes(block.start)
    const end = timeToMinutes(block.end)
    for (let t = start; t + dur <= end; t += step) {
      slots.push(minutesToTime(t))
    }
  }

  return [...new Set(slots)].sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
}

export function getEmployeeSlotsForDate({ employee, date, duration = 30, stepMin = 30 }) {
  const schedule = normalizeWorkSchedule(employee?.workSchedule)
  const configured = hasConfiguredSchedule(schedule)
  const blocks = getBlocksForDate(schedule, date)

  if (configured) {
    if (!blocks.length) return []
    return slotsFromBlocks(blocks, { duration, stepMin })
  }

  return timeSlots(DEFAULT_START, DEFAULT_END, stepMin)
}

export function fitsInSchedule({ employee, date, time, duration = 30 }) {
  if (!time) return false
  const schedule = normalizeWorkSchedule(employee?.workSchedule)
  const configured = hasConfiguredSchedule(schedule)
  const blocks = getBlocksForDate(schedule, date)

  if (!configured) return true
  if (!blocks.length) return false

  const start = timeToMinutes(time)
  const end = start + (Number(duration) || 30)
  return blocks.some((block) => start >= timeToMinutes(block.start) && end <= timeToMinutes(block.end))
}

export function isOnApprovedVacation({ employeeId, date, vacationRequests = [] }) {
  if (!employeeId || !date) return false
  return vacationRequests.some(
    (req) =>
      req.employeeId === employeeId &&
      req.status === 'aprobada' &&
      req.startDate <= date &&
      req.endDate >= date
  )
}

export function summarizeDayBlocks(blocks) {
  if (!blocks?.length) return 'Sin bloques'
  return blocks.map((b) => `${b.start}–${b.end}`).join(', ')
}

export function summarizeSchedule(schedule) {
  const normalized = normalizeWorkSchedule(schedule)
  const activeDays = WEEKDAY_KEYS.filter((day) => normalized[day].length > 0)
  if (!activeDays.length) return 'Sin horario definido'
  const blockCount = activeDays.reduce((n, day) => n + normalized[day].length, 0)
  return `${activeDays.length} día(s) · ${blockCount} bloque(s)`
}

export function copyWeekdaySchedule(schedule, fromDay, toDays) {
  const next = normalizeWorkSchedule(schedule)
  const source = next[fromDay]?.map((block) => ({ ...block })) || []
  for (const day of toDays) {
    next[day] = source.map((block) => ({ ...block }))
  }
  return next
}

export const YAFREISY_SCHEDULE = {
  mon: [
    { start: '08:00', end: '10:00' },
    { start: '14:00', end: '16:00' },
    { start: '17:00', end: '19:00' },
  ],
  tue: [
    { start: '08:00', end: '10:00' },
    { start: '14:00', end: '16:00' },
    { start: '17:00', end: '19:00' },
  ],
  wed: [
    { start: '08:00', end: '10:00' },
    { start: '14:00', end: '16:00' },
    { start: '17:00', end: '19:00' },
  ],
  thu: [
    { start: '08:00', end: '10:00' },
    { start: '14:00', end: '16:00' },
    { start: '17:00', end: '19:00' },
  ],
  fri: [
    { start: '08:00', end: '10:00' },
    { start: '14:00', end: '16:00' },
    { start: '17:00', end: '19:00' },
  ],
  sat: [],
  sun: [],
}
