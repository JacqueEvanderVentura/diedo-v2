export const PORTAL_STATUS_FILTERS = [
  { id: 'confirmed', label: 'Pendientes', tone: 'brand' },
  { id: 'fulfilled', label: 'Completadas', tone: 'success' },
  { id: 'cancelled', label: 'Canceladas', tone: 'neutral' },
  { id: 'no_show', label: 'No-show', tone: 'danger' },
]

const STATUS_LABELS = {
  confirmed: 'Confirmada',
  fulfilled: 'Completada',
  cancelled: 'Cancelada',
  no_show: 'No asistió',
}

const STATUS_TONES = {
  confirmed: 'brand',
  fulfilled: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
}

export function portalStatusLabel(status) {
  return STATUS_LABELS[status] || status
}

export function portalStatusTone(status) {
  return STATUS_TONES[status] || 'neutral'
}

export function countAppointmentsByStatus(appointments) {
  const counts = Object.fromEntries(PORTAL_STATUS_FILTERS.map((item) => [item.id, 0]))
  ;(appointments || []).forEach((appointment) => {
    if (appointment?.status in counts) counts[appointment.status] += 1
  })
  return counts
}

export function filterAppointmentsByStatus(appointments, status) {
  if (!status) return appointments || []
  return (appointments || []).filter((appointment) => appointment?.status === status)
}

export function nextStatusFilter(current, selected) {
  return current === selected ? null : selected
}

export function canManageFromPortal(appointment) {
  return Boolean(
    appointment?.status === 'confirmed'
      && appointment?.managementToken
      && appointment?.canManageOnline !== false,
  )
}
