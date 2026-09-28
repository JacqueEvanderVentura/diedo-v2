import { CARWASH_PREVIEW_DATE, employeeName } from '../data/preview'

export function monthRange(day) {
  const [year, month] = day.split('-').map(Number)
  return { dateFrom: `${day.slice(0, 7)}-01`, dateTo: `${day.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` }
}

export function reportRangeError(from, to) {
  if (!from || !to) return 'Selecciona ambas fechas.'
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  const days = (end - start) / 86400000 + 1
  return !Number.isFinite(days) || days < 1 || days > 366 ? 'Selecciona un período válido de hasta 366 días.' : ''
}

// Synthetic examples only: never used by connected report or indicator requests.
export function demoReports(data, from, to) {
  const defaults = monthRange(CARWASH_PREVIEW_DATE)
  const dateFrom = from || defaults.dateFrom
  const dateTo = to || defaults.dateTo
  if (reportRangeError(dateFrom, dateTo)) return null
  const washes = data.washes.filter((row) => row.status === 'completed' && row.date >= dateFrom && row.date <= dateTo)
  const ids = new Set(washes.map((row) => row.id))
  const commissions = data.commissions.filter((row) => ids.has(row.washId))
  const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field]), 0).toFixed(2)
  const roleSum = (rows, role) => sum(rows.filter((row) => row.role === role), 'amount')
  const services = [...new Set(commissions.map((row) => row.service))].map((name) => ({ itemId: name, name, count: new Set(commissions.filter((row) => row.service === name).map((row) => row.washId)).size }))
  const employees = [...new Set(commissions.map((row) => row.employeeId))].map((employeeId) => {
    const earned = commissions.filter((row) => row.employeeId === employeeId)
    return { employeeId, name: employeeName(employeeId), washes: new Set(earned.map((row) => row.washId)).size, washerCommissions: roleSum(earned, 'washer'), supervisorCommissions: roleSum(earned, 'supervisor'), commissions: sum(earned, 'amount') }
  })
  const daily = []
  for (let current = Date.parse(`${dateFrom}T00:00:00Z`); current <= Date.parse(`${dateTo}T00:00:00Z`); current += 86400000) {
    const date = new Date(current).toISOString().slice(0, 10)
    const earned = commissions.filter((row) => row.date === date)
    const completed = washes.filter((row) => row.date === date)
    daily.push({ date, washes: completed.length, billed: sum(completed, 'total'), washerCommissions: roleSum(earned, 'washer'), supervisorCommissions: roleSum(earned, 'supervisor') })
  }
  return { dateFrom, dateTo, currency: 'DOP', timezone: 'America/Santo_Domingo', daily, services, employees, totals: { washes: washes.length, billed: sum(washes, 'total'), commissions: sum(commissions, 'amount'), washerCommissions: roleSum(commissions, 'washer'), supervisorCommissions: roleSum(commissions, 'supervisor'), serviceCount: services.reduce((total, row) => total + row.count, 0), employeeCount: employees.length } }
}
