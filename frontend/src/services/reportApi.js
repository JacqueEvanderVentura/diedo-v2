import { MEMBERSHIP_SEED } from '@/data/reportes'
import { METHOD_LABELS } from '@/modules/crm/lib/crm'
import { buildPersonalReport } from '@/modules/reportes/lib/personalReport'
import { paginateSlice, matchesSearch } from '@/modules/reportes/lib/pagination'
import {
  aggregateProductSales,
  buildIncomeExpenseSeries,
  expenseCategoryBreakdown,
  financialTotals,
  inAppointmentPeriod,
  inPeriod,
  incomeDistribution,
} from '@/modules/reportes/lib/reportes'
import apiClient from '@/services/apiClient'
import { catName } from '@/stores/finanzasStore'
import { useSessionStore } from '@/stores/sessionStore'

const REPORTS_BASE = '/api/v1/reports'
const delay = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

const FRONT_TO_API_STATUS = {
  pendiente: 'pending',
  confirmada: 'confirmed',
  completada: 'completed',
  asistio: 'attended',
  noshow: 'no_show',
  cancelada: 'cancelled',
  retrasada: 'delayed',
  reprogramada: 'rescheduled',
}

const API_TO_FRONT_STATUS = Object.fromEntries(
  Object.entries(FRONT_TO_API_STATUS).map(([front, api]) => [api, front])
)

function isOnline() {
  return useSessionStore.getState().status === 'online'
}

function number(value) {
  return Number(value) || 0
}

function pageResponse(data, mapItem = (item) => item) {
  const total = data.totalItems ?? data.total ?? 0
  const page = data.page || 1
  const pageSize = data.pageSize || 10
  return {
    ...data,
    items: (data.items || []).map(mapItem),
    page,
    pageSize,
    total,
    totalPages: data.totalPages || 1,
    from: total ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, total),
  }
}

function moneyPage(data, keys) {
  return pageResponse(data, (item) => ({
    ...item,
    ...Object.fromEntries(keys.map((key) => [key, number(item[key])])),
  }))
}

function filterMemberships(all, filters) {
  const { branchId, status, search, plan } = filters
  return all.filter((row) => {
    if (branchId && row.branchId !== branchId) return false
    if (status && row.status !== status) return false
    if (plan && row.plan !== plan) return false
    return matchesSearch(`${row.clientName} ${row.plan}`, search)
  })
}

export async function fetchGeneralSummary(getData, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/general/summary`, params)
    return {
      totals: {
        ingresos: number(data.totals?.income),
        gastos: number(data.totals?.expenses),
        balance: number(data.totals?.balance),
      },
      incomeExpenseSeries: (data.series || []).map((point) => ({
        label: point.label,
        Ingresos: number(point.income),
        Gastos: number(point.expenses),
      })),
      incomePie: (data.incomeDistribution || []).map((point) => ({
        ...point,
        value: number(point.value),
        pct: number(point.pct),
      })),
    }
  }
  await delay()
  const { sales = [], expenses = [], incomes = [] } = getData()
  return {
    totals: financialTotals(sales, expenses, incomes, params.period, params.branchId),
    incomeExpenseSeries: buildIncomeExpenseSeries(
      sales,
      expenses,
      incomes,
      params.period,
      params.branchId
    ),
    incomePie: incomeDistribution(
      sales,
      incomes,
      params.period,
      params.branchId,
      METHOD_LABELS
    ),
  }
}

export async function fetchMembershipReport(params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/memberships`, params)
    const page = moneyPage(data, ['amount'])
    return {
      ...page,
      summary: {
        ...data.summary,
        mrr: number(data.summary?.mrr),
        avgTicket: number(data.summary?.avgTicket),
        growthPct: number(data.summary?.growthPct),
        growth: (data.summary?.growth || []).map((point) => ({
          ...point,
          value: number(point.value),
        })),
        proximo: data.summary?.upcoming || 0,
        vencido: data.summary?.expired || 0,
      },
    }
  }
  await delay()
  const filtered = filterMemberships(MEMBERSHIP_SEED, params)
  const page = paginateSlice(filtered, params, {
    clientName: (row) => row.clientName,
    plan: (row) => row.plan,
    branchId: (row) => row.branchId,
    amount: (row) => row.amount,
    status: (row) => row.status,
    lastPayment: (row) => row.lastPaymentAt || row.lastPayment || '',
  })
  const active = filtered.filter((row) => row.status === 'activo')
  const mrr = active.reduce((sum, row) => sum + row.amount, 0)
  return {
    ...page,
    summary: {
      activeCount: active.length,
      mrr,
      avgTicket: active.length ? mrr / active.length : 0,
      proximo: filtered.filter((row) => row.status === 'proximo').length,
      vencido: filtered.filter((row) => row.status === 'vencido').length,
      newThisMonth: 30,
      growthPct: 12,
      growth: ['mar', 'abr', 'may', 'jun', 'jul', 'ago'].map((label, index) => ({
        label,
        value: 9000 + index * 4500,
      })),
      plans: [...new Set(MEMBERSHIP_SEED.map((row) => row.plan))].sort(),
    },
  }
}

