// Utilidades de período para reportes (reutiliza opciones del dashboard).
export const REPORT_PERIODS = [
  { id: 'today', label: 'Hoy', days: 1 },
  { id: 'week', label: 'Esta semana', days: 7 },
  { id: 'month', label: 'Este mes', days: 30 },
  { id: 'quarter', label: 'Trimestre', days: 90 },
]

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function parseWhen(v) {
  if (!v) return null
  if (typeof v === 'string' && v.length === 10) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(v)
}

function periodStart(period) {
  const now = new Date()
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = REPORT_PERIODS.find((p) => p.id === period)?.days || 7
  return new Date(Date.now() - days * 86400000)
}

export function inPeriod(v, period) {
  const d = parseWhen(v)
  if (!d) return false
  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return d >= periodStart(period) && d <= endOfToday
}

const dayLabel = (d) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`

// Serie temporal: por día (<=31d) o por semana (trimestre).
export function buildSeries(items, period, getDate, getValue = () => 1) {
  const start = periodStart(period)
  const now = new Date()
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const dayCount = Math.max(1, Math.round((now - startDay) / 86400000) + 1)
  const weekly = dayCount > 31

  const buckets = []
  const index = {}
  if (weekly) {
    for (let s = new Date(startDay); s <= now; s.setDate(s.getDate() + 7)) {
      const key = dayLabel(s)
      index[key] = buckets.length
      buckets.push({ label: key, value: 0, _from: new Date(s) })
    }
  } else {
    for (let s = new Date(startDay); s <= now; s.setDate(s.getDate() + 1)) {
      const key = dayLabel(s)
      index[key] = buckets.length
      buckets.push({ label: key, value: 0, _from: new Date(s) })
    }
  }

  items.forEach((it) => {
    const d = parseWhen(getDate(it))
    if (!d || d < startDay) return
    let bi
    if (weekly) {
      bi = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - startDay) / (7 * 86400000))
    } else {
      bi = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - startDay) / 86400000)
    }
    if (buckets[bi]) buckets[bi].value += getValue(it)
  })

  return buckets.map(({ label, value }) => ({ label, value }))
}

// Mock determinista estable por id (para rotación / no-shows).
export function mockFromId(id, min = 5, span = 40) {
  let h = 0
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 100000
  return min + (h % span)
}
