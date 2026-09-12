const REF_LABELS = {
  efectivo: 'N° de referencia (opcional)',
  tarjeta: 'N° de comprobante / voucher',
  transferencia: 'N° de referencia de transferencia',
  link: 'N° de referencia del link',
  cxc: 'N° de referencia (opcional)',
}

export function paymentMethodReferenceLabel(method) {
  if (!method) return 'N° de referencia (opcional)'
  return REF_LABELS[method.id] || 'N° de referencia (opcional)'
}

export function paymentMethodAllowsProofUpload(method) {
  if (!method) return false
  if (method.requiresProof) return true
  return ['transferencia', 'link', 'tarjeta'].includes(method.id)
}

export function validatePaymentEvidence(method, { reference, proof }) {
  if (!method) return null
  const ref = (reference || '').trim()
  if (method.id === 'transferencia' && !ref && !proof) {
    return 'Ingresa el N° de referencia o sube el comprobante.'
  }
  return null
}

export function paymentMethodShowsEvidenceFields(method) {
  if (!method) return false
  return true
}

export function isReceivableSettlementMethod(method) {
  if (!method) return false
  if (method.settlementMode === 'credit') return true
  if (method.settlementPolicy === 'receivable') return true
  if (method.settlementMode === 'pending_confirmation') return true
  if (method.settlementPolicy === 'pending_confirmation') return true
  return ['transferencia', 'link', 'cxc'].includes(method.id)
}

export function collectionModeForPaymentMethod(method) {
  return isReceivableSettlementMethod(method) ? 'receivable' : 'now'
}
