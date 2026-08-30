import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'
import { currentSessionActor } from '@/lib/sessionActor'
import { backfillHistory, buildCreateChanges, diffAppointmentChanges } from '@/modules/agenda/lib/audit'
import {
  removeAppointmentReceivable,
  syncAllAgendaReceivables,
  syncAppointmentReceivable,
} from '@/modules/agenda/lib/receivableSync'

const genId = () => `apt-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const genLogId = () => `log-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export const MOCK_USER = 'Alex Demo'
const DEFAULT_BRANCH_ID = 'charm-dn'

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

function auditActor(source) {
  if (source === 'self') return { userId: null, userName: 'Portal de agendación' }
  const actor = currentSessionActor()
  return { userId: actor.id, userName: actor.name }
}

function stampAudit(action, prev = {}, source = 'staff') {
  const now = new Date().toISOString()
  const actor = auditActor(source)
  if (action === 'create') {
    return {
      createdBy: actor.userName,
      updatedBy: actor.userName,
      createdAt: now,
      updatedAt: now,
    }
  }
  return {
    createdBy: prev.createdBy || actor.userName,
    createdAt: prev.createdAt || now,
    updatedBy: actor.userName,
    updatedAt: now,
  }
}

function appendHistory(prevHistory, entry) {
  return [...(prevHistory || []), entry]
}

function withAuditDefaults(appointment) {
  if (!appointment) return appointment
  const now = new Date().toISOString()
  return {
    branchId: appointment.branchId || DEFAULT_BRANCH_ID,
    createdBy: appointment.createdBy || MOCK_USER,
    updatedBy: appointment.updatedBy || MOCK_USER,
    createdAt: appointment.createdAt || now,
    updatedAt: appointment.updatedAt || now,
    history: appointment.history?.length ? appointment.history : backfillHistory(appointment),
    ...appointment,
  }
}

const base = (extra) => ({
  notes: '',
  cabinaId: 'cab1',
  employeeId: '',
  customerPhone: '',
  branchId: DEFAULT_BRANCH_ID,
  pendingPayment: false,
  pendingAmount: 0,
  firstTime: false,
  freeTrial: false,
  completed: false,
  recurrence: 'none',
  repeatCount: 2,
  reminderSent: true,
  source: 'staff',
  createdBy: MOCK_USER,
  updatedBy: MOCK_USER,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  history: [],
  ...extra,
})

const SEED = [
  base({ id: 'apt-seed-1', _seedOffset: 0, date: todayKey(), time: '09:30', duration: 30, customerId: 'c1', customerName: 'María Fernández', customerPhone: '809-555-0101', serviceId: 'p2', serviceName: '1 sesión axilas', price: 900, status: 'confirmada', cabinaId: 'cab1', employeeId: 'emp1' }),
  base({ id: 'apt-seed-2', _seedOffset: 0, date: todayKey(), time: '11:00', duration: 60, customerId: 'c3', customerName: 'Ana Cristina Vargas', customerPhone: '809-555-0202', serviceId: 'p11', serviceName: 'Facial hidratante', price: 2500, status: 'pendiente', notes: 'Primera visita', cabinaId: 'cab2', employeeId: 'emp3', firstTime: true }),
  base({ id: 'apt-seed-3', _seedOffset: 0, date: todayKey(), time: '15:00', duration: 45, customerId: 'c5', customerName: 'Carla Jiménez', serviceId: 'p8', serviceName: '1 Sesión rostro', price: 700, status: 'pendiente', cabinaId: 'cab3', employeeId: 'emp4' }),
  base({ id: 'apt-seed-4', _seedOffset: 0, date: todayKey(), time: '12:30', duration: 30, customerId: 'c2', customerName: 'Catherine Pamela Reyes', serviceId: 'p3', serviceName: 'Cita de continuación (seguimiento)', price: 0, status: 'confirmada', cabinaId: 'cab1', employeeId: 'emp2' }),
  base({ id: 'apt-seed-5', _seedOffset: 0, date: todayKey(), time: '17:00', duration: 60, customerId: 'c4', customerName: 'Dianeri Pérez A.', serviceId: 'p9', serviceName: 'Paq. 12 sesiones - Cuerpo completo VIP', price: 23000, status: 'confirmada', cabinaId: 'cab4', employeeId: 'emp5', pendingPayment: true, pendingAmount: 7000 }),
  base({ id: 'apt-seed-6', _seedOffset: 1, date: shift(1), time: '10:00', duration: 60, customerId: 'c2', customerName: 'José Ramírez', serviceId: 'p4', serviceName: '1 sesión piernas completas', price: 1200, status: 'confirmada', cabinaId: 'cab2', employeeId: 'emp6', branchId: 'charm-santiago' }),
  base({ id: 'apt-seed-7', _seedOffset: 2, date: shift(2), time: '13:30', duration: 30, customerId: 'c4', customerName: 'Luis Alberto Peña', serviceId: 'p12', serviceName: 'Depilación bigote', price: 500, status: 'pendiente', cabinaId: 'cab1', employeeId: 'emp7', branchId: 'charm-este' }),
  base({ id: 'apt-seed-8', _seedOffset: -1, date: shift(-1), time: '11:00', duration: 60, customerId: 'c1', customerName: 'Nicole Sosa', serviceId: 'p10', serviceName: 'Cuerpo completo - pago', price: 0, status: 'completada', cabinaId: 'cab3', employeeId: 'emp8', freeTrial: true }),
]

