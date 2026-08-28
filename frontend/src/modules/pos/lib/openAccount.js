export function calcSnapshotTotal({ items = [], discountMode = 'pct', discountValue = 0, taxPct = 18 }) {
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.qty) || 0), 0)
  const discountAmt =
    discountMode === 'amount'
      ? Math.min(subtotal, Math.max(0, Number(discountValue) || 0))
      : (subtotal * Math.min(100, Math.max(0, Number(discountValue) || 0))) / 100
  const base = subtotal - discountAmt
  const taxAmt = (base * (Number(taxPct) || 0)) / 100
  return base + taxAmt
}

export function countSnapshotItems(items = []) {
  return items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0)
}

export function mergeCartItems(existing = [], incoming = []) {
  const next = existing.map((i) => ({ ...i }))
  for (const item of incoming) {
    const match = next.find((i) => i.id === item.id)
    if (match) {
      match.qty += item.qty
    } else {
      next.push({ ...item })
    }
  }
  return next
}

export function snapshotCart(state) {
  return {
    customer: state.customer,
    items: state.items.map((i) => ({ ...i })),
    discountMode: state.discountMode,
    discountValue: state.discountValue,
    paymentMethod: state.paymentMethod,
    paymentReference: state.paymentReference,
    documentKind: state.documentKind,
  }
}

export const EMPTY_CART_PATCH = {
  items: [],
  discountMode: 'pct',
  discountValue: 0,
  paymentReference: '',
  transferProof: null,
  isExpense: false,
  documentKind: 'quote',
  isFinalized: false,
}
