const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Acepta 'YYYY-MM-DD' (input date) o ISO (createdAt) y devuelve un Date local.
export function parseWhen(v) {
  if (!v) return null
  if (typeof v === 'string' && v.length === 10) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(v)
}

export function fmtWhen(v) {
  const d = parseWhen(v)
  if (!d) return '—'
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// ¿La fecha cae en el mes/año actuales?
export function isThisMonth(v) {
  const d = parseWhen(v)
  if (!d) return false
  const now = new Date()
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
}
