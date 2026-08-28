/**
 * Simulated report API — paginated responses ready for a real backend swap.
 * Each fetch receives { page, pageSize, ...filters } and returns one page of data.
 */

import { paginateSlice, matchesSearch } from '@/modules/reportes/lib/pagination'
import { MEMBERSHIP_SEED } from '@/data/reportes'
import { inPeriod, inAppointmentPeriod, parseWhen, aggregateProductSales, expenseCategoryBreakdown } from '@/modules/reportes/lib/reportes'
import { catName } from '@/stores/finanzasStore'

const delay = (ms = 80) => new Promise((r) => setTimeout(r, ms))

function filterMemberships(all, filters) {
  const { branchId, status, search, plan } = filters
  return all.filter((row) => {
    if (branchId && row.branchId !== branchId) return false
    if (status && row.status !== status) return false
    if (plan && row.plan !== plan) return false
    if (!matchesSearch(`${row.clientName} ${row.plan}`, search)) return false
    return true
  })
}

export async function fetchMembershipReport(params) {
  await delay()
  const filtered = filterMemberships(MEMBERSHIP_SEED, params)
  const page = paginateSlice(filtered, params, {
    clientName: (r) => r.clientName,
    plan: (r) => r.plan,
    branchId: (r) => r.branchId,
    amount: (r) => r.amount,
    status: (r) => r.status,
    lastPayment: (r) => r.lastPaymentAt || r.lastPayment || '',
  })
  const active = filtered.filter((r) => r.status === 'activo')
  const mrr = active.reduce((s, r) => s + r.amount, 0)
  return {
    ...page,
    summary: {
      activeCount: active.length,
      mrr,
      avgTicket: active.length ? mrr / active.length : 0,
      proximo: filtered.filter((r) => r.status === 'proximo').length,
      vencido: filtered.filter((r) => r.status === 'vencido').length,
    },
  }
}

export async function fetchTransactionsReport(getData, params) {
  await delay()
  const { branchId, type, search, period } = params
  const { sales = [], expenses = [], incomes = [] } = getData()

  const rows = [
    ...sales.map((s) => ({
      id: `sale-${s.id}`,
      date: s.createdAt,
      type: 'ingreso',
      category: 'Venta POS',
      branchId: s.branchId,
      amount: s.total || 0,
    })),
    ...expenses.map((e) => ({
      id: `exp-${e.id}`,
      date: e.date || e.createdAt,
      type: 'gasto',
      category: e.categoryName || e.category || 'Gasto',
      branchId: e.branchId,
      amount: e.amount || 0,
    })),
    ...incomes.map((e) => ({
      id: `inc-${e.id}`,
      date: e.date || e.createdAt,
      type: 'ingreso',
      category: e.categoryName || e.category || 'Ingreso',
      branchId: e.branchId,
      amount: e.amount || 0,
    })),
  ]
    .filter((r) => !branchId || r.branchId === branchId)
    .filter((r) => !type || r.type === type)
    .filter((r) => !period || inPeriod(r.date, period))
    .filter((r) => matchesSearch(`${r.category} ${r.branchId}`, search))

  return paginateSlice(rows, params, {
    date: (r) => new Date(r.date),
    category: (r) => r.category,
    branchId: (r) => r.branchId,
    type: (r) => r.type,
    amount: (r) => r.amount,
  })
}

export async function fetchInventoryReport(getProducts, getSales, params) {
  await delay()
  const { branchId, search, category } = params
  const products = getProducts().filter((p) => p.type === 'product' && p.stock !== null)
  const sales = (getSales?.() || []).filter((s) => !branchId || s.branchId === branchId)
  const soldMap = aggregateProductSales(sales, products)

  const rows = products
    .filter((p) => !category || p.category === category)
    .filter((p) => matchesSearch(p.name, search))
    .map((p) => {
      const sold = soldMap[p.id] || { sold: 0, revenue: 0, cost: 0 }
      const unitCost = Number(p.cost) || Number(p.price) * 0.6 || 0
      const unitPrice = Number(p.price) || 0
      const profit = sold.revenue - sold.cost
      const marginPct = sold.revenue > 0 ? ((profit / sold.revenue) * 100).toFixed(2) : '0.00'
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        branchId: branchId || p.branchId || 'charm-dn',
        cost: unitCost,
        price: unitPrice,
        stock: p.stock || 0,
        stockValueCost: unitCost * (p.stock || 0),
        stockValueSale: unitPrice * (p.stock || 0),
        sold: sold.sold,
        revenue: sold.revenue,
        profit,
        marginPct,
      }
    })

  return paginateSlice(rows, params, {
    name: (r) => r.name,
    category: (r) => r.category,
    cost: (r) => r.cost,
    price: (r) => r.price,
    stock: (r) => r.stock,
    stockValueCost: (r) => r.stockValueCost,
    stockValueSale: (r) => r.stockValueSale,
    sold: (r) => r.sold,
    revenue: (r) => r.revenue,
    profit: (r) => r.profit,
    marginPct: (r) => Number(r.marginPct),
  })
}