export async function fetchTransactionsReport(getData, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/general/transactions`, params)
    return moneyPage(data, ['amount'])
  }
  await delay()
  const { branchId, type, search, period } = params
  const { sales = [], expenses = [], incomes = [] } = getData()
  const rows = [
    ...sales.map((sale) => ({
      id: `sale-${sale.id}`,
      date: sale.createdAt,
      type: 'ingreso',
      category: 'Venta POS',
      branchId: sale.branchId,
      amount: sale.total || 0,
    })),
    ...expenses.map((expense) => ({
      id: `exp-${expense.id}`,
      date: expense.date || expense.createdAt,
      type: 'gasto',
      category: expense.categoryName || expense.category || 'Gasto',
      branchId: expense.branchId,
      amount: expense.amount || 0,
    })),
    ...incomes.map((income) => ({
      id: `inc-${income.id}`,
      date: income.date || income.createdAt,
      type: 'ingreso',
      category: income.categoryName || income.category || 'Ingreso',
      branchId: income.branchId,
      amount: income.amount || 0,
    })),
  ]
    .filter((row) => !branchId || row.branchId === branchId)
    .filter((row) => !type || row.type === type)
    .filter((row) => !period || inPeriod(row.date, period))
    .filter((row) => matchesSearch(`${row.category} ${row.branchId}`, search))
  return paginateSlice(rows, params, {
    date: (row) => new Date(row.date),
    category: (row) => row.category,
    branchId: (row) => row.branchId,
    type: (row) => row.type,
    amount: (row) => row.amount,
  })
}

export async function fetchExpenseCategoryReport(getExpenses, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/general/expense-categories`, params)
    return moneyPage(data, ['amount', 'pct'])
  }
  await delay()
  const rows = expenseCategoryBreakdown(
    getExpenses(),
    params.period,
    params.branchId,
    catName
  ).filter((row) => matchesSearch(row.name, params.search))
  return paginateSlice(rows, params, {
    name: (row) => row.name,
    amount: (row) => row.amount,
    pct: (row) => row.pct,
  })
}

