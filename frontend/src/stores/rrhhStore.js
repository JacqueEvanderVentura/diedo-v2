import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { employeesGateway } from '@/services/masterDataApi'
import { employeeToApiPayload, mapEmployeeFromApi, mapEmployeeFromDemo } from '@/services/adapters/masterData'
import { useSessionStore } from '@/stores/sessionStore'
import { debtBalance, debtStatus } from '@/modules/rrhh/lib/rrhh'
import { normalizeWorkSchedule } from '@/modules/rrhh/lib/schedule'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

const SEED_REQUESTS = [
  { id: 'vr-1', employeeId: 'emp-1', startDate: daysFromNow(14), endDate: daysFromNow(18), reason: 'Vacaciones familiares', status: 'aprobada', createdAt: daysAgo(10), reviewedAt: daysAgo(8), reviewedBy: 'u1' },
  { id: 'vr-2', employeeId: 'emp-5', startDate: daysFromNow(5), endDate: daysFromNow(7), reason: 'Asuntos personales', status: 'pendiente', createdAt: daysAgo(2), reviewedAt: null, reviewedBy: null },
]

const SEED_DEBTS = [
  { id: 'debt-1', employeeId: 'emp-3', concept: 'Adelanto de comisión', clientName: 'Cliente VIP', amount: 5000, payments: [{ id: 'pay-1', amount: 2000, date: daysAgo(5) }], createdAt: daysAgo(20) },
  { id: 'debt-2', employeeId: 'emp-7', concept: 'Préstamo interno', clientName: null, amount: 8000, payments: [], createdAt: daysAgo(15) },
]

const SEED_REVIEWS = [
  { id: 'rev-1', employeeId: 'emp-2', period: '2026-Q1', score: 4.5, notes: 'Excelente liderazgo de equipo.', status: 'publicado', createdAt: daysAgo(30) },
  { id: 'rev-2', employeeId: 'emp-3', period: '2026-Q1', score: 4, notes: 'Buen desempeño técnico.', status: 'publicado', createdAt: daysAgo(28) },
  { id: 'rev-3', employeeId: 'emp-5', period: '2026-Q1', score: 3.5, notes: 'Mejorar puntualidad.', status: 'publicado', createdAt: daysAgo(25) },
  { id: 'rev-4', employeeId: 'emp-7', period: '2026-Q1', score: 4, notes: 'Muy buena actitud.', status: 'borrador', createdAt: daysAgo(5) },
]

function normalizeEmployee(data) {
  const branchIds = Array.isArray(data.branchIds) && data.branchIds.length
    ? data.branchIds
    : data.branchId
      ? [data.branchId]
      : ['charm-dn']
  const jefeIds = Array.isArray(data.jefeIds)
    ? data.jefeIds.filter(Boolean)
    : data.jefeId
      ? [data.jefeId]
      : []
  const salary = Number(data.salary) || 0
  const initialSalary = data.initialSalary != null ? Number(data.initialSalary) : salary

  return {
    id: data.id || genId('emp'),
    firstName: data.firstName?.trim() || '',
    lastName: data.lastName?.trim() || '',
    email: data.email?.trim() || null,
    phone: data.phone?.trim() || null,
    position: data.position?.trim() || '',
    department: data.department?.trim() || '',
    branchIds,
    branchId: branchIds[0] || 'charm-dn',
    jefeIds,
    jefeId: jefeIds[0] || null,
    contractType: data.contractType?.trim() || 'Indefinido',
    initialSalary,
    salary,
    vacationDays: Number(data.vacationDays) || 0,
    usuarioId: data.usuarioId || null,
    clienteId: data.clienteId || null,
    active: data.active !== false,
    status: data.status || (data.active === false ? 'inactive' : 'active'),
    version: data.version || 1,
    scheduleVersion: data.scheduleVersion || 1,
    scheduleTimezone: data.scheduleTimezone || 'America/Santo_Domingo',
    attachmentCount: data.attachmentCount || 0,
    hireDate: data.hireDate || now().slice(0, 10),
    bankName: data.bankName?.trim() || '',
    bankAccountType: data.bankAccountType || 'ahorro',
    bankAccountNumber: data.bankAccountNumber?.trim() || '',
    bankDocument: data.bankDocument?.trim() || '',
    workSchedule: normalizeWorkSchedule(data.workSchedule),
    createdAt: data.createdAt || now(),
    updatedAt: data.updatedAt || now(),
    api: data.api === true,
    source: data.source || (data.api ? 'api' : undefined),
  }
}

