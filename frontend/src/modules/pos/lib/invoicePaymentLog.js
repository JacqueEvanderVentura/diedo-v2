import { paymentMethodSemanticCode } from '@/services/adapters/pos'

const first = (...values) => values.find((value) => value !== undefined && value !== null)

const numberValue = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const collection = (value) => (Array.isArray(value) ? value : [])

const EVIDENCE_METHODS = new Set(['transferencia', 'link'])

function tenderMethodCode(tender) {
  return paymentMethodSemanticCode(
    first(
      tender.method,
      tender.paymentMethod?.code,
      tender.paymentMethodCode,
      tender.payment_method?.code,
      'cash'
    )
  )
}

function paymentProofs(payment) {
  const mapped = collection(payment?.proofs).filter(Boolean)
  if (mapped.length) return mapped
  return payment?.proof ? [payment.proof] : []
}

function saleCheckoutProofs(sale) {
  const fromPayment = collection(sale?.payment?.proofs).filter(Boolean)
  if (fromPayment.length) return fromPayment
  return sale?.payment?.proof ? [sale.payment.proof] : []
}

function proofsForCheckoutTender(tender, saleProofs, tenderIndex, tenderCount) {
  if (!saleProofs.length) return []
  const method = tenderMethodCode(tender)
  if (EVIDENCE_METHODS.has(method)) return saleProofs
  if (tenderCount === 1) return saleProofs
  if (tenderIndex === 0) return saleProofs
  return []
}

/**
 * @returns {Array<{
 *   key: string,
 *   source: 'checkout' | 'receivable',
 *   sourceLabel: string,
 *   amount: number,
 *   method: string,
 *   reference: string | null,
 *   note: string | null,
 *   status: string | null,
 *   reversed: boolean,
 *   createdAt: string | null,
 *   proofs: unknown[],
 *   paymentId?: string,
 * }>}
 */
export function buildInvoicePaymentLog({ sale = null, receivable = null } = {}) {
  const entries = []
  const saleProofs = saleCheckoutProofs(sale)
  const tenders = collection(sale?.tenders)

  tenders.forEach((tender, index) => {
    entries.push({
      key: `checkout-${tender.id || index}`,
      source: 'checkout',
      sourceLabel: 'Al facturar',
      amount: numberValue(tender.amount),
      method: tenderMethodCode(tender),
      reference: tender.reference || null,
      note: null,
      status: tender.status || 'settled',
      reversed: false,
      createdAt: first(tender.createdAt, sale?.createdAt, null),
      proofs: proofsForCheckoutTender(tender, saleProofs, index, tenders.length),
    })
  })

  collection(receivable?.payments).forEach((payment, index) => {
    entries.push({
      key: `abono-${payment.id || index}`,
      source: 'receivable',
      sourceLabel: 'Abono',
      amount: numberValue(payment.amount),
      method: paymentMethodSemanticCode(payment.method),
      reference: payment.reference || null,
      note: payment.note || null,
      status: payment.status || 'posted',
      reversed: Boolean(payment.reversed),
      createdAt: first(payment.createdAt, payment.paidAt, null),
      proofs: paymentProofs(payment),
      paymentId: payment.id || null,
    })
  })

  return entries.sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0
    if (leftTime !== rightTime) return leftTime - rightTime
    if (left.source !== right.source) return left.source === 'checkout' ? -1 : 1
    return 0
  })
}
