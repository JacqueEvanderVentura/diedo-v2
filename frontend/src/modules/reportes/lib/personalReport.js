import { filterByBranch, filterByPeriod } from './reportes'
import { computeSupplyUsageKpis } from '@/modules/inventarios/lib/supplyUsage'

const ATTENDED = new Set(['completada', 'asistio', 'confirmada'])

function staffDisplayName(id, employees = [], agendaStaff = []) {
  const rrhh = employees.find((e) => e.id === id)
  if (rrhh) return `${rrhh.firstName} ${rrhh.lastName}`.trim()
  return agendaStaff.find((e) => e.id === id)?.name || id || 'Sin asignar'
}

export function buildPersonalReport({
  sales = [],
  appointments = [],
  users = [],
  employees = [],
  agendaStaff = [],
  movements = [],
  supplies = [],
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

  const byEmployee = [...new Set(periodAppts.map((a) => a.employeeId).filter(Boolean))]
    .map((empId) => {
      const name = staffDisplayName(empId, employees, agendaStaff)
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
        noShows: noShows.length,
        revenue,
        avgTicket: served.length ? revenue / served.length : 0,
      }
    })
    .filter((row) => {
      if (!q) return row.appointmentsAttended > 0 || row.noShows > 0
      return (
        row.name.toLowerCase().includes(q) ||
        row.position.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => b.appointmentsAttended - a.appointmentsAttended)

  const supplyUsage = computeSupplyUsageKpis({
    movements: movements.filter((m) => !branchId || m.branchId === branchId),
    appointments: periodAppts,
    supplies,
    employees: [
      ...employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim() })),
      ...agendaStaff.map((e) => ({ id: e.id, name: e.name })),
    ],
  }).filter((row) => {
    if (!q) return true
    return row.employeeName.toLowerCase().includes(q) || row.supplyName.toLowerCase().includes(q)
  })

  return { totals, byUser, byEmployee, supplyUsage }
}
