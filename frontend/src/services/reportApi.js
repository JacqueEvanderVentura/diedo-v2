/**
 * Simulated report API — paginated responses ready for a real backend swap.
 * Each fetch receives { page, pageSize, ...filters } and returns one page of data.
 */

import { paginateSlice, matchesSearch } from '@/modules/reportes/lib/pagination'
import { MEMBERSHIP_SEED } from '@/data/reportes'
import { inPeriod, parseWhen } from '@/modules/reportes/lib/reportes'

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
  const page = paginateSlice(filtered, params)
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
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  return paginateSlice(rows, params)
}

export async function fetchInventoryReport(getProducts, params) {
  await delay()
  const { branchId, search, category } = params
  const products = getProducts().filter((p) => p.type === 'product' && p.stock !== null)

  const rows = products
    .filter((p) => !category || p.category === category)
    .filter((p) => matchesSearch(p.name, search))
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      branchId: branchId || 'charm-dn',
      cost: p.cost || p.price * 0.6,
      price: p.price,
      stock: p.stock || 0,
      sold: Math.max(1, (p.id.charCodeAt(2) || 5) % 40),
      revenue: p.price * Math.max(1, (p.id.charCodeAt(2) || 5) % 40),
      profit: (p.price - (p.cost || p.price * 0.6)) * Math.max(1, (p.id.charCodeAt(2) || 5) % 40),
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return paginateSlice(rows, params)
}

export async function fetchAgendaReport(getAppointments, params) {
  await delay()
  const { branchId, status, search, period } = params
  const rows = getAppointments()
    .map((a) => ({ ...a, branchId: a.branchId || 'charm-dn' }))
    .filter((a) => !branchId || a.branchId === branchId)
    .filter((a) => !status || a.status === status)
    .filter((a) => !period || inPeriod(a.date, period))
    .filter((a) => matchesSearch(`${a.clientName} ${a.serviceName || a.service || ''}`, search))
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`))

  return paginateSlice(rows, params)
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
  const page = paginateSlice(filtered, params)
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
    .filter((e) => !branchId || e.branchId === branchId)
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
      salary: e.salary,
      active: e.active,
      hireDate: e.hireDate,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return paginateSlice(rows, params)
}
