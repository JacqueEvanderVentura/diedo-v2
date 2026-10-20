import { useEffect } from 'react'
import { useAgendaStore } from '@/stores/agendaStore'

/**
 * Keeps the agenda store loaded with this employee's appointments on the given date
 * (all branches), so slot pickers match the real calendar.
 */
export function useAvailabilityAppointments(date, employeeId, branchId) {
  const appointments = useAgendaStore((state) => state.appointments)
  const hydrateAppointments = useAgendaStore((state) => state.hydrateAppointments)

  useEffect(() => {
    if (!date) return
    if (!employeeId && !branchId) return
    hydrateAppointments({
      force: true,
      params: {
        dateFrom: date,
        dateTo: date,
        ...(employeeId ? { employeeId } : {}),
        ...(branchId ? { branchId } : {}),
      },
    }).catch(() => {})
  }, [branchId, date, employeeId, hydrateAppointments])

  return appointments
}