function localInventoryRows(getProducts, getSales, params) {
  const { branchId, search, category } = params
  const products = getProducts().filter(
    (product) => product.type === 'product' && product.stock !== null
  )
  const sales = (getSales?.() || []).filter(
    (sale) => !branchId || sale.branchId === branchId
  )
  const soldMap = aggregateProductSales(sales, products)
  return products
    .filter((product) => !category || product.category === category)
    .filter((product) => matchesSearch(product.name, search))
    .map((product) => {
      const sold = soldMap[product.id] || { sold: 0, revenue: 0, cost: 0 }
      const cost = Number(product.cost) || Number(product.price) * 0.6 || 0
      const price = Number(product.price) || 0
      const profit = sold.revenue - sold.cost
      return {
        id: product.id,
        name: product.name,
        category: product.category,
        branchId: branchId || product.branchId || 'charm-dn',
        cost,
        price,
        stock: product.stock || 0,
        minimumStock: product.minimumStock || 5,
        stockValueCost: cost * (product.stock || 0),
        stockValueSale: price * (product.stock || 0),
        sold: sold.sold,
        revenue: sold.revenue,
        profit,
        marginPct: price > 0 ? Number((((price - cost) / price) * 100).toFixed(2)) : 0,
      }
    })
}

export async function fetchInventorySummary(getProducts, getSales, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/inventory/summary`, {
      branchId: params.branchId,
      categoryId: params.category,
      search: params.search,
    })
    return {
      count: data.productsWithStock || 0,
      valueCost: number(data.valueAtCost),
      valueSale: number(data.valueAtSale),
      low: data.lowStockCount || 0,
      stock: (data.stock || []).map((point) => ({ ...point, value: number(point.value) })),
      valueByCategory: (data.valueByCategory || []).map((point) => ({
        ...point,
        value: number(point.value),
      })),
      margins: (data.margins || []).map((point) => ({
        ...point,
        margin: number(point.margin),
      })),
      categories: data.categories || [],
    }
  }
  await delay()
  const rows = localInventoryRows(getProducts, getSales, params)
  const byCategory = {}
  rows.forEach((row) => {
    byCategory[row.category] = (byCategory[row.category] || 0) + row.stockValueCost
  })
  return {
    count: rows.filter((row) => row.stock > 0).length,
    valueCost: rows.reduce((sum, row) => sum + row.stockValueCost, 0),
    valueSale: rows.reduce((sum, row) => sum + row.stockValueSale, 0),
    low: rows.filter((row) => row.stock <= row.minimumStock).length,
    stock: [...rows]
      .filter((row) => row.stock > 0)
      .sort((left, right) => right.stock - left.stock)
      .slice(0, 8)
      .map((row) => ({ label: row.name, value: row.stock })),
    valueByCategory: Object.entries(byCategory).map(([id, value]) => ({ id, name: id, value })),
    margins: [...rows]
      .filter((row) => row.price > 0)
      .sort((left, right) => right.marginPct - left.marginPct)
      .slice(0, 8)
      .map((row) => ({ label: row.name, margin: row.marginPct })),
    categories: [],
  }
}

export async function fetchInventoryReport(getProducts, getSales, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/inventory/items`, {
      ...params,
      categoryId: params.category,
      category: undefined,
    })
    return moneyPage(data, [
      'cost',
      'price',
      'stock',
      'minimumStock',
      'stockValueCost',
      'stockValueSale',
      'sold',
      'revenue',
      'profit',
      'marginPct',
    ])
  }
  await delay()
  const rows = localInventoryRows(getProducts, getSales, params)
  return paginateSlice(rows, params, {
    name: (row) => row.name,
    category: (row) => row.category,
    cost: (row) => row.cost,
    price: (row) => row.price,
    stock: (row) => row.stock,
    stockValueCost: (row) => row.stockValueCost,
    stockValueSale: (row) => row.stockValueSale,
    sold: (row) => row.sold,
    revenue: (row) => row.revenue,
    profit: (row) => row.profit,
    marginPct: (row) => row.marginPct,
  })
}

function agendaRows(getAppointments, params) {
  return getAppointments()
    .map((appointment) => ({ ...appointment, branchId: appointment.branchId || 'charm-dn' }))
    .filter((appointment) => !params.branchId || appointment.branchId === params.branchId)
    .filter((appointment) => !params.status || appointment.status === params.status)
    .filter((appointment) => !params.period || inAppointmentPeriod(appointment.date, params.period))
    .filter((appointment) =>
      matchesSearch(
        `${appointment.customerName || appointment.clientName || ''} ${appointment.serviceName || appointment.service || ''}`,
        params.search
      )
    )
}

