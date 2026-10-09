import { appointmentsApi } from '@/services/appointmentsApi'
import { useAgendaStore } from '@/stores/agendaStore'
import { useSessionStore } from '@/stores/sessionStore'

const VISIT_STATUSES = new Set(['confirmada', 'cumplida', 'confirmed', 'fulfilled'])

export function applyBranchBookingDefaults(form, { serviceId, employeeId }, { services, bookableStaff }) {
  const next = { ...form }
  if (serviceId && services.some((service) => service.id === serviceId)) {
    next.serviceId = serviceId
  }
  if (employeeId && bookableStaff.some((member) => member.id === employeeId)) {
    next.employeeId = employeeId
  }
  return next
}

export async function fetchLastVisitBookingDefaults(customerId) {
  if (!customerId || customerId === 'walk-in') {
    return { serviceId: '', employeeId: '' }
  }
  if (useSessionStore.getState().status === 'demo') {
    const appointments = useAgendaStore.getState().appointments
    const last = [...appointments]
      .filter((apt) => apt.customerId === customerId && VISIT_STATUSES.has(apt.status))
      .sort((left, right) => `${right.date}T${right.time}`.localeCompare(`${left.date}T${left.time}`))[0]
    return {
      serviceId: last?.serviceId || '',
      employeeId: last?.employeeId || '',
    }
  }
  const items = await appointmentsApi.appointments({
    customerId,
    pageSize: 1,
    sortBy: 'date',
    sortDirection: 'desc',
  })
  const last = items[0]
  return {
    serviceId: last?.serviceId || '',
    employeeId: last?.employeeId || '',
  }
}
