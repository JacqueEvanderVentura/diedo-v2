const METHOD_LABELS = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
  link: 'Link de Pago',
  cxc: 'Cuenta por Cobrar',
}

export function methodLabel(id) {
  return METHOD_LABELS[id] || id
}

export function buildShiftMovements({ shiftSales = [], shiftIncomes = [], expenses = [] }) {
  const sales = shiftSales.map((s) => ({
    id: s.id,
    type: 'venta',
    label: s.customer?.name || s.items?.[0]?.name || 'Venta',
    amount: s.total,
    method: s.method,
    createdAt: s.createdAt,
    meta: s,
  }))

  const incomes = shiftIncomes.map((i) => ({
    id: i.id,
    type: 'ingreso',
    label: i.concept,
    amount: i.amount,
    method: i.method || 'efectivo',
    createdAt: i.createdAt,
    meta: i,
  }))

  const outflows = expenses.map((e) => ({
    id: e.id,
    type: 'egreso',
    label: e.concept,
    amount: e.amount,
    method: e.method || null,
    createdAt: e.createdAt,
    meta: e,
  }))

  return [...sales, ...incomes, ...outflows].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  )
}

export function filterMovements(movements, tab) {
  if (!tab || tab === 'todos') return movements
  return movements.filter((m) => m.type === tab)
}

export function sumByMethod(shiftSales, methodId) {
  return shiftSales
    .filter((s) => s.method === methodId)
    .reduce((sum, s) => sum + (s.total || 0), 0)
}

export const PAYMENT_BREAKDOWN = [
  { id: 'efectivo', label: 'Efectivo', icon: 'Banknote' },
  { id: 'tarjeta', label: 'Tarjeta', icon: 'CreditCard' },
  { id: 'transferencia', label: 'Transferencia', icon: 'Smartphone' },
  { id: 'link', label: 'Link de Pago', icon: 'Link' },
]
