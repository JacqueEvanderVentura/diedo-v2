import { useEffect } from 'react'
import { useAgendaStore } from '@/stores/agendaStore'

/**
 * Keeps the agenda store loaded with this employee's appointments on the given date
 * (all branches), so slot pickers match the real calendar.
 */
export function useAvailabilityAppointments(date, employeeId) {
  const appointments = useAgendaStore((state) => state.appointments)
  const hydrateAppointments = useAgendaStore((state) => state.hydrateAppointments)

  useEffect(() => {
    if (!date || !employeeId) return
    hydrateAppointments({
      force: true,
      params: {
        dateFrom: date,
        dateTo: date,
        employeeId,
      },
    }).catch(() => {})
  }, [date, employeeId, hydrateAppointments])

  return appointments
}
