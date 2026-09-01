export function getPaidAmount(receivable) {
  if (receivable?.apiSynced && receivable.paidAmount != null) {
    return Math.max(0, Number(receivable.paidAmount) || 0)
  }
  return (receivable?.payments || [])
    .filter((payment) => !payment.reversed && payment.status !== 'reversed')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
}

export const POS_PROOF_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'

export function getBalance(receivable) {
  if (receivable?.apiSynced && receivable.balance != null) {
    return Math.max(0, Number(receivable.balance) || 0)
  }
  return Math.max(0, (Number(receivable?.amount) || 0) - getPaidAmount(receivable))
}

export function getReceivableStatus(receivable) {
  if (['voided', 'written_off'].includes(receivable?.status)) return receivable.status
  if (receivable?.status === 'overdue' && getBalance(receivable) > 0) return 'overdue'
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
  overdue: { label: 'Vencida', tone: 'danger' },
  voided: { label: 'Anulada', tone: 'neutral' },
  written_off: { label: 'Castigada', tone: 'neutral' },
}

export function getReceivableVoidPolicy(receivable) {
  const status = getReceivableStatus(receivable)
  if (['paid', 'voided', 'written_off'].includes(status)) {
    return { canVoid: false, reason: null }
  }

  const source = receivable?.source
    || (receivable?.appointmentId ? 'appointment' : receivable?.saleId ? 'sale' : 'manual')
  if (source === 'sale') {
    return { canVoid: false, reason: 'Anula la venta de origen.' }
  }
  if (!['appointment', 'agenda', 'manual'].includes(source)) {
    return { canVoid: false, reason: 'Esta cuenta no admite anulación directa.' }
  }
  if (getPaidAmount(receivable) > 0) {
    return { canVoid: false, reason: 'Reversa los pagos antes de anularla.' }
  }
  return { canVoid: true, reason: null }
}

export const PAYMENT_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'link', label: 'Link de pago' },
]
