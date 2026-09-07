export const METHOD_LABELS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  link: 'Link de pago',
  cxc: 'Cta. por Cobrar',
}

export const METHOD_ICON = {
  efectivo: 'Banknote',
  tarjeta: 'CreditCard',
  transferencia: 'ArrowLeftRight',
  link: 'Link2',
  cxc: 'Clock',
}

export function summarizeActiveSales(sales = []) {
  const active = sales.filter((sale) => sale.status !== 'voided')
  return {
    count: active.length,
    total: active.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0),
  }
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function fmtDate(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtDateTime(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${fmtDate(iso)} · ${p(d.getHours())}:${p(d.getMinutes())}`
}
