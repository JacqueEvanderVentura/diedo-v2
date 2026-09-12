import { MEMBERSHIP_SEED } from '@/data/reportes'
import { METHOD_LABELS } from '@/modules/crm/lib/crm'
import { buildPersonalReport } from '@/modules/reportes/lib/personalReport'
import { paginateSlice, matchesSearch } from '@/modules/reportes/lib/pagination'
import {
  buildConsolidatedReport,
  mapConsolidatedFromApi,
} from '@/modules/reportes/lib/consolidatedReport'
import { mapDividendAnalyticsFromApi } from '@/modules/reportes/lib/dividendsReport'
import {
  aggregateProductSales,
  buildIncomeExpenseSeries,
  expenseCategoryBreakdown,
  financialTotals,
  inAppointmentPeriod,
  inPeriod,
  incomeDistribution,
} from '@/modules/reportes/lib/reportes'
import { applyBranchFilter, branchIdFromSelection, matchesBranches } from '@/lib/branches'
import apiClient from '@/services/apiClient'
import { catName } from '@/stores/finanzasStore'
import { useSessionStore } from '@/stores/sessionStore'

function periodRange(params) {
  return { dateFrom: params.dateFrom, dateTo: params.dateTo }
}

function branchFilter(params) {
  return { branchId: params.branchId, branchIds: params.branchIds }
}

function apiReportParams(params) {
  return {
    ...params,
    branchId: branchIdFromSelection(params.branchIds, params.branchId) || undefined,
  }
}

const REPORTS_BASE = '/api/v1/reports'
const delay = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms))

const FRONT_TO_API_STATUS = {
  confirmada: 'confirmed',
  cumplida: 'fulfilled',
  noshow: 'no_show',
  cancelada: 'cancelled',
  completada: 'fulfilled',
  asistio: 'fulfilled',
  pendiente: 'confirmed',
  retrasada: 'confirmed',
  reprogramada: 'confirmed',
}

const API_TO_FRONT_STATUS = {
  confirmed: 'confirmada',
  fulfilled: 'cumplida',
  no_show: 'noshow',
  cancelled: 'cancelada',
  completed: 'cumplida',
  attended: 'cumplida',
  pending: 'confirmada',
  delayed: 'confirmada',
  rescheduled: 'confirmada',
}

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
  const { branchId, branchIds, status, search, plan } = filters
  return all.filter((row) => {
    if (branchIds?.length) {
      if (!matchesBranches(row, branchIds)) return false
    } else if (branchId && row.branchId !== branchId) return false
    if (status && row.status !== status) return false
    if (plan && row.plan !== plan) return false
    return matchesSearch(`${row.clientName} ${row.plan}`, search)
  })
}

