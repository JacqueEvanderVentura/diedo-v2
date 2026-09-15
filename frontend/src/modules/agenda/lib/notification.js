export function emailResultMessage(notification) {
  if (!notification) return 'No se solicitó correo para esta cita.'
  if (notification.status === 'sent') return 'Correo aceptado por el proveedor. Revisa tu bandeja de entrada y spam.'
  if (notification.status === 'disabled') return 'La cita está guardada. El envío de correo está desactivado.'
  if (notification.status === 'failed' || notification.status === 'review') return 'La cita está guardada, pero no se pudo completar el correo. Conserva el enlace para gestionarla.'
  return 'La cita está guardada. El correo está pendiente; conserva el enlace para gestionarla.'
}

export function managementUrl(branchId, appointment) {
  return `/agendar/perfil?${new URLSearchParams({ branch: branchId, appointment: appointment.id, token: appointment.managementToken })}`
}

export function branchDateKey(timeZone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    ...(timeZone ? { timeZone } : {}), year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}
