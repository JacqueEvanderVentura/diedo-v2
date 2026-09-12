import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'
import { formatShortDate } from '@/modules/agenda/lib/calendar'

export const WHATSAPP_VARIABLE_CHIPS = {
  agenda: [
    { key: 'nombre_cliente', label: 'NOMBRE CLIENTE' },
    { key: 'firstName', label: 'PRIMER NOMBRE' },
    { key: 'fecha', label: 'FECHA' },
    { key: 'hora', label: 'HORA' },
    { key: 'servicio', label: 'SERVICIO' },
    { key: 'cita_fecha', label: 'CITA FECHA' },
    { key: 'cita_hora', label: 'CITA HORA' },
    { key: 'cita_servicio', label: 'CITA SERVICIO' },
    { key: 'cita_cabina', label: 'CITA CABINA' },
  ],
  oportunidades: [
    { key: 'nombre_cliente', label: 'NOMBRE CLIENTE' },
    { key: 'firstName', label: 'PRIMER NOMBRE' },
    { key: 'phone', label: 'TELÉFONO' },
    { key: 'empresa', label: 'EMPRESA' },
    { key: 'ubicacion', label: 'UBICACIÓN' },
  ],
  clientes: [
    { key: 'nombre_cliente', label: 'NOMBRE CLIENTE' },
    { key: 'firstName', label: 'PRIMER NOMBRE' },
    { key: 'phone', label: 'TELÉFONO' },
    { key: 'empresa', label: 'EMPRESA' },
    { key: 'cita_fecha', label: 'CITA FECHA' },
    { key: 'cita_hora', label: 'CITA HORA' },
    { key: 'cita_servicio', label: 'CITA SERVICIO' },
    { key: 'cita_cabina', label: 'CITA CABINA' },
  ],
}

export function firstNameFromDisplayName(name) {
  const normalized = String(name || '').trim()
  if (!normalized) return ''
  return normalized.split(/\s+/)[0] || normalized
}

export function hasWhatsAppVariableValue(vars, key) {
  const val = vars?.[key]
  return val != null && String(val).trim() !== ''
}

export function buildWhatsAppVariables({ name, phone, company, ...rest } = {}) {
  const displayName = name || rest.nombre_cliente || ''
  return {
    nombre_cliente: displayName,
    firstName: firstNameFromDisplayName(displayName),
    phone: phone || rest.phone || '',
    empresa: company || rest.empresa || '',
    ubicacion: rest.ubicacion || '',
    ...rest,
  }
}

function todayKey() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function findNextCustomerAppointment(appointments, customerId) {
  if (!customerId || !Array.isArray(appointments)) return null
  const today = todayKey()
  const upcoming = appointments
    .filter((apt) => (
      apt.customerId === customerId
      && apt.date >= today
      && normalizeAppointmentStatus(apt.status) !== 'cancelada'
    ))
    .sort((a, b) => `${a.date}T${a.time || ''}`.localeCompare(`${b.date}T${b.time || ''}`))
  return upcoming[0] || null
}

export function appointmentWhatsAppFields(appointment, resources = []) {
  if (!appointment) return {}
  const fecha = appointment.date ? formatShortDate(appointment.date) : ''
  const hora = appointment.time || ''
  const servicio = appointment.serviceName || ''
  const resourceId = appointment.cabinaId || appointment.resourceId
  const cabina = appointment.resourceName
    || (resourceId ? resources.find((item) => item.id === resourceId)?.name : '')
    || ''
  return {
    cita_fecha: fecha,
    cita_hora: hora,
    cita_servicio: servicio,
    cita_cabina: cabina,
    fecha,
    hora,
    servicio,
  }
}

export function buildCustomerWhatsAppVariables(customer, appointments = [], resources = []) {
  const apt = findNextCustomerAppointment(appointments, customer?.id)
  return buildWhatsAppVariables({
    name: customer?.name || customer?.displayName,
    phone: customer?.phone,
    company: customer?.company || customer?.businessName,
    ...appointmentWhatsAppFields(apt, resources),
  })
}

export function insertTemplateToken(body, token, caretIndex) {
  const insertion = `{{${token}}}`
  const index = Number.isFinite(caretIndex) ? caretIndex : body.length
  const next = `${body.slice(0, index)}${insertion}${body.slice(index)}`
  return { body: next, caret: index + insertion.length }
}