export async function fetchConsolidatedReport(getData, params) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/general/consolidated`, apiReportParams(params))
    return mapConsolidatedFromApi(data)
  }
  await delay()
  const { sales = [], customers = [] } = getData()
  return buildConsolidatedReport({ sales, customers }, params)
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
    totals: financialTotals(sales, expenses, incomes, params.period, branchFilter(params), periodRange(params)),
    incomeExpenseSeries: buildIncomeExpenseSeries(
      sales,
      expenses,
      incomes,
      params.period,
      branchFilter(params),
      periodRange(params)
    ),
    incomePie: incomeDistribution(
      sales,
      incomes,
      params.period,
      branchFilter(params),
      METHOD_LABELS,
      periodRange(params)
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
  const { type, search, period } = params
  const range = periodRange(params)
  const { sales = [], expenses = [], incomes = [] } = getData()
  const rows = applyBranchFilter([
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
  ], branchFilter(params))
    .filter((row) => !type || row.type === type)
    .filter((row) => !period || inPeriod(row.date, period, range))
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
    branchFilter(params),
    catName,
    periodRange(params)
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
  const sales = applyBranchFilter(getSales?.() || [], branchFilter(params))
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
  const range = periodRange(params)
  return applyBranchFilter(
    getAppointments().map((appointment) => ({
      ...appointment,
      branchId: appointment.branchId || 'charm-dn',
    })),
    branchFilter(params)
  )
    .filter((appointment) => !params.status || appointment.status === params.status)
    .filter((appointment) => !params.period || inAppointmentPeriod(appointment.date, params.period, range))
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
  const attended = rows.filter((row) => ['cumplida', 'completada', 'asistio'].includes(row.status))
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
      Cumplidas: dayRows.filter((row) => ['cumplida', 'completada', 'asistio'].includes(row.status)).length,
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

export async function fetchDividendReport(getBranches, params, getFinancials) {
  if (isOnline()) {
    const data = await apiClient.get(`${REPORTS_BASE}/dividends`, apiReportParams(params))
    const page = moneyPage(data, ['share', 'dividend', 'totalBranchProfit'])
    const analytics = mapDividendAnalyticsFromApi({
      ...data.summary,
      totalDividends: data.summary?.totalDividends,
      totalNetProfit: data.summary?.totalNetProfit ?? data.summary?.total_net_profit,
      partners: data.summary?.partners,
      branches: data.summary?.branches,
      byBranch: data.summary?.byBranch ?? data.summary?.by_branch,
      byPartner: data.summary?.byPartner ?? data.summary?.by_partner,
    })
    return {
      ...page,
      items: page.items.map((item) => ({ ...item, cedula: item.document || '—' })),
      summary: {
        ...data.summary,
        partners: analytics.totals.partners,
        branches: analytics.totals.branches,
        totalDividends: analytics.totals.totalDividends,
        totalNetProfit: analytics.totals.netProfit,
        undistributedProfit: number(data.summary?.undistributedProfit ?? data.summary?.undistributed_profit),
      },
      analytics,
    }
  }
  await delay()
  const rows = []
  const financials = getFinancials?.() || { sales: [], expenses: [], incomes: [] }
  const branchFinancials = (branchId) => {
    const scoped = { branchIds: [branchId], ...params }
    const saleRows = applyBranchFilter(financials.sales || [], scoped)
      .filter((sale) => sale?.status !== 'voided' && inPeriod(sale.createdAt || sale.completedAt, params.period, scoped))
    const saleIncome = saleRows.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0)
    const manualIncome = applyBranchFilter(financials.incomes || [], scoped)
      .filter((row) => inPeriod(row.date || row.createdAt, params.period, scoped))
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    const expenses = applyBranchFilter(financials.expenses || [], scoped)
      .filter((row) => inPeriod(row.date || row.createdAt, params.period, scoped))
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    const grossIncome = saleIncome + manualIncome
    return { grossIncome, expenses, netProfit: grossIncome - expenses }
  }
  getBranches().forEach((branch) => {
    if (params.branchIds?.length && !params.branchIds.includes(branch.id)) return
    if (!params.branchIds?.length && params.branchId && branch.id !== params.branchId) return
    const { netProfit: profit } = branchFinancials(branch.id)
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
  const branchNet = [...new Set(filtered.map((row) => row.branchId))].map((branchId) => {
    const row = filtered.find((item) => item.branchId === branchId)
    return Number(row?.totalBranchProfit) || 0
  })
  const analytics = mapDividendAnalyticsFromApi({
    totalDividends: filtered.reduce((sum, row) => sum + row.dividend, 0),
    totalNetProfit: branchNet.reduce((sum, value) => sum + value, 0),
    partners: new Set(filtered.map((row) => row.partnerName)).size,
    branches: new Set(filtered.map((row) => row.branchId)).size,
    byBranch: [...new Set(filtered.map((row) => row.branchId))].map((branchId) => {
      const branchRows = filtered.filter((row) => row.branchId === branchId)
      const financial = branchFinancials(branchId)
      return {
        branchId,
        branchName: branchRows[0]?.branchName,
        grossIncome: financial.grossIncome,
        expenses: financial.expenses,
        netProfit: financial.netProfit,
        partners: branchRows.map((row) => ({
          partnerName: row.partnerName,
          document: row.cedula,
          share: row.share,
          dividend: row.dividend,
        })),
      }
    }),
    byPartner: [...new Set(filtered.map((row) => `${row.partnerName}::${row.cedula}`))].map((key, index) => {
      const partnerRows = filtered.filter((row) => `${row.partnerName}::${row.cedula}` === key)
      return {
        id: key,
        partnerName: partnerRows[0].partnerName,
        document: partnerRows[0].cedula,
        totalDividend: partnerRows.reduce((sum, row) => sum + row.dividend, 0),
        branches: partnerRows.map((row) => ({
          branchId: row.branchId,
          branchName: row.branchName,
          share: row.share,
          dividend: row.dividend,
        })),
      }
    }),
  })
  return {
    ...page,
    summary: {
      partners: analytics.totals.partners,
      branches: analytics.totals.branches,
      totalDividends: analytics.totals.totalDividends,
      totalNetProfit: analytics.totals.netProfit,
      undistributedProfit: 0,
    },
    analytics,
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
        onTimeAppointments: number(data.totals?.onTimeAppointments),
        delayedAppointments: number(data.totals?.delayedAppointments),
        punctualityRate: number(data.totals?.punctualityRate),
        supplyVariance: number(data.totals?.supplyVariance),
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
      employeeKpis: (data.employeeKpis || []).map((row) => ({
        ...row,
        score: number(row.score),
        appointmentsAttended: number(row.appointmentsAttended),
        punctualityRate: number(row.punctualityRate),
        incidentCount: number(row.incidentCount),
        supplyVariance: number(row.supplyVariance),
        actualSupply: number(row.actualSupply),
        expectedSupply: number(row.expectedSupply),
      })),
      supplyUsage: (data.supplyUsage || []).map((row) => ({
        ...row,
        qty: number(row.qty),
        expectedQty: number(row.expectedQty),
        variance: row.variance == null ? null : number(row.variance),
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
