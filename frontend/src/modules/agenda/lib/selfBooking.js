import { timeSlots, endTime } from '@/modules/agenda/lib/calendar'
import { normalizeAppointmentStatus } from '@/modules/agenda/lib/completion'
import {
  getEmployeeSlotsForDate,
  isOnApprovedVacation,
  fitsInSchedule,
} from '@/modules/rrhh/lib/schedule'

export function normalizeAppointmentTime(value) {
  if (!value) return ''
  const parts = String(value).trim().split(':')
  const hours = Number(parts[0])
  const minutes = Number(parts[1] ?? 0)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function appointmentBlocksAvailability(appointment) {
  const status = normalizeAppointmentStatus(appointment?.status)
  return status !== 'cancelada'
}

export function timeRangesOverlap(startA, durA, startB, durB) {
  const toMin = (time) => {
    const normalized = normalizeAppointmentTime(time)
    const [h, m] = normalized.split(':').map(Number)
    return h * 60 + m
  }
  const durationA = Number(durA) || 30
  const durationB = Number(durB) || 30
  const a0 = toMin(startA)
  const a1 = a0 + durationA
  const b0 = toMin(startB)
  const b1 = b0 + durationB
  return a0 < b1 && b0 < a1
}

export function getEmployeeAppointmentsOnDate(appointments, { employeeId, date, excludeAppointmentId = null }) {
  if (!employeeId || !date) return []
  return appointments.filter(
    (appointment) =>
      appointment.id !== excludeAppointmentId
      && appointment.employeeId === employeeId
      && appointment.date === date
      && appointmentBlocksAvailability(appointment)
  )
}

export const DOC_TYPES = [
  { id: 'cedula', label: 'Cédula' },
  { id: 'pasaporte', label: 'Pasaporte' },
]

export function normalizeDocumentId(value) {
  return String(value || '').replace(/\D/g, '')
}

export function formatCedulaInput(value) {
  const digits = normalizeDocumentId(value).slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
}

export function formatDocumentInput(value, docType = 'cedula') {
  if (docType === 'cedula') return formatCedulaInput(value)
  return String(value || '').trim()
}

export function formatDocumentDisplay(value, docType = 'cedula') {
  if (docType === 'cedula') {
    const digits = normalizeDocumentId(value)
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
    }
  }
  return String(value || '').trim()
}

export function buildBookingUrl(branchId = 'charm-dn') {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const path = import.meta.env.BASE_URL?.replace(/\/$/, '') || ''
  return `${base}${path}/agendar?branch=${branchId}`
}

export function buildProfileUrl(documentId) {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const path = import.meta.env.BASE_URL?.replace(/\/$/, '') || ''
  return `${base}${path}/agendar/perfil?doc=${normalizeDocumentId(documentId)}`
}

export function getAvailableSlots({
  date,
  employeeId,
  duration = 30,
  appointments = [],
  employee = null,
  vacationRequests = [],
  excludeAppointmentId = null,
}) {
  if (!date || !employeeId) return []

  if (isOnApprovedVacation({ employeeId, date, vacationRequests })) return []

  const candidates = employee
    ? getEmployeeSlotsForDate({ employee, date, duration })
    : timeSlots(8, 20, 30)

  const busy = getEmployeeAppointmentsOnDate(appointments, {
    employeeId,
    date,
    excludeAppointmentId,
  })

  return candidates.filter((slot) => {
    const slotTime = normalizeAppointmentTime(slot)
    if (!slotTime) return false
    if (!fitsInSchedule({ employee, date, time: slotTime, duration })) return false
    return !busy.some((appointment) => timeRangesOverlap(
      slotTime,
      duration,
      appointment.time,
      appointment.duration
    ))
  })
}

export function isSlotAvailable(options) {
  const { time } = options
  if (!time) return false
  const normalized = normalizeAppointmentTime(time)
  return getAvailableSlots(options).includes(normalized)
}

/** Transactional email copy (cita confirmada, gestión cancelar/reagendar) — not used for sharing booking links. */
export function buildConfirmationEmail({ profile, branchName, bookingUrl, profileUrl }) {
  return {
    subject: `Tu cita en ${branchName} está confirmada`,
    preview: `Hola ${profile.name}, tu cita fue confirmada. Gestiona cambios desde tu perfil.`,
    body: `Hola ${profile.name},

Tu cita en ${branchName} ha sido confirmada.

Gestiona tu cita (cancelar, reagendar o actualizar datos): ${profileUrl}

${bookingUrl ? `Agenda en línea: ${bookingUrl}\n` : ''}
¡Te esperamos!`,
  }
}

export function buildBookingLinkWhatsAppMessage({ profile, branchName, bookingUrl, profileUrl }) {
  const name = profile?.name?.trim() || 'cliente'
  const lines = [
    `Hola ${name}, te comparto el enlace para agendar tu próxima cita en ${branchName}:`,
    '',
    bookingUrl,
  ]
  if (profileUrl) {
    lines.push('', 'Desde tu perfil puedes ver citas y actualizar tus datos:', profileUrl)
  }
  lines.push('', '¡Te esperamos!')
  return lines.join('\n')
}

export { endTime, fitsInSchedule, isOnApprovedVacation }