export async function fetchAgendaSummary(getAppointments, getEmployees, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/agenda/summary`, {
      ...params,
      status: FRONT_TO_API_STATUS[params.status] || params.status,
    })
    return {
      total: data.totalAppointments || 0,
      attended: data.attendedCount || 0,
      noShow: data.noShowCount || 0,
      cancelled: data.cancelledCount || 0,
      selfBooking: data.selfBookingCount || 0,
      attendanceRate: number(data.attendanceRate),
      statusDistribution: (data.statusDistribution || []).map((point) => ({
        ...point,
        id: API_TO_FRONT_STATUS[point.id] || point.id,
      })),
      weekly: (data.weekly || []).map((point) => ({
        label: point.label,
        Cumplidas: point.completed,
        'No-show': point.noShow,
      })),
      byEmployee: data.byEmployee || [],
      bySource: data.bySource || [],
    }
  }
  await delay()
  const rows = agendaRows(getAppointments, params)
  const employeeMap = Object.fromEntries(
    getEmployees().map((employee) => [
      employee.id,
      `${employee.firstName} ${employee.lastName}`.trim(),
    ])
  )
  const attended = rows.filter((row) => ['completada', 'asistio'].includes(row.status))
  const noShow = rows.filter((row) => row.status === 'noshow').length
  const counts = {}
  const employeeCounts = {}
  rows.forEach((row) => {
    counts[row.status] = (counts[row.status] || 0) + 1
  })
  attended.forEach((row) => {
    const name = employeeMap[row.employeeId] || row.employeeName || 'Sin asignar'
    employeeCounts[name] = (employeeCounts[name] || 0) + 1
  })
  const now = new Date()
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - index))
    const key = [
      current.getFullYear(),
      String(current.getMonth() + 1).padStart(2, '0'),
      String(current.getDate()).padStart(2, '0'),
    ].join('-')
    const dayRows = getAppointments().filter((row) => row.date === key)
    return {
      label: current.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }),
      Cumplidas: dayRows.filter((row) => row.status === 'completada').length,
      'No-show': dayRows.filter((row) => row.status === 'noshow').length,
    }
  })
  return {
    total: rows.length,
    attended: attended.length,
    noShow,
    cancelled: counts.cancelada || 0,
    selfBooking: rows.filter((row) => row.source === 'self').length,
    attendanceRate: attended.length + noShow
      ? (attended.length / (attended.length + noShow)) * 100
      : 0,
    statusDistribution: Object.entries(counts).map(([id, value]) => ({ id, value })),
    weekly,
    byEmployee: Object.entries(employeeCounts).map(([name, value]) => ({ name, value })),
    bySource: [
      { id: 'staff', name: 'Equipo', value: rows.filter((row) => row.source !== 'self').length },
      { id: 'self', name: 'Auto-agendado', value: rows.filter((row) => row.source === 'self').length },
    ],
  }
}

export async function fetchAgendaReport(getAppointments, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/agenda/appointments`, {
      ...params,
      status: FRONT_TO_API_STATUS[params.status] || params.status,
    })
    return pageResponse(data, (appointment) => ({
      ...appointment,
      status: API_TO_FRONT_STATUS[appointment.status] || appointment.status,
    }))
  }
  await delay()
  const rows = agendaRows(getAppointments, params)
  return paginateSlice(rows, params, {
    date: (row) => `${row.date}${row.time || ''}`,
    time: (row) => row.time || '',
    customerName: (row) => row.customerName,
    employeeName: (row) => row.employeeName || row.employeeId,
    serviceName: (row) => row.serviceName || row.service,
    branchId: (row) => row.branchId,
    status: (row) => row.status,
    createdBy: (row) => row.createdBy,
    updatedBy: (row) => row.updatedBy,
  })
}

