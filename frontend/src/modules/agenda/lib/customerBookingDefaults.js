import { appointmentsApi } from '@/services/appointmentsApi'

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
