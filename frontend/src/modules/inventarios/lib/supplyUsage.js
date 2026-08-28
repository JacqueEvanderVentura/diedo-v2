const ATTENDED_STATUSES = new Set(['completada', 'asistio', 'confirmada'])

export function computeSupplyUsageKpis({ movements = [], appointments = [], supplies = [], employees = [] }) {
  const supplyIds = new Set(supplies.map((s) => s.id))
  const employeeName = (id) => employees.find((e) => e.id === id)?.name || id || 'Sin asignar'

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

  const apptCount = {}
  appointments
    .filter((a) => a.employeeId && ATTENDED_STATUSES.has(a.status))
    .forEach((a) => {
      apptCount[a.employeeId] = (apptCount[a.employeeId] || 0) + 1
    })

  return Object.values(usage)
    .map((row) => {
      const appointmentsCount = apptCount[row.employeeId] || 0
      const perAppointment = appointmentsCount > 0 ? row.qty / appointmentsCount : null
      return {
        ...row,
        appointmentsCount,
        perAppointment,
        summary:
          appointmentsCount > 0
            ? `${row.qty} ${row.supplyName} en ${appointmentsCount} citas (~${perAppointment.toFixed(1)} por cita)`
            : `${row.qty} ${row.supplyName} (sin citas contadas)`,
      }
    })
    .sort((a, b) => b.qty - a.qty)
}
