export function collectSalePaymentProofs(sale) {
  if (!sale) return []
  const rows = []
  const push = (proof) => {
    if (!proof) return
    const key = proof.id || proof.downloadUrl || proof.name
    if (rows.some((item) => (item.id || item.downloadUrl || item.name) === key)) return
    rows.push(proof)
  }
  push(sale.proof)
  push(sale.payment?.proof)
  ;(sale.payment?.proofs || []).forEach(push)
  return rows
}

export function saleHasPaymentProof(sale) {
  return collectSalePaymentProofs(sale).length > 0
}
