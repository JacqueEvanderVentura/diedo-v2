import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { employeesGateway, masterDataApi } from '@/services/masterDataApi'
import { hrApi, hrGateway } from '@/services/hrApi'
import { employeeToApiPayload, mapEmployeeFromApi } from '@/services/adapters/masterData'
import { useSessionStore } from '@/stores/sessionStore'
import { debtBalance, debtStatus } from '@/modules/rrhh/lib/rrhh'
import { normalizeWorkSchedule } from '@/modules/rrhh/lib/schedule'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const API_UNAVAILABLE = 'La API no está disponible.'
const CONTRACT_SAVE_ERROR = 'No se pudo guardar el contrato. Intenta de nuevo o sigue sin archivo.'
const DOCUMENTS_SAVE_ERROR = 'No se pudieron guardar los documentos. Intenta de nuevo desde editar.'
const PROFILE_SAVE_ERROR = 'No se pudo guardar el salario o la residencia. Intenta de nuevo desde editar.'

function canManageHrProfile() {
  return useSessionStore.getState().hasPermission('hr.profile.manage')
}

function mergeProfile(employee, profile) {
  return normalizeEmployee({ ...employee, ...profile })
}

function upsertProfile(profiles, profile) {
  const rest = profiles.filter((item) => item.employeeId !== profile.employeeId)
  return [profile, ...rest]
}

function withSaveWarnings(employee, profileWarning, attachmentWarning) {
  const warning = [profileWarning, attachmentWarning].filter(Boolean).join(' ')
  return warning ? { ...employee, attachmentWarning: warning } : employee
}

async function syncHrProfile(employee, data) {
  if (!canManageHrProfile()) return { profile: null, profileWarning: null }
  const salaryRaw = data.salary
  const hasSalary = salaryRaw !== '' && salaryRaw != null && Number.isFinite(Number(salaryRaw))
  const hasResidenceField = Object.hasOwn(data, 'residenceLocation')
  const residence = hasResidenceField ? (String(data.residenceLocation || '').trim() || null) : undefined
  if (!hasSalary && residence === undefined) return { profile: null, profileWarning: null }
  if (!hasSalary && !residence && !employee.residenceLocation) {
    return { profile: null, profileWarning: null }
  }
  const payload = { version: employee.profileVersion || 1 }
  if (hasSalary) payload.salary = Number(salaryRaw)
  if (residence !== undefined) payload.residenceLocation = residence
  try {
    const profile = await hrApi.updateProfile(employee.id, payload)
    return { profile, profileWarning: null }
  } catch (error) {
    return { profile: null, profileWarning: error.message || PROFILE_SAVE_ERROR }
  }
}

async function syncEmployeeAttachments(employeeId, items, previousIds, classification, fallbackError) {
  const current = items || []
  const keptIds = new Set(current.filter((item) => item.id && !item.pendingFile).map((item) => item.id))
  const removed = (previousIds || []).filter((id) => !keptIds.has(id))
  const pending = current.filter((item) => item.pendingFile)
  let changed = false
  try {
    for (const attachmentId of removed) {
      await masterDataApi.deleteEmployeeAttachment(employeeId, attachmentId)
      changed = true
    }
    for (const item of pending) {
      const formData = new FormData()
      formData.append('file', item.pendingFile, item.name || item.pendingFile.name)
      formData.append('classification', classification)
      await masterDataApi.uploadEmployeeAttachment(employeeId, formData)
      changed = true
    }
    return { warning: null, changed }
  } catch (error) {
    return { warning: error.message || fallbackError, changed }
  }
}

async function syncEmployeeFiles(employeeId, data, { creating = false } = {}) {
  if (!canManageHrProfile()) return { warning: null, attachmentCount: null }
  const contract = await syncEmployeeAttachments(
    employeeId,
    data.attachments,
    creating ? [] : data.existingContractIds,
    'labor_contract',
    CONTRACT_SAVE_ERROR
  )
  const documents = await syncEmployeeAttachments(
    employeeId,
    data.documents,
    creating ? [] : data.existingDocumentIds,
    'employee_document',
    DOCUMENTS_SAVE_ERROR
  )
  const warning = [contract.warning, documents.warning].filter(Boolean).join(' ') || null
  if (!contract.changed && !documents.changed) return { warning, attachmentCount: null }
  try {
    const listed = await masterDataApi.employeeAttachments(employeeId)
    return { warning, attachmentCount: listed.length }
  } catch {
    return { warning, attachmentCount: null }
  }
}