function normalizeAppointment(data) {
  return {
    notes: data.notes || '',
    cabinaId: data.cabinaId || 'cab1',
    employeeId: data.employeeId || '',
    customerPhone: data.customerPhone || '',
    branchId: data.branchId || DEFAULT_BRANCH_ID,
    pendingPayment: !!data.pendingPayment,
    pendingAmount: Number(data.pendingAmount) || 0,
    firstTime: !!data.firstTime,
    freeTrial: !!data.freeTrial,
    completed: !!data.completed,
    recurrence: data.recurrence || 'none',
    repeatCount: Number(data.repeatCount) || 2,
    reminderSent: data.reminderSent !== false,
    source: data.source || 'staff',
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

      addAppointment: (data) => {
        let created = null
        set((s) => {
          const normalized = normalizeAppointment(data)
          const source = normalized.source || 'staff'
          const audit = stampAudit('create', {}, source)
          const payload = { id: genId(), ...normalized, ...audit }
          const history = [
            {
              id: genLogId(),
              at: audit.createdAt,
              ...auditActor(source),
              action: 'create',
              changes: buildCreateChanges(payload),
            },
          ]
          created = { ...payload, history }
          return {
            appointments: [created, ...s.appointments],
          }
        })
        syncAppointmentReceivable(created)
      },

      addAppointments: (list) => {
        const created = []
        set((s) => {
          const next = list.map((d) => {
            const normalized = normalizeAppointment(d)
            const source = normalized.source || 'staff'
            const audit = stampAudit('create', {}, source)
            const payload = { id: genId(), ...normalized, ...audit }
            return {
              ...payload,
              history: [
                {
                  id: genLogId(),
                  at: audit.createdAt,
                  ...auditActor(source),
                  action: 'create',
                  changes: buildCreateChanges(payload),
                },
              ],
            }
          })
          created.push(...next)
          return {
            appointments: [...next, ...s.appointments],
          }
        })
        created.forEach(syncAppointmentReceivable)
      },

      updateAppointment: (id, data) => {
        let updated = null
        set((s) => ({
          appointments: s.appointments.map((a) => {
            if (a.id !== id) return a
            const merged = {
              ...a,
              ...data,
              duration: data.duration === undefined ? a.duration : Number(data.duration) || 0,
              price: data.price === undefined ? a.price : Number(data.price) || 0,
              pendingAmount: data.pendingAmount === undefined ? a.pendingAmount : Number(data.pendingAmount) || 0,
            }
            const changes = diffAppointmentChanges(a, merged)
            const audit = stampAudit('update', a, a.source || 'staff')
            if (!changes.length) {
              updated = { ...merged, ...audit }
              return updated
            }
            const entry = {
              id: genLogId(),
              at: audit.updatedAt,
              ...auditActor(a.source || 'staff'),
              action: 'update',
              changes,
            }
            updated = {
              ...merged,
              ...audit,
              history: appendHistory(a.history, entry),
            }
            return updated
          }),
        }))
        if (updated) syncAppointmentReceivable(updated)
      },

      deleteAppointment: (id) => {
        set((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) }))
        removeAppointmentReceivable(id)
      },

      setStatus: (id, status) =>
        set((s) => ({
          appointments: s.appointments.map((a) => {
            if (a.id !== id || a.status === status) return a
            const audit = stampAudit('update', a, a.source || 'staff')
            const entry = {
              id: genLogId(),
              at: audit.updatedAt,
              ...auditActor(a.source || 'staff'),
              action: 'status',
              changes: [
                {
                  field: 'status',
                  label: 'Estado',
                  from: statusMeta(a.status).name,
                  to: statusMeta(status).name,
                },
              ],
            }
            return {
              ...a,
              status,
              ...audit,
              history: appendHistory(a.history, entry),
            }
          }),
        })),

      getByDate: (dateKey) =>
        get().appointments.filter((a) => a.date === dateKey).sort((a, b) => a.time.localeCompare(b.time)),

      getToday: () => get().getByDate(todayKey()),
    }),
    {
      name: 'diedo-agenda',
      storage: ephemeralJsonStorage,
      version: 6,
      migrate: (persisted) => persisted ?? {},
      partialize: (s) => ({ appointments: s.appointments }),
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        if (Array.isArray(state.appointments)) {
          state.appointments = state.appointments.map((a) => {
            let apt = a && a._seedOffset !== undefined ? { ...a, date: shift(a._seedOffset) } : a
            apt = withAuditDefaults({ ...apt, source: apt.source || 'staff' })
            if (!apt.history?.length) {
              apt = { ...apt, history: backfillHistory(apt) }
            }
            return apt
          })
          queueMicrotask(() => syncAllAgendaReceivables(state.appointments))
        }
        return state
      },
    }
  )
)
