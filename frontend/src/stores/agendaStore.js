import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const genId = () => `apt-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export const toKey = (d) => {
  const dt = d instanceof Date ? d : new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export const todayKey = () => toKey(new Date())
const shift = (n) => toKey(new Date(Date.now() + n * 86400000))

export const APPOINTMENT_STATUSES = [
  { id: 'pendiente', name: 'Pendiente', tone: 'warning' },
  { id: 'confirmada', name: 'Confirmada', tone: 'brand' },
  { id: 'completada', name: 'Completada', tone: 'success' },
  { id: 'asistio', name: 'Asistió', tone: 'success' },
  { id: 'noshow', name: 'No-show', tone: 'danger' },
  { id: 'cancelada', name: 'Cancelada', tone: 'neutral' },
  { id: 'retrasada', name: 'Retrasada', tone: 'warning' },
  { id: 'reprogramada', name: 'Reprogramada', tone: 'brand' },
]
export const statusMeta = (id) => APPOINTMENT_STATUSES.find((s) => s.id === id) || APPOINTMENT_STATUSES[0]

const base = (extra) => ({
  notes: '',
  cabinaId: 'cab1',
  employeeId: '',
  customerPhone: '',
  pendingPayment: false,
  pendingAmount: 0,
  firstTime: false,
  freeTrial: false,
  completed: false,
  recurrence: 'none',
  repeatCount: 2,
  reminderSent: true,
  ...extra,
})

const SEED = [
  base({ id: 'apt-seed-1', _seedOffset: 0, date: todayKey(), time: '09:30', duration: 30, customerId: 'c1', customerName: 'María Fernández', serviceId: 'p2', serviceName: '1 sesión axilas', price: 900, status: 'confirmada', cabinaId: 'cab1', employeeId: 'emp1' }),
  base({ id: 'apt-seed-2', _seedOffset: 0, date: todayKey(), time: '11:00', duration: 60, customerId: 'c3', customerName: 'Ana Cristina Vargas', serviceId: 'p11', serviceName: 'Facial hidratante', price: 2500, status: 'pendiente', notes: 'Primera visita', cabinaId: 'cab2', employeeId: 'emp3', firstTime: true }),
  base({ id: 'apt-seed-3', _seedOffset: 0, date: todayKey(), time: '15:00', duration: 45, customerId: 'c5', customerName: 'Carla Jiménez', serviceId: 'p8', serviceName: '1 Sesión rostro', price: 700, status: 'pendiente', cabinaId: 'cab3', employeeId: 'emp4' }),
  base({ id: 'apt-seed-4', _seedOffset: 0, date: todayKey(), time: '12:30', duration: 30, customerId: 'c2', customerName: 'Catherine Pamela Reyes', serviceId: 'p3', serviceName: 'Cita de continuación (seguimiento)', price: 0, status: 'confirmada', cabinaId: 'cab1', employeeId: 'emp2' }),
  base({ id: 'apt-seed-5', _seedOffset: 0, date: todayKey(), time: '17:00', duration: 60, customerId: 'c4', customerName: 'Dianeri Pérez A.', serviceId: 'p9', serviceName: 'Paq. 12 sesiones - Cuerpo completo VIP', price: 23000, status: 'confirmada', cabinaId: 'cab4', employeeId: 'emp5', pendingPayment: true, pendingAmount: 7000 }),
  base({ id: 'apt-seed-6', _seedOffset: 1, date: shift(1), time: '10:00', duration: 60, customerId: 'c2', customerName: 'José Ramírez', serviceId: 'p4', serviceName: '1 sesión piernas completas', price: 1200, status: 'confirmada', cabinaId: 'cab2', employeeId: 'emp6' }),
  base({ id: 'apt-seed-7', _seedOffset: 2, date: shift(2), time: '13:30', duration: 30, customerId: 'c4', customerName: 'Luis Alberto Peña', serviceId: 'p12', serviceName: 'Depilación bigote', price: 500, status: 'pendiente', cabinaId: 'cab1', employeeId: 'emp7' }),
  base({ id: 'apt-seed-8', _seedOffset: -1, date: shift(-1), time: '11:00', duration: 60, customerId: 'c1', customerName: 'Nicole Sosa', serviceId: 'p10', serviceName: 'Cuerpo completo - pago', price: 0, status: 'confirmada', cabinaId: 'cab3', employeeId: 'emp8', freeTrial: true }),
]

function normalizeAppointment(data) {
  return {
    notes: data.notes || '',
    cabinaId: data.cabinaId || 'cab1',
    employeeId: data.employeeId || '',
    customerPhone: data.customerPhone || '',
    pendingPayment: !!data.pendingPayment,
    pendingAmount: Number(data.pendingAmount) || 0,
    firstTime: !!data.firstTime,
    freeTrial: !!data.freeTrial,
    completed: !!data.completed,
    recurrence: data.recurrence || 'none',
    repeatCount: Number(data.repeatCount) || 2,
    reminderSent: data.reminderSent !== false,
    date: data.date,
    time: data.time,
    duration: Number(data.duration) || 30,
    customerId: data.customerId || null,
    customerName: data.customerName || 'Cliente Mostrador',
    serviceId: data.serviceId || null,
    serviceName: data.serviceName || '',
    price: Number(data.price) || 0,
    status: data.status || 'pendiente',
  }
}

export const useAgendaStore = create(
  persist(
    (set, get) => ({
      appointments: SEED,

      addAppointment: (data) =>
        set((s) => ({
          appointments: [{ id: genId(), ...normalizeAppointment(data) }, ...s.appointments],
        })),

      addAppointments: (list) =>
        set((s) => ({
          appointments: [...list.map((d) => ({ id: genId(), ...normalizeAppointment(d) })), ...s.appointments],
        })),

      updateAppointment: (id, data) =>
        set((s) => ({
          appointments: s.appointments.map((a) =>
            a.id === id
              ? {
                  ...a,
                  ...data,
                  duration: data.duration === undefined ? a.duration : Number(data.duration) || 0,
                  price: data.price === undefined ? a.price : Number(data.price) || 0,
                  pendingAmount: data.pendingAmount === undefined ? a.pendingAmount : Number(data.pendingAmount) || 0,
                }
              : a
          ),
        })),

      deleteAppointment: (id) => set((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) })),

      setStatus: (id, status) =>
        set((s) => ({ appointments: s.appointments.map((a) => (a.id === id ? { ...a, status } : a)) })),

      getByDate: (dateKey) =>
        get().appointments.filter((a) => a.date === dateKey).sort((a, b) => a.time.localeCompare(b.time)),

      getToday: () => get().getByDate(todayKey()),
    }),
    {
      name: 'diedo-agenda',
      version: 3,
      partialize: (s) => ({ appointments: s.appointments }),
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        if (Array.isArray(state.appointments)) {
          state.appointments = state.appointments.map((a) =>
            a && a._seedOffset !== undefined ? { ...a, date: shift(a._seedOffset) } : a
          )
        }
        return state
      },
    }
  )
)
