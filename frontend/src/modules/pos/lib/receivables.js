export function receivableHasEvidence(receivable) {
  if (!receivable) return false
  if (receivable.proof) return true
  if ((receivable.proofs || []).length > 0) return true
  if (String(receivable.reference || '').trim()) return true
  return (receivable.payments || []).some(
    (payment) => payment.proof || (payment.proofs || []).length > 0,
  )
}

export function requiresPaymentApproval(receivable) {
  return Number(receivable?.approvalPendingAmount) > 0
}

export function canUnapproveReceivablePayment(receivable) {
  if (!receivable) return false
  const method = receivable.method || receivable.paidMethod
  if (method !== 'transferencia' && method !== 'link') return false
  const paid = getPaidAmount(receivable)
  const paymentsSum = (receivable.payments || [])
    .filter((payment) => !payment.reversed && payment.status !== 'reversed')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
  return paid > paymentsSum
}

/** CxC transfer/link: subir otro comprobante sin borrar los anteriores. */
export function canAttachNewReceivableProof(receivable) {
  if (!receivable) return false
  const method = receivable.method || receivable.paidMethod
  if (method !== 'transferencia' && method !== 'link') return false
  if (requiresPaymentApproval(receivable)) return false
  if (canUnapproveReceivablePayment(receivable)) return false
  return getBalance(receivable) > 0
}

export function canShowReceivableUnapprove(receivable) {
  return canUnapproveReceivablePayment(receivable) || requiresPaymentApproval(receivable)
}

const PROOF_REQUIRED_SNIPPETS = [
  'Adjunta el comprobante requerido por este método de pago',
  'Adjunta un comprobante antes de aprobar el pago',
]

export function isReceivableProofRequiredError(message) {
  const text = String(message || '')
  return PROOF_REQUIRED_SNIPPETS.some((snippet) => text.includes(snippet))
}

export function getPaidAmount(receivable) {
  if (receivable?.apiSynced && receivable.paidAmount != null) {
    return Math.max(0, Number(receivable.paidAmount) || 0)
  }
  return (receivable?.payments || [])
    .filter((payment) => !payment.reversed && payment.status !== 'reversed')
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)
}

export const POS_PROOF_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'

export function receivableHasPaymentEvidence(receivable, payload = {}) {
  return Boolean(
    payload.proof
    || String(payload.reference || '').trim()
    || receivable?.proof
    || String(receivable?.reference || '').trim()
  )
}

export function getBalance(receivable) {
  if (receivable?.apiSynced && receivable.balance != null) {
    return Math.max(0, Number(receivable.balance) || 0)
  }
  const approvalPending = Number(receivable?.approvalPendingAmount) || 0
  return Math.max(0, (Number(receivable?.amount) || 0) - getPaidAmount(receivable) - approvalPending)
}

export function getReceivableStatus(receivable) {
  if (['voided', 'written_off'].includes(receivable?.status)) return receivable.status
  if (requiresPaymentApproval(receivable)) return 'approval_pending'
  if (receivable?.status === 'overdue' && getBalance(receivable) > 0) return 'overdue'
  const balance = getBalance(receivable)
  const paid = getPaidAmount(receivable)
  if (balance <= 0 && paid >= (Number(receivable?.amount) || 0)) return 'paid'
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
  approval_pending: { label: 'APROBAR', tone: 'warning' },
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
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'link', label: 'Link de pago' },
]
