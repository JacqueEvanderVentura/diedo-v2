import { formatLongDate, formatTime12h } from '@/modules/agenda/lib/calendar'
import { firstNameFromDisplayName } from '@/lib/whatsapp'
import { waMeUrl } from '@/lib/whatsapp'

export function unassignedContactLabel(value) {
  return value?.trim() ? value.trim() : 'No asignado'
}

export function buildSlotHoldWhatsAppMessage(hold) {
  if (!hold) return ''
  const firstName = firstNameFromDisplayName(hold.customerName) || 'cliente'
  const serviceName = hold.serviceName?.trim() || 'servicio'
  const dateLabel = formatLongDate(hold.date)
  const timeLabel = formatTime12h(hold.time)
  return (
    `Hola ${firstName}, vimos que tienes una cita de ${serviceName} `
    + `para el ${dateLabel} a las ${timeLabel}, ¿te gustaría que apartemos `
    + 'este espacio oficialmente para ti?'
  )
}

export function slotHoldWhatsAppUrl(hold) {
  const phone = hold?.customerPhone
  if (!phone?.trim()) return null
  return waMeUrl(phone, buildSlotHoldWhatsAppMessage(hold))
}

/** Notification snapshot of an abandoned booking, when the backend stored one. */
export function abandonedBookingSnapshot(notification) {
  if (notification?.eventType !== 'slot_hold.abandoned') return null
  return notification?.link?.slotHoldResume || null
}

/** Whether the "continue booking" WhatsApp button can be offered for a notification. */
export function canSendResumeBookingWhatsApp(notification) {
  return Boolean(abandonedBookingSnapshot(notification)?.customerPhone?.trim())
}

/**
 * Message to continue an abandoned booking. `date` / `time` are only mentioned when
 * the backend confirmed they are still bookable (null otherwise).
 */
export function buildResumeBookingWhatsAppMessage({
  customerName,
  serviceName,
  date = null,
  time = null,
  resumeUrl,
}) {
  const firstName = firstNameFromDisplayName(customerName) || 'cliente'
  const service = serviceName?.trim() || 'servicio'
  let when = ''
  if (date) {
    when = ` para el ${formatLongDate(date)}`
    if (time) when += ` a las ${formatTime12h(time)}`
  }
  return (
    `Hola ${firstName}, vimos que tienes una cita de ${service}${when}, `
    + `¿te gustaría que te la agendemos? Puedes continuar aquí: ${resumeUrl}`
  )
}

export function resumeBookingWhatsAppUrl({ customerPhone, ...messageInput }) {
  return waMeUrl(customerPhone, buildResumeBookingWhatsAppMessage(messageInput))
}