export async function fetchDividendReport(getBranches, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/dividends`, params)
    const page = moneyPage(data, ['share', 'dividend', 'totalBranchProfit'])
    return {
      ...page,
      items: page.items.map((item) => ({ ...item, cedula: item.document || '—' })),
      summary: {
        ...data.summary,
        totalDividends: number(data.summary?.totalDividends),
        undistributedProfit: number(data.summary?.undistributedProfit),
      },
    }
  }
  await delay()
  const rows = []
  getBranches().forEach((branch) => {
    if (params.branchId && branch.id !== params.branchId) return
    const profit = 120000 + branch.id.length * 17000
    ;(branch.partners || []).forEach((partner, index) => {
      const share = Number(partner.share) || 0
      rows.push({
        id: `${branch.id}-${index}`,
        partnerName: partner.name,
        cedula: partner.document || '—',
        branchId: branch.id,
        branchName: branch.name,
        share,
        dividend: Math.round((profit * share) / 100),
        totalBranchProfit: profit,
      })
    })
  })
  const filtered = rows.filter((row) =>
    matchesSearch(`${row.partnerName} ${row.branchName}`, params.search)
  )
  const page = paginateSlice(filtered, params, {
    partnerName: (row) => row.partnerName,
    branchName: (row) => row.branchName,
    share: (row) => row.share,
    dividend: (row) => row.dividend,
  })
  return {
    ...page,
    summary: {
      partners: filtered.length,
      branches: new Set(filtered.map((row) => row.branchId)).size,
      totalDividends: filtered.reduce((sum, row) => sum + row.dividend, 0),
      undistributedProfit: 0,
    },
  }
}

export async function fetchPersonalPerformanceReport(getData, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/personal`, params)
    return {
      ...data,
      totals: {
        ...data.totals,
        salesTotal: number(data.totals?.salesTotal),
        suppliesUsed: number(data.totals?.suppliesUsed),
        teamAverageAttended: number(data.totals?.teamAverageAttended),
      },
      byUser: (data.byUser || []).map((row) => ({
        ...row,
        salesTotal: number(row.salesTotal),
        avgTicket: number(row.avgTicket),
      })),
      byEmployee: (data.byEmployee || []).map((row) => ({
        ...row,
        revenue: number(row.revenue),
        avgTicket: number(row.avgTicket),
        attendanceVsTeamPct: number(row.attendanceVsTeamPct),
        supplyQuantity: number(row.supplyQuantity),
      })),
      incidentMetrics: data.incidentMetrics || [],
      incidentDistribution: data.incidentDistribution || [],
      supplyUsage: (data.supplyUsage || []).map((row) => ({
        ...row,
        qty: number(row.qty),
        perAppointment: row.perAppointment == null ? null : number(row.perAppointment),
      })),
    }
  }
  await delay()
  return buildPersonalReport({ ...getData(), ...params })
}

// Kept for the legacy personnel directory consumer.
export async function fetchPersonalReport(getEmployees, params) {
  await delay()
  const rows = getEmployees()
    .filter((employee) =>
      !params.branchId || (employee.branchIds || [employee.branchId]).includes(params.branchId)
    )
    .filter((employee) => !params.department || employee.department === params.department)
    .filter((employee) => !params.status || (params.status === 'activo') === employee.active)
    .filter((employee) =>
      matchesSearch(`${employee.firstName} ${employee.lastName} ${employee.position}`, params.search)
    )
    .map((employee) => ({ ...employee, name: `${employee.firstName} ${employee.lastName}` }))
  return paginateSlice(rows, params, {
    name: (row) => row.name,
    position: (row) => row.position,
    department: (row) => row.department,
    salary: (row) => row.salary,
    hireDate: (row) => row.hireDate,
  })
}
