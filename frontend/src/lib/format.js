// Currency & number formatting — Dominican Peso (RD$)

export function formatDOP(value, { decimals = 2 } = {}) {
  const n = Number(value || 0)
  const formatted = n.toLocaleString('es-DO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `RD$ ${formatted}`
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-DO')
}

export function formatCompact(value) {
  const n = Number(value || 0)
  if (Math.abs(n) >= 1000) {
    return `$${(n / 1000).toLocaleString('es-DO', { maximumFractionDigits: 0 })}k`
  }
  return `$${n}`
}

/** Visible label cap — full string when length ≤ maxLength, else first maxLength chars + ellipsis. */
export function truncateDisplayText(value, maxLength = 40, ellipsis = '....') {
  const text = String(value ?? '').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}${ellipsis}`
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Formats time string 'HH:mm' (or with seconds) to 12h, e.g. '8:00 AM', '1:30 PM'. */
export function formatTime12h(slot) {
  if (slot == null || slot === '') return ''
  const [hours, minutes] = String(slot).split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(slot)
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`
}

function toDate(isoOrDate) {
  if (!isoOrDate) return null
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Formats Date or ISO string to 12h clock label. */
export function formatClock12h(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d) return ''
  return formatTime12h(`${d.getHours()}:${d.getMinutes()}`)
}

/** Formats Date or ISO to 'DD mmm YYYY · h:mm AM/PM'. */
export function formatDateTime12h(isoOrDate) {
  const d = toDate(isoOrDate)
  if (!d) return '—'
  const p = (n) => String(n).padStart(2, '0')
  const datePart = `${p(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
  return `${datePart} · ${formatClock12h(d)}`
}

/** Locale datetime with forced 12h (replaces ad-hoc toLocaleString without hour12). */
export function formatLocaleDateTime12h(isoOrDate, options = {}) {
  const d = toDate(isoOrDate)
  if (!d) return '—'
  return d.toLocaleString('es-DO', { hour12: true, ...options })
}

/** Locale time with forced 12h. */
export function formatLocaleTime12h(isoOrDate, options = {}) {
  const d = toDate(isoOrDate)
  if (!d) return ''
  return d.toLocaleTimeString('es-DO', { hour: 'numeric', minute: '2-digit', hour12: true, ...options })
}
