import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'
import { createDemoAppointmentResources } from '@/data/agenda'

const BRANCH_CODES_BY_DEMO_ID = {
  'charm-dn': ['HQ', 'DOWNTOWN'],
  'charm-santiago': ['NORTH'],
  'charm-este': ['EAST'],
}
const DEMO_ID_BY_BRANCH_CODE = {
  HQ: 'charm-dn',
  DOWNTOWN: 'charm-dn',
  NORTH: 'charm-santiago',
  EAST: 'charm-este',
}
const DEMO_BRANCH_NAMES = {
  HQ: 'Charm DN',
  DOWNTOWN: 'Charm DN',
  NORTH: 'Charm Santiago',
  EAST: 'Charm Este',
}
const STATUS_FROM_API = {
  pending: 'pendiente',
  confirmed: 'confirmada',
  completed: 'completada',
  attended: 'asistio',
  no_show: 'noshow',
  cancelled: 'cancelada',
  delayed: 'retrasada',
  rescheduled: 'reprogramada',
}
const DAY_NAMES = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function periodBounds(period, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'today') return [start, new Date(start.getTime() + 86400000)]
  if (period === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return [start, new Date(start.getTime() + 7 * 86400000)]
  }
  if (period === 'month') {
    start.setDate(1)
    return [start, new Date(start.getFullYear(), start.getMonth() + 1, 1)]
  }
  start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)
  return [start, new Date(start.getFullYear(), start.getMonth() + 3, 1)]
}

function selectedBranchCodes(branchId) {
  return branchId && branchId !== 'all'
    ? new Set(BRANCH_CODES_BY_DEMO_ID[branchId] || [])
    : null
}

function demoSaleTotal(snapshot, sale) {
  const profiles = new Map(snapshot.inventory.itemProfiles.map((item) => [item.itemSeedKey, item]))
  const subtotal = sale.lines.reduce((sum, line) => {
    const profile = profiles.get(line.itemSeedKey)
    return sum + (Number(line.unitPrice) || Number(profile?.salePrice) || 0) * Number(line.quantity)
  }, 0)
  const discount = sale.discountType === 'percent'
    ? subtotal * (Number(sale.discountValue) || 0) / 100
    : Math.min(subtotal, Number(sale.discountValue) || 0)
  return subtotal - discount + (subtotal - discount) * 0.18
}

function buildTrend(period, start, end, sales) {
  const valueForDate = (key) => sales
    .filter((sale) => dateKey(sale.completedAt) === key)
    .reduce((sum, sale) => sum + sale.total, 0)
  if (period === 'today') {
    const points = Array.from({ length: 12 }, (_, index) => ({
      label: `${index * 2 % 12 || 12} ${index * 2 < 12 ? 'AM' : 'PM'}`,
      value: sales
        .filter((sale) => new Date(sale.completedAt).getHours() >> 1 === index)
        .reduce((sum, sale) => sum + sale.total, 0),
    }))
    return { total: points.reduce((sum, point) => sum + point.value, 0), points }
  }
  if (period === 'week') {
    const points = Array.from({ length: 7 }, (_, index) => {
      const current = new Date(start.getTime() + index * 86400000)
      return {
        label: `${DAY_NAMES[index]} ${current.getDate()}`,
        value: valueForDate(dateKey(current)),
      }
    })
    return { total: points.reduce((sum, point) => sum + point.value, 0), points }
  }
  if (period === 'month') {
    const weekCount = Math.ceil(new Date(end.getTime() - 1).getDate() / 7)
    const points = Array.from({ length: weekCount }, (_, index) => ({
      label: `Sem ${index + 1}`,
      value: sales
        .filter((sale) => Math.floor((new Date(sale.completedAt).getDate() - 1) / 7) === index)
        .reduce((sum, sale) => sum + sale.total, 0),
    }))
    return { total: points.reduce((sum, point) => sum + point.value, 0), points }
  }
  const points = Array.from({ length: 3 }, (_, index) => {
    const month = (start.getMonth() + index) % 12
    return {
      label: MONTH_NAMES[month],
      value: sales
        .filter((sale) => new Date(sale.completedAt).getMonth() === month)
        .reduce((sum, sale) => sum + sale.total, 0),
    }
  })
  return { total: points.reduce((sum, point) => sum + point.value, 0), points }
}

