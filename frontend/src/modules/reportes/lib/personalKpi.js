const ATTENDED = new Set(['cumplida', 'completada', 'asistio'])

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

export function computePunctualityStats(appointments = []) {
  const attended = appointments.filter((appointment) => ATTENDED.has(appointment.status))
  const onTime = attended.filter((appointment) => (
    appointment.completionPunctuality === 'on_time' || !appointment.completionPunctuality
  )).length
  const delayed = attended.filter((appointment) => appointment.completionPunctuality === 'delayed').length
  const rate = attended.length ? Math.round((onTime / attended.length) * 100) : 100
  return { attended: attended.length, onTime, delayed, rate }
}

export function computeEmployeeKpiScore({
  appointmentsAttended = 0,
  teamAverageAttended = 0,
  punctualityRate = 100,
  incidentCount = 0,
  supplyVariance = 0,
  expectedSupply = 0,
}) {
  const attendanceScore = teamAverageAttended
    ? clamp((appointmentsAttended / teamAverageAttended) * 100)
    : appointmentsAttended > 0
      ? 100
      : 0
  const punctualityScore = clamp(punctualityRate)
  const incidentPenalty = Math.min(30, incidentCount * 5)
  const varianceRatio = expectedSupply > 0 ? supplyVariance / expectedSupply : 0
  const supplyPenalty = clamp(varianceRatio * 100, 0, 25)
  const raw = (
    attendanceScore * 0.35
    + punctualityScore * 0.35
    + Math.max(0, 100 - incidentPenalty) * 0.15
    + Math.max(0, 100 - supplyPenalty) * 0.15
  )
  return Math.round(clamp(raw))
}

export function buildEmployeeKpis({
  appointments = [],
  employees = [],
  incidentMetrics = [],
  supplyUsage = [],
  teamAverageAttended = 0,
}) {
  const incidentByEmployee = Object.fromEntries(
    incidentMetrics.map((row) => [row.employeeId, row.total || 0]),
  )
  const supplyVarianceByEmployee = {}
  const expectedByEmployee = {}
  supplyUsage.forEach((row) => {
    supplyVarianceByEmployee[row.employeeId] = (
      (supplyVarianceByEmployee[row.employeeId] || 0) + (Number(row.variance) || 0)
    )
    expectedByEmployee[row.employeeId] = (
      (expectedByEmployee[row.employeeId] || 0) + (Number(row.expectedQty) || 0)
    )
  })

  const employeeIds = new Set([
    ...appointments.map((appointment) => appointment.employeeId).filter(Boolean),
    ...employees.map((employee) => employee.id),
  ])

  return [...employeeIds].map((employeeId) => {
    const employee = employees.find((item) => item.id === employeeId)
    const employeeAppointments = appointments.filter((appointment) => appointment.employeeId === employeeId)
    const attended = employeeAppointments.filter((appointment) => ATTENDED.has(appointment.status))
    const punctuality = computePunctualityStats(employeeAppointments)
    const appointmentsAttended = attended.length
    const supplyVariance = supplyVarianceByEmployee[employeeId] || 0
    const expectedSupply = expectedByEmployee[employeeId] || 0
    const score = computeEmployeeKpiScore({
      appointmentsAttended,
      teamAverageAttended,
      punctualityRate: punctuality.rate,
      incidentCount: incidentByEmployee[employeeId] || 0,
      supplyVariance,
      expectedSupply,
    })
    const name = employee
      ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim()
      : employeeId
    return {
      employeeId,
      name,
      position: employee?.position || 'Especialista',
      score,
      appointmentsAttended,
      onTimeCount: punctuality.onTime,
      delayedCount: punctuality.delayed,
      punctualityRate: punctuality.rate,
      incidentCount: incidentByEmployee[employeeId] || 0,
      supplyVariance,
      expectedSupply,
      actualSupply: (supplyUsage
        .filter((row) => row.employeeId === employeeId)
        .reduce((sum, row) => sum + (Number(row.qty) || 0), 0)),
    }
  })
    .filter((row) => row.appointmentsAttended > 0 || row.incidentCount > 0 || row.actualSupply > 0)
    .sort((left, right) => right.score - left.score)
}
