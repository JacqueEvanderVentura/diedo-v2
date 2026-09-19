import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'
import { formatShortDate } from '@/modules/agenda/lib/calendar'

export const WHATSAPP_VARIABLE_CHIPS = {
  agenda: [
    { key: 'nombre_cliente', label: 'NOMBRE CLIENTE' },
    { key: 'firstName', label: 'PRIMER NOMBRE' },
    { key: 'fecha', label: 'FECHA' },
    { key: 'hora', label: 'HORA' },
    { key: 'servicio', label: 'SERVICIO' },
    { key: 'sucursal', label: 'SUCURSAL' },
    { key: 'sucursal_1', label: 'SUCURSAL 1' },
    { key: 'sucursal_2', label: 'SUCURSAL 2' },
    { key: 'enlace', label: 'ENLACE' },
    { key: 'cita_fecha', label: 'CITA FECHA' },
    { key: 'cita_hora', label: 'CITA HORA' },
    { key: 'cita_servicio', label: 'CITA SERVICIO' },
    { key: 'cita_cabina', label: 'CITA CABINA' },
  ],
  oportunidades: [
    { key: 'nombre_cliente', label: 'NOMBRE CLIENTE' },
    { key: 'firstName', label: 'PRIMER NOMBRE' },
    { key: 'phone', label: 'TELÉFONO' },
    { key: 'empresa', label: 'MI EMPRESA' },
    { key: 'ubicacion', label: 'UBICACIÓN' },
    { key: 'sucursal_1', label: 'SUCURSAL 1' },
    { key: 'sucursal_2', label: 'SUCURSAL 2' },
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
    { key: 'sucursal_1', label: 'SUCURSAL 1' },
    { key: 'sucursal_2', label: 'SUCURSAL 2' },
  ],
}

/** Nombres de las primeras sucursales activas (orden de configuración). */
export function buildBranchWhatsAppFields(branches = []) {
  const names = (Array.isArray(branches) ? branches : [])
    .filter((branch) => branch && branch.active !== false)
    .map((branch) => String(branch.name || '').trim())
    .filter(Boolean)
  const first = names[0] || ''
  const second = names[1] || ''
  return {
    sucursal: first,
    sucursal_1: first,
    sucursal_2: second,
  }
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
  const sucursal = appointment.branchName || ''
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
    sucursal,
  }
}

/** Variables para WhatsApp a un lead: `empresa` = tu negocio (no la empresa del prospecto). */
export function buildLeadWhatsAppVariables(lead, { sellerName = '', branches = [] } = {}) {
  const contactName = String(lead?.name || '').trim() || String(lead?.company || '').trim()
  return buildWhatsAppVariables({
    name: contactName,
    phone: lead?.phone,
    company: String(sellerName || '').trim(),
    ubicacion: lead?.location || '',
    ...buildBranchWhatsAppFields(branches),
  })
}

export function buildCustomerWhatsAppVariables(customer, appointments = [], resources = [], branches = []) {
  const apt = findNextCustomerAppointment(appointments, customer?.id)
  return buildWhatsAppVariables({
    name: customer?.name || customer?.displayName,
    phone: customer?.phone,
    company: customer?.company || customer?.businessName,
    ...appointmentWhatsAppFields(apt, resources),
    ...buildBranchWhatsAppFields(branches),
  })
}

export function insertTemplateToken(body, token, caretIndex) {
  const insertion = `{{${token}}}`
  const index = Number.isFinite(caretIndex) ? caretIndex : body.length
  const next = `${body.slice(0, index)}${insertion}${body.slice(index)}`
  return { body: next, caret: index + insertion.length }
}
