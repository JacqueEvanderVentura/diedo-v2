import { filterByBranch, filterByPeriod } from './reportes'
import { computeSupplyUsageKpis } from '@/modules/inventarios/lib/supplyUsage'

const ATTENDED = new Set(['completada', 'asistio'])
const INCIDENT_LABELS = {
  ausencia: 'Ausencias',
  vacaciones: 'Vacaciones',
  amonestacion: 'Amonestaciones',
  tardanza: 'Tardanzas',
  licencia_medica: 'Licencias médicas',
  otro: 'Otros',
}

function periodBounds(period) {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  if (period === 'today') end.setDate(end.getDate() + 1)
  if (period === 'week') {
    const mondayOffset = start.getDay() === 0 ? -6 : 1 - start.getDay()
    start.setDate(start.getDate() + mondayOffset)
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 7)
  }
  if (period === 'month') {
    start.setDate(1)
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1)
  }
  if (period === 'quarter') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)
    end.setFullYear(start.getFullYear(), start.getMonth() + 3, 1)
  }
  return { start, end }
}

function overlappingDays(startDate, endDate, period) {
  const bounds = periodBounds(period)
  const start = new Date(`${startDate}T00:00:00`)
  const inclusiveEnd = new Date(`${endDate}T00:00:00`)
  inclusiveEnd.setDate(inclusiveEnd.getDate() + 1)
  const overlapStart = Math.max(start.getTime(), bounds.start.getTime())
  const overlapEnd = Math.min(inclusiveEnd.getTime(), bounds.end.getTime())
  return Math.max(0, Math.round((overlapEnd - overlapStart) / 86400000))
}

function staffDisplayName(id, employees = []) {
  const rrhh = employees.find((e) => e.id === id)
  if (rrhh) return `${rrhh.firstName} ${rrhh.lastName}`.trim()
  return id || 'Sin asignar'
}