export const useRrhhStore = create(
  persist(
    (set, get) => ({
      employees: [],
      employeesDataState: employeesGateway.getState(),
      hydratingEmployees: false,
      vacationRequests: SEED_REQUESTS,
      employeeDebts: SEED_DEBTS,
      documentHistory: [],
      payrollRuns: [],
      performanceReviews: SEED_REVIEWS,
      getEmployeeByUserId: (userId) => get().employees.find((e) => e.usuarioId === userId),

      hydrateEmployees: async ({ force = false } = {}) => {
        if (get().hydratingEmployees || (!force && get().employeesDataState.status !== 'loading')) {
          return get().employees
        }
        set({ hydratingEmployees: true })
        try {
          const result = await employeesGateway.read('employees')
          const mapper = result.source === 'demo' ? mapEmployeeFromDemo : mapEmployeeFromApi
          const employees = result.data.map((item) => normalizeEmployee(mapper(item)))
          set({ employees, employeesDataState: employeesGateway.getState(), hydratingEmployees: false })
          return employees
        } catch (error) {
          set({ employeesDataState: employeesGateway.getState(), hydratingEmployees: false })
          throw error
        }
      },

      addEmployee: async (data) => {
        let emp
        if (useSessionStore.getState().status === 'demo') {
          emp = normalizeEmployee({ ...data, source: 'demo' })
        } else {
          const branchIds = useSessionStore.getState().user?.branchIds || []
          const response = await employeesGateway.mutate(
            'createEmployee',
            employeeToApiPayload(data, branchIds)
          )
          emp = normalizeEmployee(mapEmployeeFromApi(response))
        }
        set((s) => ({ employees: [emp, ...s.employees] }))
        return emp
      },

      updateEmployee: async (id, data) => {
        const current = get().employees.find((employee) => employee.id === id)
        if (!current) throw new Error('Empleado no encontrado.')
        let employee
        if (useSessionStore.getState().status === 'demo') {
          employee = normalizeEmployee({ ...current, ...data, id, source: 'demo' })
        } else {
          const complete = { ...current, ...data }
          const { schedule, timezone, ...basicPayload } = employeeToApiPayload(complete)
          const response = await employeesGateway.mutate('updateEmployee', id, {
            ...basicPayload,
            version: current.version,
          })
          employee = normalizeEmployee(mapEmployeeFromApi(response))
          const scheduleChanged = Object.hasOwn(data, 'workSchedule')
            && JSON.stringify(normalizeWorkSchedule(data.workSchedule))
              !== JSON.stringify(normalizeWorkSchedule(current.workSchedule))
          if (scheduleChanged) {
            const updatedSchedule = await employeesGateway.mutate('updateEmployeeSchedule', id, {
              timezone,
              week: schedule,
              version: current.scheduleVersion,
            })
            employee = normalizeEmployee({
              ...employee,
              workSchedule: updatedSchedule.week,
              scheduleTimezone: updatedSchedule.timezone,
              scheduleVersion: updatedSchedule.version,
            })
          }
        }
        set((state) => ({
          employees: state.employees.map((item) => (item.id === id ? employee : item)),
        }))
        return employee
      },

      deleteEmployee: async (id) => {
        const current = get().employees.find((employee) => employee.id === id)
        if (!current) return
        if (useSessionStore.getState().status === 'demo') {
          set((state) => ({ employees: state.employees.filter((employee) => employee.id !== id) }))
          return
        }
        const response = await employeesGateway.mutate('updateEmployee', id, {
          version: current.version,
          status: 'archived',
        })
        const employee = normalizeEmployee(mapEmployeeFromApi(response))
        set((state) => ({
          employees: state.employees.map((item) => (item.id === id ? employee : item)),
        }))
      },

      clearSensitive: () => set({
        employees: [],
        employeesDataState: employeesGateway.getState(),
        hydratingEmployees: false,
        vacationRequests: [],
        employeeDebts: [],
        documentHistory: [],
        payrollRuns: [],
        performanceReviews: [],
      }),

      addVacationRequest: (data) => {
        const req = { id: genId('vr'), status: 'pendiente', createdAt: now(), reviewedAt: null, reviewedBy: null, ...data }
        set((s) => ({ vacationRequests: [req, ...s.vacationRequests] }))
        return req
      },

      updateVacationRequest: (id, data) =>
        set((s) => ({
          vacationRequests: s.vacationRequests.map((r) => (r.id === id ? { ...r, ...data } : r)),
        })),

      reviewVacationRequest: (id, status, reviewerId) =>
        set((s) => ({
          vacationRequests: s.vacationRequests.map((r) =>
            r.id === id ? { ...r, status, reviewedAt: now(), reviewedBy: reviewerId } : r
          ),
        })),

      addEmployeeDebt: (data) => {
        const debt = { id: genId('debt'), payments: [], createdAt: now(), ...data, amount: Number(data.amount) || 0 }
        set((s) => ({ employeeDebts: [debt, ...s.employeeDebts] }))
        return debt
      },

      addDebtPayment: (debtId, amount) =>
        set((s) => ({
          employeeDebts: s.employeeDebts.map((d) =>
            d.id === debtId
              ? { ...d, payments: [...(d.payments || []), { id: genId('pay'), amount: Number(amount), date: now().slice(0, 10) }] }
              : d
          ),
        })),

      addDocumentRecord: (data) => {
        const doc = { id: genId('doc'), createdAt: now(), ...data }
        set((s) => ({ documentHistory: [doc, ...s.documentHistory] }))
        return doc
      },

      addPerformanceReview: (data) => {
        const rev = { id: genId('rev'), status: 'borrador', createdAt: now(), ...data, score: Number(data.score) || 0 }
        set((s) => ({ performanceReviews: [rev, ...s.performanceReviews] }))
        return rev
      },

      updatePerformanceReview: (id, data) =>
        set((s) => ({
          performanceReviews: s.performanceReviews.map((r) => (r.id === id ? { ...r, ...data } : r)),
        })),

      closePayrollRun: (period, monthKey) => {
        const run = { id: genId('payroll'), period, monthKey, closedAt: now(), employeeCount: get().employees.filter((e) => e.active).length }
        set((s) => ({ payrollRuns: [run, ...s.payrollRuns] }))
        return run
      },

      getOverviewStats: () => {
        const { employees, vacationRequests } = get()
        const active = employees.filter((e) => e.active)
        const approvedVacations = vacationRequests.filter((r) => r.status === 'aprobada').length
        const pendingApprovals = vacationRequests.filter((r) => r.status === 'pendiente').length
        return {
          totalEmployees: employees.length,
          activeEmployees: active.length,
          approvedVacations,
          pendingApprovals,
        }
      },

      getDebtStats: () => {
        const debts = get().employeeDebts
        let totalDebt = 0
        let totalPaid = 0
        let pending = 0
        const employeeIds = new Set()
        debts.forEach((d) => {
          const paid = (d.payments || []).reduce((s, p) => s + p.amount, 0)
          const balance = debtBalance(d)
          totalDebt += d.amount || 0
          totalPaid += paid
          pending += balance
          if (balance > 0) employeeIds.add(d.employeeId)
        })
        return { totalDebt, totalPaid, pending, employeesWithDebt: employeeIds.size }
      },
    }),
    {
      name: 'diedo-rrhh',
      storage: ephemeralJsonStorage,
      version: 4,
      migrate: (persisted) => persisted ?? {},
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        state.employees = []
        state.employeesDataState = employeesGateway.getState()
        return state
      },
    }
  )
)

registerSensitiveStateCleaner(() => useRrhhStore.getState().clearSensitive())

export { debtBalance, debtStatus }
