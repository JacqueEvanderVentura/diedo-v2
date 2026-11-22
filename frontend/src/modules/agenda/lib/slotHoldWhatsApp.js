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