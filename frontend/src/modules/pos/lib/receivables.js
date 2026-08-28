export function getPaidAmount(receivable) {
  return (receivable?.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

export function getBalance(receivable) {
  return Math.max(0, (Number(receivable?.amount) || 0) - getPaidAmount(receivable))
}

export function getReceivableStatus(receivable) {
  const balance = getBalance(receivable)
  const paid = getPaidAmount(receivable)
  if (balance <= 0) return 'paid'
  if (paid > 0) return 'partial'
  return 'pending'
}

export function normalizeReceivable(receivable) {
  if (!receivable) return receivable
  const payments = receivable.payments || []
  const status = getReceivableStatus({ ...receivable, payments })
  return { ...receivable, payments, status }
}

export const STATUS_META = {
  pending: { label: 'Pendiente', tone: 'warning' },
  partial: { label: 'Parcial', tone: 'brand' },
  paid: { label: 'Pagado', tone: 'success' },
}

export const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'link', label: 'Link de pago' },
]
