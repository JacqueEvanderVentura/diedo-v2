const SPLIT_METHOD_ORDER = ['efectivo', 'tarjeta', 'transferencia', 'link']

export function splitPaymentMethods(methods) {
  const enabled = (methods || []).filter((method) => method.enabled)
  const byId = new Map(enabled.map((method) => [method.id, method]))
  const ordered = SPLIT_METHOD_ORDER
    .map((id) => byId.get(id))
    .filter(Boolean)
  const rest = enabled.filter((method) => !SPLIT_METHOD_ORDER.includes(method.id))
  return [...ordered, ...rest].filter(
    (method) => !['cxc'].includes(method.id) && method.settlementMode !== 'credit'
  )
}

export function emptySplitDraft(methods) {
  return splitPaymentMethods(methods).map((method) => ({
    methodId: method.id,
    amount: '',
    reference: '',
  }))
}

export function draftFromCheckoutTenders(tenders, methods) {
  const base = emptySplitDraft(methods)
  if (!Array.isArray(tenders) || !tenders.length) return base
  const byMethod = new Map(tenders.map((row) => [row.methodId, row]))
  return base.map((row) => {
    const saved = byMethod.get(row.methodId)
    if (!saved) return row
    return {
      ...row,
      amount: saved.amount != null ? String(saved.amount) : '',
      reference: saved.reference || '',
    }
  })
}

export function sumSplitDraft(draft) {
  return (draft || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
}

export function applyRestToRow(draft, methodId, total) {
  const targetTotal = Number(total) || 0
  const other = (draft || []).reduce((sum, row) => {
    if (row.methodId === methodId) return sum
    return sum + (Number(row.amount) || 0)
  }, 0)
  const rest = Math.max(0, targetTotal - other)
  return (draft || []).map((row) => (
    row.methodId === methodId
      ? { ...row, amount: rest > 0 ? rest.toFixed(2) : '' }
      : row
  ))
}

export function checkoutTendersFromDraft(draft, total) {
  const targetTotal = Number(total) || 0
  const rows = (draft || [])
    .map((row) => ({
      methodId: row.methodId,
      amount: Number(row.amount) || 0,
      reference: row.reference?.trim() || null,
    }))
    .filter((row) => row.amount > 0)
  const allocated = rows.reduce((sum, row) => sum + row.amount, 0)
  if (!rows.length) {
    return { ok: false, error: 'Indica al menos un monto en un método de pago.' }
  }
  if (Math.abs(allocated - targetTotal) > 0.009) {
    return {
      ok: false,
      error: `La suma (${allocated.toFixed(2)}) debe coincidir con el total (${targetTotal.toFixed(2)}).`,
    }
  }
  return { ok: true, tenders: rows }
}

export function splitPaymentSummary(tenders, methods) {
  if (!Array.isArray(tenders) || !tenders.length) return null
  const labels = tenders
    .map((row) => {
      const method = methods.find((item) => item.id === row.methodId)
      return method?.name || row.methodId
    })
    .filter(Boolean)
  return labels.length ? labels.join(' + ') : 'Pago dividido'
}
