export const PUBLIC_BOOKING_LEAD_MINUTES_DEFAULT = 5

export const PUBLIC_BOOKING_LEAD_TIME_OPTIONS = [
  { value: '5', label: '5 minutos' },
  { value: '30', label: '30 minutos' },
  { value: '45', label: '45 minutos' },
  { value: '60', label: '60 minutos' },
  { value: '90', label: '1 hora y 30 minutos' },
  { value: '240', label: '4 horas' },
  { value: '360', label: '6 horas' },
  { value: '720', label: '12 horas' },
  { value: '1440', label: '24 horas' },
]

export function normalizePublicBookingLeadMinutes(value) {
  const parsed = Number(value)
  const allowed = PUBLIC_BOOKING_LEAD_TIME_OPTIONS.map((option) => Number(option.value))
  if (allowed.includes(parsed)) return parsed
  return PUBLIC_BOOKING_LEAD_MINUTES_DEFAULT
}

export function publicBookingLeadTimeLabel(minutes) {
  const match = PUBLIC_BOOKING_LEAD_TIME_OPTIONS.find(
    (option) => Number(option.value) === Number(minutes),
  )
  return match?.label || `${minutes} minutos`
}
