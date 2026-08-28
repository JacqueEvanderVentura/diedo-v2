import { timeSlots, endTime } from '@/modules/agenda/lib/calendar'
import {
  getEmployeeSlotsForDate,
  isOnApprovedVacation,
  fitsInSchedule,
} from '@/modules/rrhh/lib/schedule'

export const DOC_TYPES = [
  { id: 'cedula', label: 'Cédula' },
  { id: 'pasaporte', label: 'Pasaporte' },
]

export function normalizeDocumentId(value) {
  return String(value || '').replace(/\D/g, '')
}

export function formatDocumentDisplay(value) {
  const digits = normalizeDocumentId(value)
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
  }
  return value
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

function overlaps(startA, durA, startB, durB) {
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const a0 = toMin(startA)
  const a1 = a0 + (durA || 30)
  const b0 = toMin(startB)
  const b1 = b0 + (durB || 30)
  return a0 < b1 && b0 < a1
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

  const busy = appointments.filter(
    (a) =>
      a.id !== excludeAppointmentId &&
      a.date === date &&
      a.employeeId === employeeId &&
      a.status !== 'cancelada'
  )

  return candidates.filter((slot) => {
    if (!fitsInSchedule({ employee, date, time: slot, duration })) return false
    return !busy.some((a) => overlaps(slot, duration, a.time, a.duration))
  })
}

export function buildConfirmationEmail({ profile, branchName, bookingUrl, profileUrl }) {
  return {
    subject: `Agenda tu cita en ${branchName}`,
    preview: `Hola ${profile.name}, usa este enlace para reservar tu próxima cita.`,
    body: `Hola ${profile.name},

Te invitamos a agendar tu próxima cita en ${branchName}.

Reserva en línea: ${bookingUrl}

Desde tu perfil puedes ver tus citas, actualizar tus datos y enviar reclamos: ${profileUrl}

¡Te esperamos!
Charm Esthetic Clinic`,
  }
}

export { endTime, fitsInSchedule, isOnApprovedVacation }
