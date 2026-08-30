import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { employeesGateway } from '@/services/masterDataApi'
import { hrGateway } from '@/services/hrApi'
import { employeeToApiPayload, mapEmployeeFromApi, mapEmployeeFromDemo } from '@/services/adapters/masterData'
import { useSessionStore } from '@/stores/sessionStore'
import { debtBalance, debtStatus } from '@/modules/rrhh/lib/rrhh'
import { normalizeWorkSchedule } from '@/modules/rrhh/lib/schedule'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

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
    profileVersion: data.profileVersion || 1,
    profileUpdatedAt: data.profileUpdatedAt || null,
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
      employeeProfiles: [],
      hrDataState: hrGateway.getState(),
      hydratingHrData: false,
      hrOverview: null,
      overviewDataState: hrGateway.getState(),
      hydratingOverview: false,
      hrDebtStats: null,
      vacationRequests: [],
      employeeDebts: [],
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
          const profileByEmployee = new Map(get().employeeProfiles.map((item) => [item.employeeId, item]))
          const employees = result.data.map((item) => {
            const employee = normalizeEmployee(mapper(item))
            return normalizeEmployee({ ...employee, ...(profileByEmployee.get(employee.id) || {}) })
          })
          set({ employees, employeesDataState: employeesGateway.getState(), hydratingEmployees: false })
          return employees
        } catch (error) {
          set({ employeesDataState: employeesGateway.getState(), hydratingEmployees: false })
          throw error
        }
      },

      hydrateHrData: async ({ force = false } = {}) => {
        if (get().hydratingHrData || (!force && get().hrDataState.status !== 'loading')) {
          return {
            vacationRequests: get().vacationRequests,
            employeeDebts: get().employeeDebts,
            documentHistory: get().documentHistory,
          }
        }
        set({ hydratingHrData: true })
        try {
          const result = await hrGateway.read('hr')
          const profileByEmployee = new Map(
            result.data.employeeProfiles.map((item) => [item.employeeId, item])
          )
          set((state) => ({
            employeeProfiles: result.data.employeeProfiles,
            employees: state.employees.map((employee) => normalizeEmployee({
              ...employee,
              ...(profileByEmployee.get(employee.id) || {}),
            })),
            vacationRequests: result.data.vacationRequests,
            employeeDebts: result.data.employeeDebts,
            documentHistory: result.data.documentHistory,
            hrOverview: result.data.overview,
            hrDebtStats: result.data.debtStats,
            hrDataState: hrGateway.getState(),
            hydratingHrData: false,
          }))
          return result.data
        } catch (error) {
          set({ hrDataState: hrGateway.getState(), hydratingHrData: false })
          throw error
        }
      },

      hydrateOverview: async ({ force = false } = {}) => {
        if (get().hydratingOverview || (!force && get().overviewDataState.status !== 'loading')) {
          return get().hrOverview
        }
        set({ hydratingOverview: true })
        try {
          const result = await hrGateway.read('overview')
          set({
            hrOverview: result.data,
            hrDebtStats: result.data?.debt || get().hrDebtStats,
            overviewDataState: hrGateway.getState(),
            hydratingOverview: false,
          })
          return result.data
        } catch (error) {
          set({ overviewDataState: hrGateway.getState(), hydratingOverview: false })
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
        set((s) => ({ employees: [emp, ...s.employees], hrOverview: null }))
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
          hrOverview: null,
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
          hrOverview: null,
        }))
      },

      clearSensitive: () => set({
        employees: [],
        employeesDataState: employeesGateway.getState(),
        hydratingEmployees: false,
        employeeProfiles: [],
        hrDataState: hrGateway.getState(),
        hydratingHrData: false,
        hrOverview: null,
        overviewDataState: hrGateway.getState(),
        hydratingOverview: false,
        hrDebtStats: null,
        vacationRequests: [],
        employeeDebts: [],
        documentHistory: [],
        payrollRuns: [],
        performanceReviews: [],
      }),

      addVacationRequest: async (data) => {
        const req = useSessionStore.getState().status === 'demo'
          ? { id: genId('vr'), status: 'pendiente', createdAt: now(), reviewedAt: null, reviewedBy: null, version: 1, ...data }
          : await hrGateway.mutate('createLeaveRequest', {
              startDate: data.startDate,
              endDate: data.endDate,
              reason: data.reason,
            })
        set((s) => ({
          vacationRequests: [req, ...s.vacationRequests],
          hrOverview: null,
        }))
        return req
      },

      updateVacationRequest: (id, data) =>
        set((s) => ({
          vacationRequests: s.vacationRequests.map((r) => (r.id === id ? { ...r, ...data } : r)),
        })),

      reviewVacationRequest: async (id, status, reviewerId) => {
        const current = get().vacationRequests.find((request) => request.id === id)
        if (!current) throw new Error('Solicitud no encontrada.')
        const request = useSessionStore.getState().status === 'demo'
          ? { ...current, status, reviewedAt: now(), reviewedBy: reviewerId, version: (current.version || 1) + 1 }
          : await hrGateway.mutate('reviewLeaveRequest', id, {
              status,
              version: current.version,
            })
        set((state) => ({
          vacationRequests: state.vacationRequests.map((item) => item.id === id ? request : item),
          hrOverview: null,
        }))
        return request
      },

      addEmployeeDebt: async (data) => {
        const debt = useSessionStore.getState().status === 'demo'
          ? { id: genId('debt'), payments: [], createdAt: now(), version: 1, ...data, amount: Number(data.amount) || 0 }
          : await hrGateway.mutate('createDebt', {
              employeeId: data.employeeId,
              concept: data.concept,
              clientName: data.clientName,
              amount: Number(data.amount),
            })
        set((s) => ({
          employeeDebts: [debt, ...s.employeeDebts],
          hrDebtStats: null,
          hrOverview: null,
        }))
        return debt
      },

      addDebtPayment: async (debtId, amount) => {
        const current = get().employeeDebts.find((debt) => debt.id === debtId)
        if (!current) throw new Error('Deuda no encontrada.')
        const debt = useSessionStore.getState().status === 'demo'
          ? {
              ...current,
              version: (current.version || 1) + 1,
              payments: [...(current.payments || []), { id: genId('pay'), amount: Number(amount), date: now().slice(0, 10) }],
            }
          : await hrGateway.mutate('createDebtPayment', debtId, {
              amount: Number(amount),
              paidOn: now().slice(0, 10),
            })
        set((state) => ({
          employeeDebts: state.employeeDebts.map((item) => item.id === debtId ? debt : item),
          hrDebtStats: null,
          hrOverview: null,
        }))
        return debt
      },

      addDocumentRecord: async (data) => {
        const doc = useSessionStore.getState().status === 'demo'
          ? { id: genId('doc'), createdAt: now(), ...data }
          : await hrGateway.mutate('createDocument', data)
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
        const { employees, vacationRequests, hrOverview } = get()
        if (hrOverview) {
          return {
            totalEmployees: Number(hrOverview.totalEmployees) || 0,
            activeEmployees: Number(hrOverview.activeEmployees) || 0,
            approvedVacations: Number(hrOverview.approvedVacations) || 0,
            pendingApprovals: Number(hrOverview.pendingApprovals) || 0,
          }
        }
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
        const { employeeDebts: debts, hrDebtStats } = get()
        if (hrDebtStats) return hrDebtStats
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
        state.employeeProfiles = []
        state.hrDataState = hrGateway.getState()
        state.overviewDataState = hrGateway.getState()
        return state
      },
    }
  )
)

registerSensitiveStateCleaner(() => useRrhhStore.getState().clearSensitive())

export { debtBalance, debtStatus }