function normalizeEmployee(data) {
  const branchIds = Array.isArray(data.branchIds) && data.branchIds.length
    ? data.branchIds
    : data.branchId
      ? [data.branchId]
      : []
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
    branchId: branchIds[0] || '',
    jefeIds,
    jefeId: jefeIds[0] || null,
    contractType: data.contractType?.trim() || 'Indefinido',
    documentType: data.documentType || (data.documentId ? 'cedula' : null),
    documentId: data.documentId?.trim() || null,
    residenceLocation: data.residenceLocation?.trim() || '',
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
    selectableAsSpecialist: data.selectableAsSpecialist ?? true,
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
      performanceReviews: [],
      employeeBookingFlags: {},
      getEmployeeByUserId: (userId) => get().employees.find((e) => e.usuarioId === userId),

      hydrateEmployees: async ({ force = false } = {}) => {
        if (get().hydratingEmployees || (!force && get().employeesDataState.status !== 'loading')) {
          return get().employees
        }
        set({ hydratingEmployees: true })
        try {
          const result = await employeesGateway.read('employees')
          const profileByEmployee = new Map(get().employeeProfiles.map((item) => [item.employeeId, item]))
          const flags = get().employeeBookingFlags || {}
          const employees = result.data.map((item) => {
            const employee = normalizeEmployee(mapEmployeeFromApi(item))
            const merged = normalizeEmployee({ ...employee, ...(profileByEmployee.get(employee.id) || {}) })
            if (Object.hasOwn(flags, merged.id)) {
              return normalizeEmployee({ ...merged, selectableAsSpecialist: flags[merged.id] })
            }
            return merged
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
        if (useSessionStore.getState().status !== 'online') throw new Error(API_UNAVAILABLE)
        const branchIds = useSessionStore.getState().user?.branchIds || []
        const response = await employeesGateway.mutate(
          'createEmployee',
          employeeToApiPayload(data, branchIds)
        )
        let emp = normalizeEmployee(mapEmployeeFromApi(response))
        const { profile, profileWarning } = await syncHrProfile(emp, data)
        if (profile) emp = mergeProfile(emp, profile)
        const { warning: attachmentWarning, attachmentCount } = await syncEmployeeFiles(
          emp.id,
          data,
          { creating: true }
        )
        if (attachmentCount != null) emp = { ...emp, attachmentCount }
        set((s) => ({
          employees: [emp, ...s.employees],
          employeeProfiles: profile
            ? upsertProfile(s.employeeProfiles, profile)
            : s.employeeProfiles,
          hrOverview: null,
        }))
        return withSaveWarnings(emp, profileWarning, attachmentWarning)
      },

      updateEmployee: async (id, data) => {
        const current = get().employees.find((employee) => employee.id === id)
        if (!current) throw new Error('Empleado no encontrado.')
        if (useSessionStore.getState().status !== 'online') throw new Error(API_UNAVAILABLE)
        const complete = { ...current, ...data }
        const { schedule, timezone, ...basicPayload } = employeeToApiPayload(complete)
        if (Object.hasOwn(data, 'selectableAsSpecialist')) {
          basicPayload.onlineBookingSelectable = data.selectableAsSpecialist
        }
        const response = await employeesGateway.mutate('updateEmployee', id, {
          ...basicPayload,
          version: current.version,
        })
        let employee = normalizeEmployee(mapEmployeeFromApi(response))
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
        const { profile, profileWarning } = await syncHrProfile(employee, data)
        if (profile) employee = mergeProfile(employee, profile)
        const { warning: attachmentWarning, attachmentCount } = await syncEmployeeFiles(id, data)
        if (attachmentCount != null) employee = { ...employee, attachmentCount }
        set((state) => ({
          employees: state.employees.map((item) => (item.id === id ? {
            ...employee,
            selectableAsSpecialist: data.selectableAsSpecialist ?? employee.selectableAsSpecialist,
          } : item)),
          employeeProfiles: profile
            ? upsertProfile(state.employeeProfiles, profile)
            : state.employeeProfiles,
          hrOverview: null,
        }))
        return withSaveWarnings(employee, profileWarning, attachmentWarning)
      },

      deleteEmployee: async (id) => {
        const current = get().employees.find((employee) => employee.id === id)
        if (!current) return
        if (useSessionStore.getState().status !== 'online') throw new Error(API_UNAVAILABLE)
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
        if (useSessionStore.getState().status !== 'online') throw new Error(API_UNAVAILABLE)
        const req = await hrGateway.mutate('createLeaveRequest', {
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
        if (useSessionStore.getState().status !== 'online') throw new Error(API_UNAVAILABLE)
        const request = await hrGateway.mutate('reviewLeaveRequest', id, {
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
        if (useSessionStore.getState().status !== 'online') throw new Error(API_UNAVAILABLE)
        const debt = await hrGateway.mutate('createDebt', {
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
        if (useSessionStore.getState().status !== 'online') throw new Error(API_UNAVAILABLE)
        const debt = await hrGateway.mutate('createDebtPayment', debtId, {
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
        if (useSessionStore.getState().status !== 'online') throw new Error(API_UNAVAILABLE)
        const doc = await hrGateway.mutate('createDocument', data)
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
