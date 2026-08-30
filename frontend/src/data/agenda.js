export const CABINAS = [
  { id: 'cab1', name: 'Cabina 1' },
  { id: 'cab2', name: 'Cabina 2' },
  { id: 'cab3', name: 'Cabina 3' },
  { id: 'cab4', name: 'Cabina 4' },
  { id: 'cab5', name: 'Cabina 5 Ventas' },
  { id: 'walkin', name: 'Cliente sin cita' },
]

export const DURATION_OPTIONS = [
  { value: 30, label: '30 Minutos' },
  { value: 45, label: '45 Minutos' },
  { value: 60, label: '1 Hora' },
  { value: 90, label: '1 Hora 30 Minutos' },
  { value: 120, label: '2 Horas' },
]

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'No se repite (Cita única)' },
  { value: 'weekly', label: 'Cada semana' },
  { value: 'monthly', label: 'Cada mes' },
]

export const REPEAT_COUNTS = [2, 3, 4, 6, 8, 12]

export const CALENDAR_STATUSES = [
  { id: 'confirmada', name: 'Confirmada' },
  { id: 'asistio', name: 'Asistió' },
  { id: 'cancelada', name: 'Cancelada' },
  { id: 'retrasada', name: 'Retrasada' },
  { id: 'reprogramada', name: 'Reprogramada' },
]

export const cabinaName = (id) => CABINAS.find((c) => c.id === id)?.name || '—'

const toDateKey = (date) => {
  const value = date instanceof Date ? date : new Date(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const shiftDate = (days) => toDateKey(new Date(Date.now() + days * 86400000))

const demoAppointment = (extra) => ({
  notes: '',
  cabinaId: 'cab1',
  employeeId: '',
  customerPhone: '',
  branchId: 'charm-dn',
  pendingPayment: false,
  pendingAmount: 0,
  firstTime: false,
  freeTrial: false,
  completed: false,
  recurrence: 'none',
  repeatCount: 1,
  reminderSent: true,
  source: 'staff',
  createdBy: 'Alex Demo',
  updatedBy: 'Alex Demo',
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  history: [],
  version: 1,
  ...extra,
})

/**
 * The demo repository builds relative dates on every hydration so the calendar
 * remains useful without leaking these fixtures into API mode.
 */
export function createDemoAppointments() {
  return [
    demoAppointment({ id: 'apt-seed-1', date: shiftDate(0), time: '09:30', duration: 30, customerId: 'c1', customerName: 'María Fernández', customerPhone: '809-555-0101', serviceId: 'p2', serviceName: '1 sesión axilas', price: 900, status: 'confirmada', cabinaId: 'cab1', employeeId: 'emp-1' }),
    demoAppointment({ id: 'apt-seed-2', date: shiftDate(0), time: '11:00', duration: 60, customerId: 'c3', customerName: 'Ana Cristina Vargas', customerPhone: '809-555-0202', serviceId: 'p11', serviceName: 'Facial hidratante', price: 2500, status: 'pendiente', notes: 'Primera visita', cabinaId: 'cab2', employeeId: 'emp-4', firstTime: true, branchId: 'charm-santiago' }),
    demoAppointment({ id: 'apt-seed-3', date: shiftDate(0), time: '15:00', duration: 45, customerId: 'c5', customerName: 'Carla Jiménez', serviceId: 'p8', serviceName: '1 Sesión rostro', price: 700, status: 'pendiente', cabinaId: 'cab3', employeeId: 'emp-9', branchId: 'charm-este' }),
    demoAppointment({ id: 'apt-seed-4', date: shiftDate(0), time: '12:30', duration: 30, customerId: 'c2', customerName: 'José Ramírez', serviceId: 'p3', serviceName: 'Cita de continuación (seguimiento)', price: 0, status: 'confirmada', cabinaId: 'cab1', employeeId: 'emp-6' }),
    demoAppointment({ id: 'apt-seed-5', date: shiftDate(0), time: '17:00', duration: 60, customerId: 'c4', customerName: 'Luis Alberto Peña', serviceId: 'p9', serviceName: 'Paq. 12 sesiones - Cuerpo completo VIP', price: 23000, status: 'confirmada', cabinaId: 'cab4', employeeId: 'emp-13', pendingPayment: true, pendingAmount: 7000 }),
    demoAppointment({ id: 'apt-seed-6', date: shiftDate(1), time: '10:00', duration: 60, customerId: 'c2', customerName: 'José Ramírez', serviceId: 'p4', serviceName: '1 sesión piernas completas', price: 1200, status: 'confirmada', cabinaId: 'cab2', employeeId: 'emp-12', branchId: 'charm-santiago' }),
    demoAppointment({ id: 'apt-seed-7', date: shiftDate(2), time: '13:30', duration: 30, customerId: 'c4', customerName: 'Luis Alberto Peña', serviceId: 'p12', serviceName: 'Depilación bigote', price: 500, status: 'pendiente', cabinaId: 'cab1', employeeId: 'emp-9', branchId: 'charm-este' }),
    demoAppointment({ id: 'apt-seed-8', date: shiftDate(-1), time: '11:00', duration: 60, customerId: 'c1', customerName: 'María Fernández', serviceId: 'p10', serviceName: 'Cuerpo completo - pago', price: 0, status: 'completada', cabinaId: 'cab3', employeeId: 'emp-6', freeTrial: true }),
  ]
}

export function createDemoAppointmentResources(branchId) {
  return CABINAS.map((resource, index) => ({
    ...resource,
    branchId,
    code: resource.id.toUpperCase(),
    resourceType: resource.id === 'walkin' ? 'walk_in' : 'room',
    status: 'active',
    version: 1,
    sortOrder: index,
  }))
}
