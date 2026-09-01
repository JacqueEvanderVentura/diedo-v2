const roundMoney = (value) => Math.round((Math.max(0, Number(value) || 0) + Number.EPSILON) * 100) / 100

export function calculatePosTotals({ items = [], discountMode = 'pct', discountValue = 0, taxPct = 18 }) {
  const normalized = items.map((item) => {
    const quantity = Math.round((Math.max(0, Number(item.qty) || 0) + Number.EPSILON) * 1000) / 1000
    const unitPrice = roundMoney(item.price)
    const gross = roundMoney(quantity * unitPrice)
    const rawTaxRate = item.taxPct ?? taxPct
    const taxRate = roundMoney(Math.min(100, Math.max(0, Number(rawTaxRate) || 0)))
    return { item, quantity, unitPrice, gross, taxRate }
  })
  const subtotal = roundMoney(normalized.reduce((sum, line) => sum + line.gross, 0))
  const normalizedDiscount = Math.max(0, Number(discountValue) || 0)
  const requestedDiscount = discountMode === 'amount'
    ? roundMoney(normalizedDiscount)
    : roundMoney(subtotal * Math.min(100, normalizedDiscount) / 100)
  const discountAmount = Math.min(subtotal, requestedDiscount)

  let remainingDiscount = discountAmount
  let remainingGross = subtotal
  const lines = normalized.map((line, index) => {
    let lineDiscount = 0
    if (remainingDiscount > 0 && line.gross > 0) {
      lineDiscount = index === normalized.length - 1 || remainingGross <= line.gross
        ? Math.min(line.gross, remainingDiscount)
        : Math.min(line.gross, roundMoney(remainingDiscount * line.gross / remainingGross))
    }
    remainingDiscount = roundMoney(remainingDiscount - lineDiscount)
    remainingGross = roundMoney(remainingGross - line.gross)
    const taxableAmount = roundMoney(line.gross - lineDiscount)
    const taxAmount = roundMoney(taxableAmount * line.taxRate / 100)
    return {
      ...line,
      discountAmount: lineDiscount,
      taxableAmount,
      taxAmount,
      total: roundMoney(taxableAmount + taxAmount),
    }
  })

  return {
    lines,
    subtotal,
    discountAmount: roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0)),
    taxableAmount: roundMoney(lines.reduce((sum, line) => sum + line.taxableAmount, 0)),
    taxAmount: roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0)),
    total: roundMoney(lines.reduce((sum, line) => sum + line.total, 0)),
  }
}

export function calcSnapshotTotal(values) {
  return calculatePosTotals(values).total
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
    activeQuoteId: state.activeQuoteId || null,
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
  activeQuoteId: null,
}
