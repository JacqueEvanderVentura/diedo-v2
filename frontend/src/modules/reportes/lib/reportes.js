// Utilidades de período para reportes (reutiliza opciones del dashboard).
export const REPORT_PERIODS = [
  { id: 'today', label: 'Hoy', days: 1 },
  { id: 'week', label: 'Esta semana', days: 7 },
  { id: 'month', label: 'Este mes', days: 30 },
  { id: 'quarter', label: 'Trimestre', days: 90 },
]

/** Períodos del reporte de agenda — incluye futuro y opción "todas". */
export const AGENDA_REPORT_PERIODS = [
  ...REPORT_PERIODS,
  { id: 'all', label: 'Todas' },
]

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function parseWhen(v) {
  if (!v) return null
  if (typeof v === 'string' && v.length === 10) {
    const [y, m, d] = v.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(v)
}

function periodStart(period) {
  const now = new Date()
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = REPORT_PERIODS.find((p) => p.id === period)?.days || 7
  return new Date(Date.now() - days * 86400000)
}

export function inPeriod(v, period) {
  const d = parseWhen(v)
  if (!d) return false
  const now = new Date()
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return d >= periodStart(period) && d <= endOfToday
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function startOfWeekMonday(d) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const s = startOfDay(d)
  s.setDate(s.getDate() + diff)
  return s
}

function endOfWeekSunday(d) {
  const end = startOfWeekMonday(d)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

function startOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q, 1)
}

function endOfQuarter(d) {
  const q = Math.floor(d.getMonth() / 3) * 3
  return new Date(d.getFullYear(), q + 3, 0, 23, 59, 59, 999)
}

/** Citas usan ventanas de calendario (incluyen fechas futuras del período). */
export function inAppointmentPeriod(v, period) {
  if (!period || period === 'all') return true
  const d = parseWhen(v)
  if (!d) return false
  const now = new Date()
  const appt = startOfDay(d)

  if (period === 'today') {
    return appt.getTime() === startOfDay(now).getTime()
  }
  if (period === 'week') {
    return appt >= startOfWeekMonday(now) && appt <= endOfWeekSunday(now)
  }
  if (period === 'month') {
    return appt >= new Date(now.getFullYear(), now.getMonth(), 1) && appt <= endOfMonth(now)
  }
  if (period === 'quarter') {
    return appt >= startOfQuarter(now) && appt <= endOfQuarter(now)
  }
  return inPeriod(v, period)
}