function buildDemoDashboard(snapshot, { period = 'week', branchId = 'all' } = {}) {
  const [start, end] = periodBounds(period)
  const branchCodes = selectedBranchCodes(branchId)
  const matchesBranch = (item) => !branchCodes || branchCodes.has(item.branchCode)
  const inPeriod = (value) => {
    const date = new Date(value)
    return date >= start && date < end
  }
  const sales = snapshot.pos.sales
    .filter(matchesBranch)
    .filter((sale) => sale.status !== 'voided' && inPeriod(sale.completedAt))
    .map((sale) => ({ ...sale, total: demoSaleTotal(snapshot, sale) }))
  const trend = buildTrend(period, start, end, sales)
  const tasks = (snapshot.dashboard?.tasks || []).filter(matchesBranch)
  const customers = new Map(snapshot.customers.items.map((item) => [item.seedKey, item]))
  const catalog = new Map(snapshot.catalog.items.map((item) => [item.seedKey, item]))
  const today = dateKey(new Date())
  const appointments = (snapshot.agenda?.items || [])
    .filter(matchesBranch)
    .filter((item) => item.date === today && item.status !== 'cancelled')
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((item) => ({
      id: item.seedKey,
      branchId: DEMO_ID_BY_BRANCH_CODE[item.branchCode],
      customerName: customers.get(item.customerSeedKey)?.displayName || 'Cliente Mostrador',
      serviceName: catalog.get(item.serviceSeedKey)?.name || 'Sin servicio',
      date: item.date,
      time: item.time,
      status: STATUS_FROM_API[item.status] || item.status,
    }))
  const stockAlerts = snapshot.inventory.itemProfiles.flatMap((profile) => {
    const item = catalog.get(profile.itemSeedKey)
    return Object.entries(profile.stockByBranch || {})
      .filter(([code, units]) => matchesBranch({ branchCode: code }) && units <= profile.minimumStock)
      .map(([code, units]) => ({
        id: `${profile.itemSeedKey}:${code}`,
        itemId: profile.itemSeedKey,
        branchId: DEMO_ID_BY_BRANCH_CODE[code],
        branchName: DEMO_BRANCH_NAMES[code],
        name: item?.name || profile.itemSeedKey,
        sku: item?.sku || 'N/A',
        units: Number(units),
        minimumUnits: Number(profile.minimumStock),
        level: Number(units) <= 0 ? 'critical' : 'low',
      }))
  }).sort((a, b) => a.units - b.units)
  const activity = [
    ...sales.map((sale) => ({
      id: `sale:${sale.seedKey}`,
      branchId: DEMO_ID_BY_BRANCH_CODE[sale.branchCode],
      title: `Ingreso registrado por RD$ ${sale.total.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      occurredAt: sale.completedAt,
      source: 'POS',
      icon: 'FileText',
      to: '/pos/caja',
    })),
    ...snapshot.pos.registers.filter(matchesBranch).filter((item) => inPeriod(item.openedAt)).map((item) => ({
      id: `register:${item.seedKey}`,
      branchId: DEMO_ID_BY_BRANCH_CODE[item.branchCode],
      title: `Caja abierta en ${DEMO_BRANCH_NAMES[item.branchCode]}`,
      occurredAt: item.openedAt,
      source: 'POS',
      icon: 'Store',
      to: '/pos/caja',
    })),
    ...(snapshot.agenda?.items || []).filter(matchesBranch).filter((item) => inPeriod(item.createdAt)).map((item) => ({
      id: `appointment:${item.seedKey}`,
      branchId: DEMO_ID_BY_BRANCH_CODE[item.branchCode],
      title: `Cita agendada: ${customers.get(item.customerSeedKey)?.displayName || 'Cliente Mostrador'}`,
      occurredAt: item.createdAt,
      source: 'Agenda',
      icon: 'CalendarClock',
      to: '/agenda/calendario',
    })),
    ...tasks.filter((item) => inPeriod(item.createdAt)).map((item) => ({
      id: `task:${item.seedKey}`,
      branchId: DEMO_ID_BY_BRANCH_CODE[item.branchCode],
      title: `Tarea abierta: ${item.title}`,
      occurredAt: item.createdAt,
      source: 'Tareas',
      icon: 'ClipboardList',
      to: item.sourceRoute,
    })),
  ].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).slice(0, 10)
  return {
    summary: {
      period,
      branchId: branchId === 'all' ? null : branchId,
      revenue: trend.total,
      appointmentsToday: appointments.length,
      openTasks: tasks.filter((item) => ['open', 'in_progress'].includes(item.status) && inPeriod(item.dueAt)).length,
      currencyCode: 'DOP',
    },
    trend: { ...trend, period, branchId: branchId === 'all' ? null : branchId, currencyCode: 'DOP' },
    stockAlerts,
    appointments,
    activity,
  }
}

export const DEMO_SEED_ENABLED = import.meta.env.VITE_DEMO_SEED_ENABLED === 'true'

export class DemoRepository {
  constructor(snapshot = DEMO_SNAPSHOT) {
    this.snapshot = snapshot
  }

  get seedVersion() {
    return this.snapshot.seedVersion
  }

  session() {
    const user = this.snapshot.iam.users[0]
    return {
      id: user.seedKey,
      userId: user.seedKey,
      membershipId: `demo:${user.seedKey}`,
      workspaceId: `demo:${this.snapshot.workspaceSlug}`,
      name: user.displayName,
      email: user.email,
      role: 'Administrador demo',
      initials: user.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      branchIds: this.snapshot.foundation.branches.map((branch) => branch.seedKey),
      visibleBranches: this.snapshot.foundation.branches,
      effectivePermissionCodes: ['*'],
      enabledModules: ['*'],
      seedVersion: this.snapshot.seedVersion,
      source: 'demo',
    }
  }

  branches() {
    return structuredClone(this.snapshot.foundation.branches)
  }

  paymentMethods() {
    return structuredClone(this.snapshot.configuration.paymentMethods)
  }

  users() {
    return structuredClone(this.snapshot.iam.users)
  }

  customers() {
    return structuredClone(this.snapshot.customers.items)
  }

  employees() {
    return structuredClone(this.snapshot.employees.items)
  }

  catalog() {
    return structuredClone(this.snapshot.catalog)
  }

  inventory() {
    const inventory = structuredClone(this.snapshot.inventory)
    return {
      ...inventory,
      itemProfiles: inventory.itemProfiles.map((profile) => ({
        salePrice: null,
        unitCost: null,
        taxRate: 0,
        minimumStock: 0,
        stockByBranch: {},
        ...profile,
      })),
    }
  }

  purchasing() {
    return structuredClone(this.snapshot.purchasing)
  }

  hr() {
    return structuredClone(this.snapshot.hr)
  }

  pos() {
    return structuredClone(this.snapshot.pos)
  }

  dashboard(filters = {}) {
    return buildDemoDashboard(this.snapshot, filters)
  }

  appointments(params = {}) {
    const search = String(params.search || '').trim().toLowerCase()
    const customers = new Map(this.snapshot.customers.items.map((item) => [item.seedKey, item]))
    const catalog = new Map(this.snapshot.catalog.items.map((item) => [item.seedKey, item]))
    return (this.snapshot.agenda?.items || []).map((item) => ({
      id: item.seedKey,
      date: item.date,
      time: item.time,
      duration: item.durationMinutes,
      branchId: DEMO_ID_BY_BRANCH_CODE[item.branchCode],
      resourceId: item.resourceCode,
      cabinaId: item.resourceCode,
      customerId: item.customerSeedKey,
      customerName: customers.get(item.customerSeedKey)?.displayName || 'Cliente Mostrador',
      customerPhone: customers.get(item.customerSeedKey)?.phone || '',
      employeeId: item.employeeSeedKey || null,
      serviceId: item.serviceSeedKey || null,
      serviceName: catalog.get(item.serviceSeedKey)?.name || 'Sin servicio',
      status: STATUS_FROM_API[item.status] || item.status,
      price: 0,
      pendingPayment: false,
      pendingAmount: 0,
      recurrence: 'none',
      repeatCount: 1,
      reminderSent: false,
      source: 'staff',
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
      version: 1,
      history: [],
    })).filter((appointment) => {
      if (params.branchId && appointment.branchId !== params.branchId) return false
      if (params.dateFrom && appointment.date < params.dateFrom) return false
      if (params.dateTo && appointment.date > params.dateTo) return false
      if (params.employeeId && appointment.employeeId !== params.employeeId) return false
      if (params.status && appointment.status !== params.status) return false
      if (!search) return true
      return appointment.customerName.toLowerCase().includes(search)
        || appointment.serviceName.toLowerCase().includes(search)
        || appointment.customerPhone.includes(search)
    })
  }

  appointmentResources({ branchId } = {}) {
    return createDemoAppointmentResources(branchId)
  }
}

export const demoRepository = new DemoRepository()
