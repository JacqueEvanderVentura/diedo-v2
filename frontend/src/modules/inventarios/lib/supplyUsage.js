import { computeExpectedSupplyUsage } from '@/modules/inventarios/lib/serviceBom'

const ATTENDED_STATUSES = new Set(['cumplida', 'completada', 'asistio'])

function varianceLabel(variance, expectedQty) {
  if (!expectedQty) return 'Sin BOM definido'
  if (variance === 0) return 'Consumo alineado'
  if (variance > 0) return `Sobreuso +${variance}`
  return `Subuso ${variance}`
}

export function computeSupplyUsageKpis({
  movements = [],
  appointments = [],
  supplies = [],
  services = [],
  employees = [],
}) {
  const supplyIds = new Set(supplies.map((s) => s.id))
  const supplyNameById = Object.fromEntries(supplies.map((supply) => [supply.id, supply.name]))
  const employeeName = (id) => employees.find((e) => e.id === id)?.name || id || 'Sin asignar'
  const expectedUsage = computeExpectedSupplyUsage({ appointments, services })

  const usage = {}
  movements
    .filter((m) => m.type === 'salida')
    .forEach((m) => {
      const empId = m.employeeId
      if (!empId) return
      m.items.forEach((item) => {
        if (!supplyIds.has(item.id)) return
        const key = `${empId}:${item.id}`
        if (!usage[key]) {
          usage[key] = {
            employeeId: empId,
            employeeName: m.employeeName || employeeName(empId),
            supplyId: item.id,
            supplyName: item.name,
            qty: 0,
          }
        }
        usage[key].qty += Number(item.qty) || 0
      })
    })

  Object.values(expectedUsage).forEach((row) => {
    const key = `${row.employeeId}:${row.supplyId}`
    if (!usage[key]) {
      usage[key] = {
        employeeId: row.employeeId,
        employeeName: employeeName(row.employeeId),
        supplyId: row.supplyId,
        supplyName: supplyNameById[row.supplyId] || row.supplyId,
        qty: 0,
      }
    }
  })

  const apptCount = {}
  appointments
    .filter((a) => a.employeeId && ATTENDED_STATUSES.has(a.status))
    .forEach((a) => {
      apptCount[a.employeeId] = (apptCount[a.employeeId] || 0) + 1
    })

  return Object.values(usage)
    .map((row) => {
      const key = `${row.employeeId}:${row.supplyId}`
      const expectedQty = expectedUsage[key]?.expectedQty || 0
      const appointmentsCount = apptCount[row.employeeId] || expectedUsage[key]?.appointmentsCount || 0
      const perAppointment = appointmentsCount > 0 ? row.qty / appointmentsCount : null
      const variance = expectedQty ? row.qty - expectedQty : null
      const summary = expectedQty
        ? `${row.qty}/${expectedQty} ${row.supplyName} (${varianceLabel(variance, expectedQty)})`
        : appointmentsCount > 0
          ? `${row.qty} ${row.supplyName} en ${appointmentsCount} citas (~${perAppointment?.toFixed(1)} por cita)`
          : `${row.qty} ${row.supplyName} (sin citas contadas)`
      return {
        ...row,
        expectedQty,
        variance,
        varianceLabel: varianceLabel(variance, expectedQty),
        appointmentsCount,
        perAppointment,
        summary,
      }
    })
    .sort((a, b) => (b.variance ?? b.qty) - (a.variance ?? a.qty))
}