const dayLabel = (d) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`

// Serie temporal: por día (<=31d) o por semana (trimestre).
export function buildSeries(items, period, getDate, getValue = () => 1) {
  const start = periodStart(period)
  const now = new Date()
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const dayCount = Math.max(1, Math.round((now - startDay) / 86400000) + 1)
  const weekly = dayCount > 31

  const buckets = []
  const index = {}
  if (weekly) {
    for (let s = new Date(startDay); s <= now; s.setDate(s.getDate() + 7)) {
      const key = dayLabel(s)
      index[key] = buckets.length
      buckets.push({ label: key, value: 0, _from: new Date(s) })
    }
  } else {
    for (let s = new Date(startDay); s <= now; s.setDate(s.getDate() + 1)) {
      const key = dayLabel(s)
      index[key] = buckets.length
      buckets.push({ label: key, value: 0, _from: new Date(s) })
    }
  }

  items.forEach((it) => {
    const d = parseWhen(getDate(it))
    if (!d || d < startDay) return
    let bi
    if (weekly) {
      bi = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - startDay) / (7 * 86400000))
    } else {
      bi = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - startDay) / 86400000)
    }
    if (buckets[bi]) buckets[bi].value += getValue(it)
  })

  return buckets.map(({ label, value }) => ({ label, value }))
}

// Mock determinista estable por id (para rotación / no-shows).
export function mockFromId(id, min = 5, span = 40) {
  let h = 0
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) % 100000
  return min + (h % span)
}

export function filterByBranch(items, branchId, getBranchId = (i) => i.branchId) {
  if (!branchId) return items
  return items.filter((i) => getBranchId(i) === branchId)
}

export function filterByPeriod(items, period, getDate) {
  if (!period) return items
  return items.filter((i) => inPeriod(getDate(i), period))
}

export function aggregateProductSales(sales, products) {
  const byKey = {}
  const productById = Object.fromEntries(products.map((p) => [p.id, p]))
  const productByName = Object.fromEntries(products.map((p) => [p.name.toLowerCase(), p]))

  sales.forEach((sale) => {
    ;(sale.items || []).forEach((item) => {
      const product = (item.id && productById[item.id]) || productByName[String(item.name || '').toLowerCase()]
      if (!product || product.type !== 'product') return
      const key = product.id
      if (!byKey[key]) {
        byKey[key] = { productId: key, sold: 0, revenue: 0, cost: 0 }
      }
      const qty = Number(item.qty) || 1
      const price = Number(item.price) || 0
      const unitCost = Number(product.cost) || Number(product.price) * 0.6 || 0
      byKey[key].sold += qty
      byKey[key].revenue += price * qty
      byKey[key].cost += unitCost * qty
    })
  })

  return byKey
}

export function buildIncomeExpenseSeries(sales, expenses, incomes, period, branchId) {
  const saleRows = filterByPeriod(filterByBranch(sales, branchId), period, (s) => s.createdAt)
  const expenseRows = filterByPeriod(filterByBranch(expenses, branchId), period, (e) => e.date || e.createdAt)
  const incomeRows = filterByPeriod(filterByBranch(incomes, branchId), period, (e) => e.date || e.createdAt)

  const buckets = buildSeries(
    [
      ...saleRows.map((s) => ({ date: s.createdAt, amount: s.total || 0, kind: 'ingreso' })),
      ...incomeRows.map((e) => ({ date: e.date || e.createdAt, amount: e.amount || 0, kind: 'ingreso' })),
      ...expenseRows.map((e) => ({ date: e.date || e.createdAt, amount: e.amount || 0, kind: 'gasto' })),
    ],
    period,
    (r) => r.date,
    (r) => r.amount
  )

  const ingresoByLabel = {}
  const gastoByLabel = {}
  saleRows.forEach((s) => {
    const d = parseWhen(s.createdAt)
    const label = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
    ingresoByLabel[label] = (ingresoByLabel[label] || 0) + (s.total || 0)
  })
  incomeRows.forEach((e) => {
    const d = parseWhen(e.date || e.createdAt)
    const label = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
    ingresoByLabel[label] = (ingresoByLabel[label] || 0) + (e.amount || 0)
  })
  expenseRows.forEach((e) => {
    const d = parseWhen(e.date || e.createdAt)
    const label = `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`
    gastoByLabel[label] = (gastoByLabel[label] || 0) + (e.amount || 0)
  })

  return buckets.map((b) => ({
    label: b.label,
    Ingresos: ingresoByLabel[b.label] || 0,
    Gastos: gastoByLabel[b.label] || 0,
  }))
}

export function expenseCategoryBreakdown(expenses, period, branchId, getCategoryName = (c) => c) {
  const rows = filterByPeriod(filterByBranch(expenses, branchId), period, (e) => e.date || e.createdAt)
  const map = {}
  rows.forEach((e) => {
    const key = getCategoryName(e.category) || e.category || 'Otros'
    map[key] = (map[key] || 0) + (Number(e.amount) || 0)
  })
  const total = Object.values(map).reduce((a, v) => a + v, 0)
  return Object.entries(map)
    .map(([name, amount]) => ({
      name,
      amount,
      pct: total > 0 ? ((amount / total) * 100).toFixed(2) : '0.00',
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function incomeDistribution(sales, incomes, period, branchId, methodLabels = {}) {
  const saleRows = filterByPeriod(filterByBranch(sales, branchId), period, (s) => s.createdAt)
  const incomeRows = filterByPeriod(filterByBranch(incomes, branchId), period, (e) => e.date || e.createdAt)
  const map = {}
  saleRows.forEach((s) => {
    const key = methodLabels[s.method] || s.method || 'Venta POS'
    map[key] = (map[key] || 0) + (s.total || 0)
  })
  incomeRows.forEach((e) => {
    const key = e.categoryName || e.category || 'Ingreso manual'
    map[key] = (map[key] || 0) + (e.amount || 0)
  })
  const total = Object.values(map).reduce((a, v) => a + v, 0)
  return Object.entries(map)
    .map(([name, value]) => ({ name, value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }))
    .sort((a, b) => b.value - a.value)
}

export function financialTotals(sales, expenses, incomes, period, branchId) {
  const ingresos =
    filterByPeriod(filterByBranch(sales, branchId), period, (s) => s.createdAt).reduce((a, s) => a + (s.total || 0), 0) +
    filterByPeriod(filterByBranch(incomes, branchId), period, (e) => e.date || e.createdAt).reduce((a, e) => a + (e.amount || 0), 0)
  const gastos = filterByPeriod(filterByBranch(expenses, branchId), period, (e) => e.date || e.createdAt).reduce(
    (a, e) => a + (e.amount || 0),
    0
  )
  return { ingresos, gastos, balance: ingresos - gastos }
}
