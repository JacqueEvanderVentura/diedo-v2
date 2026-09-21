import { mapProof } from '@/services/adapters/pos'

function proofKey(proof) {
  if (!proof) return null
  return proof.id || proof.downloadUrl || proof.name
}

function pushProof(rows, proof) {
  if (!proof) return
  const key = proofKey(proof)
  if (!key || rows.some((item) => proofKey(item) === key)) return
  rows.push(proof)
}

function proofsFromReceivable(receivable) {
  if (!receivable) return []
  const rows = []
  pushProof(rows, receivable.proof ? mapProof(receivable.proof) : null)
  ;(receivable.proofs || []).forEach((proof) => pushProof(rows, mapProof(proof)))
  ;(receivable.payments || []).forEach((payment) => {
    pushProof(rows, payment.proof ? mapProof(payment.proof) : null)
    ;(payment.proofs || []).forEach((proof) => pushProof(rows, mapProof(proof)))
  })
  return rows
}

export function collectSalePaymentProofs(sale, receivable = null) {
  if (!sale) return []
  const rows = []
  pushProof(rows, sale.proof ? mapProof(sale.proof) : null)
  pushProof(rows, mapProof(sale.payment?.proof))
  ;(sale.payment?.proofs || []).forEach((proof) => pushProof(rows, mapProof(proof)))
  proofsFromReceivable(receivable).forEach((proof) => pushProof(rows, proof))
  return rows
}

export function saleHasPaymentProof(sale, receivable = null) {
  return collectSalePaymentProofs(sale, receivable).length > 0
}

export function findReceivableForSale(receivables, saleId) {
  if (!saleId || !receivables?.length) return null
  return receivables.find((item) => item.saleId === saleId) || null
}
