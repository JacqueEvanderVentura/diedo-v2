import { inDateRange, isCustomPeriod, resolvePeriodRange, toDateInputValue } from '@/lib/datePeriod'

export const GESTION_CITAS_DATE_PERIODS = [
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'month', label: 'Este mes' },
  { id: 'quarter', label: 'Este trimestre' },
  { id: 'all', label: 'Todas las fechas' },
]

export function defaultGestionCitasDateFilter() {
  return { period: 'all', dateFrom: null, dateTo: null }
}

export function gestionCitasMatchesDate(date, dateFilter) {
  if (!dateFilter || dateFilter.period === 'all') return true
  if (!date) return false
  return inDateRange(date, dateFilter)
}

export function gestionCitasAppointmentParams(dateFilter) {
  if (!dateFilter || dateFilter.period === 'all') return {}
  if (isCustomPeriod(dateFilter)) {
    const { dateFrom, dateTo } = dateFilter
    if (!dateFrom) return {}
    return { dateFrom, dateTo: dateTo || dateFrom }
  }
  const { start, end } = resolvePeriodRange(dateFilter)
  return {
    dateFrom: toDateInputValue(start),
    dateTo: toDateInputValue(end),
  }
}
