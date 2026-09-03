import { create } from 'zustand'
import { appointmentsGateway } from '@/services/appointmentsApi'
import { useSessionStore } from '@/stores/sessionStore'
import { registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { currentSessionActor } from '@/lib/sessionActor'
import { backfillHistory, buildCreateChanges, diffAppointmentChanges } from '@/modules/agenda/lib/audit'
import {
  removeAppointmentReceivable,
  syncAllAgendaReceivables,
  syncAppointmentReceivable,
} from '@/modules/agenda/lib/receivableSync'
import { getAppointmentReceivablePolicy } from '@/modules/agenda/lib/receivablePermissions'

const genId = () => `apt-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const genLogId = () => `log-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const appointmentReads = new Map()

export const MOCK_USER = 'Alex Demo'
const DEFAULT_BRANCH_ID = 'charm-dn'

export const toKey = (date) => {
  const value = date instanceof Date ? date : new Date(date)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const todayKey = () => toKey(new Date())

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

export const statusMeta = (id) => APPOINTMENT_STATUSES.find((status) => status.id === id) || APPOINTMENT_STATUSES[0]

function auditActor(source) {
  if (source === 'self') return { userId: null, userName: 'Portal de agendación' }
  const actor = currentSessionActor()
  return { userId: actor.id, userName: actor.name }
}

function stampAudit(action, previous = {}, source = 'staff') {
  const timestamp = new Date().toISOString()
  const actor = auditActor(source)
  if (action === 'create') {
    return {
      createdBy: actor.userName,
      updatedBy: actor.userName,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
  }
  return {
    createdBy: previous.createdBy || actor.userName,
    createdAt: previous.createdAt || timestamp,
    updatedBy: actor.userName,
    updatedAt: timestamp,
  }
}

function normalizeAppointment(data) {
  return {
    notes: data.notes || '',
    cabinaId: data.cabinaId || data.resourceId || null,
    resourceId: data.resourceId || data.cabinaId || null,
    employeeId: data.employeeId || null,
    customerPhone: data.customerPhone || '',
    branchId: data.branchId || DEFAULT_BRANCH_ID,
    pendingPayment: data.pendingPayment === true,
    pendingAmount: Number(data.pendingAmount) || 0,
    firstTime: data.firstTime === true,
    freeTrial: data.freeTrial === true,
    completed: data.completed === true,
    recurrence: data.recurrence || 'none',
    repeatCount: Number(data.repeatCount) || 1,
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

function createDemoAppointment(data) {
  const normalized = normalizeAppointment(data)
  const audit = stampAudit('create', {}, normalized.source)
  const payload = { id: genId(), version: 1, ...normalized, ...audit }
  return {
    ...payload,
    history: [{
      id: genLogId(),
      at: audit.createdAt,
      ...auditActor(normalized.source),
      action: 'create',
      changes: buildCreateChanges(payload),
    }],
  }
}

function updateDemoAppointment(current, data) {
  const merged = {
    ...current,
    ...data,
    cabinaId: data.cabinaId || data.resourceId || current.cabinaId,
    resourceId: data.resourceId || data.cabinaId || current.resourceId,
    duration: data.duration === undefined ? current.duration : Number(data.duration) || 0,
    price: data.price === undefined ? current.price : Number(data.price) || 0,
    pendingAmount: data.pendingAmount === undefined ? current.pendingAmount : Number(data.pendingAmount) || 0,
    version: (current.version || 1) + 1,
  }
  const changes = diffAppointmentChanges(current, merged)
  const audit = stampAudit('update', current, current.source || 'staff')
  return {
    ...merged,
    ...audit,
    history: changes.length
      ? [...(current.history || backfillHistory(current)), {
          id: genLogId(),
          at: audit.updatedAt,
          ...auditActor(current.source || 'staff'),
          action: 'update',
          changes,
        }]
      : current.history || backfillHistory(current),
  }
}

function matchesScope(appointment, params = {}) {
  if (params.branchId && appointment.branchId !== params.branchId) return false
  if (params.dateFrom && appointment.date < params.dateFrom) return false
  if (params.dateTo && appointment.date > params.dateTo) return false
  if (params.employeeId && appointment.employeeId !== params.employeeId) return false
  if (params.status && appointment.status !== params.status) return false
  return true
}

function mergeScopedAppointments(current, incoming, params = {}) {
  const incomingIds = new Set(incoming.map((appointment) => appointment.id))
  const hasScope = Boolean(params.branchId || params.dateFrom || params.dateTo || params.employeeId || params.status)
  const retained = hasScope
    ? current.filter((appointment) => !matchesScope(appointment, params) && !incomingIds.has(appointment.id))
    : []
  return [...incoming, ...retained]
}

function replaceAppointment(items, appointment) {
  const found = items.some((item) => item.id === appointment.id)
  return found
    ? items.map((item) => item.id === appointment.id ? appointment : item)
    : [appointment, ...items]
}

function mutationScope(appointment) {
  return appointment?.branchId && appointment?.date
    ? { branchId: appointment.branchId, dateFrom: appointment.date, dateTo: appointment.date }
    : {}
}

export const useAgendaStore = create((set, get) => ({
  appointments: [],
  resources: [],
  dataState: appointmentsGateway.getState(),
  hydrating: false,
  resourceLoadingByBranch: {},

  hydrateAppointments: ({ force = false, params = {} } = {}) => {
    const requestKey = JSON.stringify(params)
    if (appointmentReads.has(requestKey)) return appointmentReads.get(requestKey)
    if (!force && get().dataState.status !== 'loading') return Promise.resolve(get().appointments)

    const request = (async () => {
      set({ hydrating: true })
      try {
        const result = await appointmentsGateway.read('appointments', params)
        const appointments = result.data.map((appointment) => ({
          ...appointment,
          history: appointment.history?.length ? appointment.history : backfillHistory(appointment),
        }))
        set((state) => ({
          appointments: mergeScopedAppointments(state.appointments, appointments, params),
          dataState: appointmentsGateway.getState(),
        }))
        syncAllAgendaReceivables(appointments)
        return appointments
      } catch (error) {
        set({ dataState: appointmentsGateway.getState() })
        throw error
      } finally {
        if (appointmentReads.get(requestKey) === request) appointmentReads.delete(requestKey)
        set({ hydrating: appointmentReads.size > 0 })
      }
    })()
    appointmentReads.set(requestKey, request)
    return request
  },

  hydrateResources: async ({ branchId, force = false } = {}) => {
    if (!branchId) return []
    const alreadyLoaded = get().resources.some((resource) => resource.branchId === branchId)
    if ((!force && alreadyLoaded) || get().resourceLoadingByBranch[branchId]) {
      return get().resources.filter((resource) => resource.branchId === branchId)
    }
    set((state) => ({
      resourceLoadingByBranch: { ...state.resourceLoadingByBranch, [branchId]: true },
    }))
    try {
      const result = await appointmentsGateway.read('appointmentResources', { branchId })
      set((state) => ({
        resources: [
          ...state.resources.filter((resource) => resource.branchId !== branchId),
          ...result.data,
        ],
        resourceLoadingByBranch: { ...state.resourceLoadingByBranch, [branchId]: false },
      }))
      return result.data
    } catch (error) {
      set((state) => ({
        resourceLoadingByBranch: { ...state.resourceLoadingByBranch, [branchId]: false },
      }))
      throw error
    }
  },

  addAppointment: async (data) => {
    if (useSessionStore.getState().status === 'demo') {
      const created = createDemoAppointment(data)
      set((state) => ({ appointments: [created, ...state.appointments] }))
      syncAppointmentReceivable(created)
      return created
    }
    try {
      const created = await appointmentsGateway.mutate('createAppointment', data)
      set((state) => ({
        appointments: created.reduce((items, appointment) => replaceAppointment(items, appointment), state.appointments),
      }))
      created.forEach(syncAppointmentReceivable)
      const first = created[0]
      if (first) await get().hydrateAppointments({ force: true, params: {
        branchId: first.branchId,
        dateFrom: created.reduce((min, item) => item.date < min ? item.date : min, first.date),
        dateTo: created.reduce((max, item) => item.date > max ? item.date : max, first.date),
      } }).catch(() => {})
      return created.length === 1 ? created[0] : created
    } catch (error) {
      await get().hydrateAppointments({ force: true, params: mutationScope(data) }).catch(() => {})
      throw error
    }
  },

  addAppointments: async (list) => {
    if (!Array.isArray(list) || list.length === 0) return []
    if (useSessionStore.getState().status !== 'demo') {
      throw new Error('Las series deben enviarse como una sola cita con recurrencia.')
    }
    const created = list.map(createDemoAppointment)
    set((state) => ({ appointments: [...created, ...state.appointments] }))
    created.forEach(syncAppointmentReceivable)
    return created
  },

  updateAppointment: async (id, data) => {
    const current = get().appointments.find((appointment) => appointment.id === id)
    if (!current) throw new Error('Cita no encontrada.')
    if (useSessionStore.getState().status === 'demo') {
      const updated = updateDemoAppointment(current, data)
      set((state) => ({ appointments: replaceAppointment(state.appointments, updated) }))
      syncAppointmentReceivable(updated)
      return updated
    }
    try {
      const updated = await appointmentsGateway.mutate('updateAppointment', id, { ...current, ...data }, current.version)
      set((state) => ({ appointments: replaceAppointment(state.appointments, updated) }))
      syncAppointmentReceivable(updated)
      await get().hydrateAppointments({ force: true, params: mutationScope(updated) }).catch(() => {})
      return updated
    } catch (error) {
      await get().hydrateAppointments({ force: true, params: mutationScope({ ...current, ...data }) }).catch(() => {})
      throw error
    }
  },

  deleteAppointment: async (id) => {
    const current = get().appointments.find((appointment) => appointment.id === id)
    if (!current) return null
    const session = useSessionStore.getState()
    if (session.status === 'online') {
      if (!session.hasPermission('appointment.delete')) {
        throw new Error('No tienes permiso para eliminar citas.')
      }
      const deletion = getAppointmentReceivablePolicy({
        appointment: current,
        online: true,
        canManageReceivables: session.hasPermission('pos.receivables.manage'),
      })
      if (!deletion.canDelete) throw new Error(deletion.deleteReason)
    }
    if (session.status === 'demo') {
      set((state) => ({
        appointments: state.appointments.filter((appointment) => appointment.id !== id),
      }))
      removeAppointmentReceivable(id)
      return current
    }
    try {
      await appointmentsGateway.mutate('deleteAppointment', id, current.version)
      set((state) => ({
        appointments: state.appointments.filter((appointment) => appointment.id !== id),
      }))
      removeAppointmentReceivable(id)
      await get().hydrateAppointments({ force: true, params: mutationScope(current) }).catch(() => {})
      return current
    } catch (error) {
      await get().hydrateAppointments({ force: true, params: mutationScope(current) }).catch(() => {})
      throw error
    }
  },

  setStatus: async (id, status) => {
    const current = get().appointments.find((appointment) => appointment.id === id)
    if (!current) throw new Error('Cita no encontrada.')
    if (current.status === status) return current
    if (useSessionStore.getState().status === 'demo') {
      const updated = updateDemoAppointment(current, { status })
      set((state) => ({ appointments: replaceAppointment(state.appointments, updated) }))
      syncAppointmentReceivable(updated)
      return updated
    }
    try {
      const updated = await appointmentsGateway.mutate(
        'updateAppointmentStatus',
        id,
        status,
        current.version
      )
      set((state) => ({ appointments: replaceAppointment(state.appointments, updated) }))
      syncAppointmentReceivable(updated)
      await get().hydrateAppointments({ force: true, params: mutationScope(updated) }).catch(() => {})
      return updated
    } catch (error) {
      await get().hydrateAppointments({ force: true, params: mutationScope(current) }).catch(() => {})
      throw error
    }
  },

  getByDate: (dateKey) => get().appointments
    .filter((appointment) => appointment.date === dateKey)
    .sort((a, b) => a.time.localeCompare(b.time)),

  getToday: () => get().getByDate(todayKey()),

  clearSensitive: () => {
    appointmentReads.clear()
    set({
      appointments: [],
      resources: [],
      dataState: appointmentsGateway.getState(),
      hydrating: false,
      resourceLoadingByBranch: {},
    })
  },
}))

registerSensitiveStateCleaner(() => useAgendaStore.getState().clearSensitive())
