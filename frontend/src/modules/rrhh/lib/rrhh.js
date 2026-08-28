const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function fullName(emp) {
  if (!emp) return ''
  return `${emp.firstName || ''} ${emp.lastName || ''}`.trim()
}

export function initials(emp) {
  const n = fullName(emp)
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return (parts[0]?.[0] || '?').toUpperCase()
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtDateShort(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

export function daysBetween(start, end) {
  if (!start || !end) return 0
  const a = new Date(start)
  const b = new Date(end)
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

export function debtBalance(debt) {
  const paid = (debt.payments || []).reduce((s, p) => s + (p.amount || 0), 0)
  return Math.max(0, (debt.amount || 0) - paid)
}

export function debtStatus(debt) {
  const balance = debtBalance(debt)
  if (balance <= 0) return 'pagado'
  const paid = (debt.payments || []).reduce((s, p) => s + (p.amount || 0), 0)
  if (paid > 0) return 'parcial'
  return 'pendiente'
}

export function calcPayrollNet(salary) {
  const base = Number(salary) || 0
  const tss = base * 0.0287
  const isr = base * 0.1
  return { base, tss, isr, net: base - tss - isr }
}