export function buildPersonalReport({
  sales = [],
  appointments = [],
  users = [],
  employees = [],
  movements = [],
  supplies = [],
  incidents = [],
  vacationRequests = [],
  branchId = '',
  period = 'month',
  search = '',
}) {
  const q = search.trim().toLowerCase()
  const periodSales = filterByPeriod(filterByBranch(sales, branchId), period, (s) => s.createdAt)
  const periodAppts = filterByPeriod(filterByBranch(appointments, branchId), period, (a) => a.date)

  const totals = {
    salesTotal: periodSales.reduce((a, s) => a + (s.total || 0), 0),
    salesCount: periodSales.length,
    appointmentsAttended: periodAppts.filter((a) => ATTENDED.has(a.status)).length,
    appointmentsCreated: periodAppts.length,
    transactions: periodSales.length,
  }

  const byUser = users
    .filter((u) => u.active !== false)
    .map((user) => {
      const userSales = periodSales.filter((s) => s.soldBy === user.name)
      const created = periodAppts.filter((a) => a.createdBy === user.name)
      const salesTotal = userSales.reduce((a, s) => a + (s.total || 0), 0)
      return {
        id: user.id,
        name: user.name,
        role: user.role,
        salesCount: userSales.length,
        salesTotal,
        appointmentsCreated: created.length,
        avgTicket: userSales.length ? salesTotal / userSales.length : 0,
      }
    })
    .filter((row) => {
      if (!q) return row.salesCount > 0 || row.appointmentsCreated > 0
      return row.name.toLowerCase().includes(q) || String(row.role).toLowerCase().includes(q)
    })
    .sort((a, b) => b.salesTotal - a.salesTotal)

  const periodMovements = filterByPeriod(
    movements.filter((movement) => !branchId || movement.branchId === branchId),
    period,
    (movement) => movement.createdAt
  )
  const supplyUsage = computeSupplyUsageKpis({
    movements: periodMovements,
    appointments: periodAppts,
    supplies,
    employees: employees.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
    })),
  })

  const periodIncidents = filterByPeriod(
    incidents.filter((incident) => (
      incident.type === 'personal'
      && incident.employeeId
      && (!branchId || incident.branchId === branchId)
    )),
    period,
    (incident) => incident.createdAt
  ).map((incident) => ({
    employeeId: incident.employeeId,
    kind: incident.employeeIncidentKind || 'otro',
    status: incident.status,
    count: 1,
    days: 0,
  }))
  const vacationIncidents = vacationRequests
    .filter((request) => request.status === 'aprobada')
    .map((request) => ({
      ...request,
      days: overlappingDays(request.startDate, request.endDate, period),
    }))
    .filter((request) => request.days > 0)
    .filter((request) => {
      if (!branchId) return true
      const employee = employees.find((item) => item.id === request.employeeId)
      return (employee?.branchIds || [employee?.branchId]).includes(branchId)
    })
    .map((request) => ({
      employeeId: request.employeeId,
      kind: 'vacaciones',
      status: request.status,
      count: 1,
      days: request.days,
    }))
  const employeeIncidents = [...periodIncidents, ...vacationIncidents]
  const incidentByEmployee = new Map()
  employeeIncidents.forEach((incident) => {
    const current = incidentByEmployee.get(incident.employeeId) || {
      total: 0,
      openCount: 0,
      vacationDays: 0,
      kinds: {},
    }
    current.total += incident.count
    current.vacationDays += incident.days
    current.kinds[incident.kind] = (current.kinds[incident.kind] || 0) + incident.count
    if (['abierta', 'en_proceso'].includes(incident.status)) current.openCount += incident.count
    incidentByEmployee.set(incident.employeeId, current)
  })
  const supplyByEmployee = new Map()
  supplyUsage.forEach((usage) => {
    supplyByEmployee.set(
      usage.employeeId,
      (supplyByEmployee.get(usage.employeeId) || 0) + usage.qty
    )
  })

  const relevantEmployeeIds = new Set([
    ...periodAppts.map((appointment) => appointment.employeeId).filter(Boolean),
    ...incidentByEmployee.keys(),
    ...supplyByEmployee.keys(),
  ])
  const employeeRows = [...relevantEmployeeIds]
    .map((empId) => {
      const name = staffDisplayName(empId, employees)
      const rrhh = employees.find((e) => e.id === empId)
      const served = periodAppts.filter((a) => a.employeeId === empId && ATTENDED.has(a.status))
      const noShows = periodAppts.filter((a) => a.employeeId === empId && a.status === 'noshow')
      const revenue = served.reduce((a, ap) => a + (Number(ap.price) || 0), 0)
      return {
        id: empId,
        name,
        position: rrhh?.position || 'Especialista',
        department: rrhh?.department || 'Operaciones',
        appointmentsAttended: served.length,
        attendanceVsTeamPct: 0,
        noShows: noShows.length,
        incidentCount: incidentByEmployee.get(empId)?.total || 0,
        supplyQuantity: supplyByEmployee.get(empId) || 0,
        revenue,
        avgTicket: served.length ? revenue / served.length : 0,
      }
    })
  const serviceEmployees = employeeRows.filter(
    (row) => row.appointmentsAttended > 0 || row.noShows > 0
  )
  const teamAverage = serviceEmployees.length
    ? serviceEmployees.reduce((sum, row) => sum + row.appointmentsAttended, 0)
      / serviceEmployees.length
    : 0
  const byEmployee = employeeRows
    .map((row) => ({
      ...row,
      attendanceVsTeamPct: teamAverage
        ? Number(((row.appointmentsAttended / teamAverage) * 100).toFixed(2))
        : 0,
    }))
    .filter((row) => {
      if (!q) return true
      return (
        row.name.toLowerCase().includes(q) ||
        row.position.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => b.appointmentsAttended - a.appointmentsAttended)

  const filteredSupplyUsage = supplyUsage.filter((row) => {
    if (!q) return true
    return row.employeeName.toLowerCase().includes(q) || row.supplyName.toLowerCase().includes(q)
  })

  const incidentMetrics = [...incidentByEmployee.entries()]
    .map(([employeeId, data]) => ({
      employeeId,
      employeeName: staffDisplayName(employeeId, employees),
      total: data.total,
      openCount: data.openCount,
      absences: data.kinds.ausencia || 0,
      vacations: data.kinds.vacaciones || 0,
      vacationDays: data.vacationDays,
      warnings: data.kinds.amonestacion || 0,
      lateness: data.kinds.tardanza || 0,
      medicalLeave: data.kinds.licencia_medica || 0,
      other: data.kinds.otro || 0,
    }))
    .filter((row) => !q || row.employeeName.toLowerCase().includes(q))
    .sort((left, right) => right.total - left.total)
  const incidentDistribution = Object.entries(
    employeeIncidents.reduce((counts, incident) => ({
      ...counts,
      [incident.kind]: (counts[incident.kind] || 0) + incident.count,
    }), {})
  ).map(([id, value]) => ({ id, name: INCIDENT_LABELS[id] || id, value }))

  totals.employeeIncidents = employeeIncidents.length
  totals.vacationDays = employeeIncidents.reduce((sum, incident) => sum + incident.days, 0)
  totals.suppliesUsed = supplyUsage.reduce((sum, usage) => sum + usage.qty, 0)
  totals.teamAverageAttended = Number(teamAverage.toFixed(2))

  return {
    totals,
    byUser,
    byEmployee,
    incidentMetrics,
    incidentDistribution,
    supplyUsage: filteredSupplyUsage,
  }
}