export async function fetchExpenseCategoryReport(getExpenses, params) {
  await delay()
  const { branchId, period, search } = params
  const rows = expenseCategoryBreakdown(getExpenses(), period, branchId, catName).filter((r) =>
    matchesSearch(r.name, search)
  )
  return paginateSlice(rows, params, {
    name: (r) => r.name,
    amount: (r) => r.amount,
    pct: (r) => r.pct,
  })
}

export async function fetchAgendaReport(getAppointments, params) {
  await delay()
  const { branchId, status, search, period } = params
  const rows = getAppointments()
    .map((a) => ({ ...a, branchId: a.branchId || 'charm-dn' }))
    .filter((a) => !branchId || a.branchId === branchId)
    .filter((a) => !status || a.status === status)
    .filter((a) => !period || inAppointmentPeriod(a.date, period))
    .filter((a) => matchesSearch(`${a.customerName || a.clientName || ''} ${a.serviceName || a.service || ''}`, search))

  return paginateSlice(rows, params, {
    date: (r) => `${r.date}${r.time || ''}`,
    time: (r) => r.time || '',
    customerName: (r) => r.customerName,
    employeeName: (r) => r.employeeName || r.employeeId,
    serviceName: (r) => r.serviceName || r.service,
    branchId: (r) => r.branchId,
    status: (r) => r.status,
    createdBy: (r) => r.createdBy,
    updatedBy: (r) => r.updatedBy,
  })
}

export async function fetchDividendReport(getBranches, params) {
  await delay()
  const { branchId, search } = params
  const rows = []
  getBranches().forEach((branch) => {
    if (branchId && branch.id !== branchId) return
    const profit = 120000 + (branch.id.length * 17000)
    ;(branch.partners || []).forEach((partner, idx) => {
      const share = Number(partner.share) || 0
      rows.push({
        id: `${branch.id}-${idx}`,
        partnerName: partner.name,
        cedula: `001-${1000000 + idx + branch.id.length}-0`,
        branchId: branch.id,
        branchName: branch.name,
        share,
        dividend: Math.round((profit * share) / 100),
        totalBranchProfit: profit,
      })
    })
  })

  const filtered = rows.filter((r) => matchesSearch(`${r.partnerName} ${r.branchName}`, search))
  const page = paginateSlice(filtered, params, {
    partnerName: (r) => r.partnerName,
    cedula: (r) => r.cedula || '',
    branchName: (r) => r.branchName,
    share: (r) => r.share,
    dividend: (r) => r.dividend,
  })
  return {
    ...page,
    summary: {
      partners: filtered.length,
      branches: new Set(filtered.map((r) => r.branchId)).size,
      totalDividends: filtered.reduce((s, r) => s + r.dividend, 0),
    },
  }
}

export async function fetchPersonalReport(getEmployees, params) {
  await delay()
  const { branchId, department, status, search } = params
  const rows = getEmployees()
    .filter((e) => !branchId || (e.branchIds || [e.branchId]).includes(branchId))
    .filter((e) => !department || e.department === department)
    .filter((e) => {
      if (!status) return true
      if (status === 'activo') return e.active
      if (status === 'inactivo') return !e.active
      return true
    })
    .filter((e) => matchesSearch(`${e.firstName} ${e.lastName} ${e.position}`, search))
    .map((e) => ({
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      position: e.position,
      department: e.department,
      branchId: e.branchId,
      branchIds: e.branchIds || [e.branchId],
      salary: e.salary,
      active: e.active,
      hireDate: e.hireDate,
    }))

  return paginateSlice(rows, params, {
    name: (r) => r.name,
    position: (r) => r.position,
    department: (r) => r.department,
    salary: (r) => r.salary,
    hireDate: (r) => r.hireDate,
  })
}
