export function parseWhen(v) {
  if (!v) return null
  if (typeof v === 'string' && v.length === 10) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(v)
}

export function toDateInputValue(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function startOfDay(value) {
  const date = parseWhen(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function endOfDay(value) {
  const date = parseWhen(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

export function createPeriodFilterState(period = 'week') {
  return { period, dateFrom: null, dateTo: null }
}

export function isCustomPeriod({ period, dateFrom, dateTo } = {}) {
  return period === 'custom' && Boolean(dateFrom)
}

export function resolvePeriodRange({ period, dateFrom, dateTo } = {}, now = new Date()) {
  if (isCustomPeriod({ period, dateFrom, dateTo })) {
    const endValue = dateTo || dateFrom
    return { start: startOfDay(dateFrom), end: endOfDay(endValue) }
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'today') {
    return { start: today, end: endOfDay(today) }
  }
  if (period === 'week') {
    const day = today.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const start = new Date(today)
    start.setDate(start.getDate() + diff)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return { start, end: endOfDay(end) }
  }
  if (period === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { start, end: endOfDay(end) }
  }
  if (period === 'quarter') {
    const quarterMonth = Math.floor(today.getMonth() / 3) * 3
    const start = new Date(today.getFullYear(), quarterMonth, 1)
    const end = new Date(today.getFullYear(), quarterMonth + 3, 0)
    return { start, end: endOfDay(end) }
  }

  const fallbackStart = new Date(today)
  fallbackStart.setDate(fallbackStart.getDate() - 6)
  return { start: fallbackStart, end: endOfDay(today) }
}

export function inDateRange(value, range) {
  const date = parseWhen(value)
  if (!date) return false
  const { start, end } = resolvePeriodRange(range)
  return date >= start && date <= end
}

export function periodFilterLabel({ period, dateFrom, dateTo }, periods = []) {
  if (isCustomPeriod({ period, dateFrom, dateTo })) {
    const endValue = dateTo || dateFrom
    if (!dateTo || dateFrom === endValue) return `Día ${formatDisplayDate(dateFrom)}`
    return `${formatDisplayDate(dateFrom)} – ${formatDisplayDate(endValue)}`
  }
  return periods.find((item) => item.id === period)?.label || 'Período'
}

function formatDisplayDate(value) {
  const date = parseWhen(value)
  return date.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })
}
