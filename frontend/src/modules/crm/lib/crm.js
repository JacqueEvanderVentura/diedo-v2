import { getBalance } from '@/modules/pos/lib/receivables'
import { invoiceCollectionFromSalePolicy } from '@/modules/crm/lib/quoteInvoice'

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

export function saleReceivablePending(sale, receivable = null) {
  if (!sale || sale.status === 'voided') return false
  if (receivable && getBalance(receivable) > 0) return true
  const collection = invoiceCollectionFromSalePolicy(sale)
  if (collection === 'pending_validation') return true
  if (collection === 'receivable') {
    if (!receivable) return true
    return getBalance(receivable) > 0
  }
  if (sale.method === 'cxc') {
    return !receivable || getBalance(receivable) > 0
  }
  return false
}

export function saleStatusBadge(sale, receivable = null) {
  if (!sale || sale.status === 'voided') {
    return { label: 'Anulada', tone: 'danger' }
  }
  if (saleReceivablePending(sale, receivable)) {
    return { label: 'Cta. por cobrar', tone: 'brand' }
  }
  return { label: 'Completada', tone: 'success' }
}

export function saleRowHighlightClass(sale, receivable = null) {
  return saleReceivablePending(sale, receivable) ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-100' : ''
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
  if (!iso) return '—'
  const calendar = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (calendar) return `${calendar[3]} ${MONTHS[Number(calendar[2]) - 1]} ${calendar[1]}`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtDateTime(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${fmtDate(iso)} · ${p(d.getHours())}:${p(d.getMinutes())}`
}
