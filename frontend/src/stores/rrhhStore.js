import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { debtBalance, debtStatus } from '@/modules/rrhh/lib/rrhh'
import { normalizeWorkSchedule, YAFREISY_SCHEDULE } from '@/modules/rrhh/lib/schedule'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

const SEED_EMPLOYEES = [
  { id: 'emp-1', firstName: 'Leonedis', lastName: 'Hamburgo', email: 'leonedis@charm.do', phone: '8095550100', position: 'Director General', department: 'Administración', branchIds: ['charm-dn', 'charm-santiago', 'charm-este'], contractType: 'Indefinido', initialSalary: 75000, salary: 85000, vacationDays: 15, usuarioId: 'u1', jefeIds: [], clienteId: null, active: true, hireDate: '2020-01-15', bankName: 'Banco Popular', bankAccountType: 'ahorro', bankAccountNumber: '****4521', bankDocument: '00112345678' },
  { id: 'emp-2', firstName: 'Starling', lastName: 'Subervi', email: 'starlingflores94@gmail.com', phone: '8096168273', position: 'Supervisor', department: 'Operaciones', branchIds: ['charm-dn'], contractType: 'Indefinido', initialSalary: 38000, salary: 45000, vacationDays: 15, usuarioId: null, jefeIds: ['emp-1'], clienteId: null, active: true, hireDate: '2021-03-10', bankName: 'Banreservas', bankAccountType: 'ahorro', bankAccountNumber: '****8832', bankDocument: '40298765432' },
  { id: 'emp-3', firstName: 'Jefferson', lastName: 'Ramírez', email: 'jefferson@charm.do', phone: '8095551020', position: 'Barbero', department: 'Operaciones', branchIds: ['charm-dn'], contractType: 'Indefinido', initialSalary: 24000, salary: 28000, vacationDays: 10, usuarioId: null, jefeIds: ['emp-2', 'emp-1'], clienteId: null, active: true, hireDate: '2022-06-01' },
  { id: 'emp-4', firstName: 'Loreinni', lastName: 'Rosario', email: 'loreinni@charm.do', phone: '8295551030', position: 'Asistente De Barbero', department: 'Operaciones', branchIds: ['charm-santiago'], contractType: 'Indefinido', initialSalary: 20000, salary: 22000, vacationDays: 12, usuarioId: null, jefeIds: ['emp-2'], clienteId: null, active: true, hireDate: '2023-01-20' },
  { id: 'emp-5', firstName: 'Jasmin', lastName: 'Fernández', email: 'jasmin@charm.do', phone: '8495551040', position: 'Recepcionista', department: 'Administración', branchIds: ['charm-dn'], contractType: 'Indefinido', initialSalary: 22000, salary: 25000, vacationDays: 15, usuarioId: 'u2', jefeIds: ['emp-1'], clienteId: null, active: true, hireDate: '2021-08-05' },
  { id: 'emp-6', firstName: 'Yocarlin', lastName: 'Charlotte', email: 'yocarlin@charm.do', phone: '8095551050', position: 'Especialista Laser', department: 'Laser', branchIds: ['charm-dn', 'charm-este'], contractType: 'Indefinido', initialSalary: 30000, salary: 35000, vacationDays: 8, usuarioId: null, jefeIds: ['emp-1'], clienteId: null, active: true, hireDate: '2022-11-12', bankName: 'BHD', bankAccountType: 'corriente', bankAccountNumber: '****1190', bankDocument: '22300111222' },
  { id: 'emp-7', firstName: 'Emperatriz', lastName: 'Gomez', email: 'emperatriz@charm.do', phone: '8095551060', position: 'Asistente De Barbero', department: 'Operaciones', branchIds: ['charm-dn'], contractType: 'Indefinido', initialSalary: 18000, salary: 20000, vacationDays: 15, usuarioId: null, jefeIds: ['emp-2'], clienteId: null, active: true, hireDate: '2023-04-18' },
  { id: 'emp-8', firstName: 'Carlos', lastName: 'Méndez', email: 'carlos@charm.do', phone: '8095551070', position: 'Cajero', department: 'Ventas', branchIds: ['charm-dn'], contractType: 'Indefinido', initialSalary: 21000, salary: 24000, vacationDays: 10, usuarioId: 'u3', jefeIds: ['emp-1'], clienteId: null, active: true, hireDate: '2022-02-28' },
  { id: 'emp-9', firstName: 'Ana', lastName: 'Jiménez', email: 'ana@charm.do', phone: '8095551080', position: 'Vendedora', department: 'Ventas', branchIds: ['charm-este'], contractType: 'Indefinido', initialSalary: 20000, salary: 23000, vacationDays: 12, usuarioId: 'u5', jefeIds: ['emp-1'], clienteId: null, active: true, hireDate: '2023-07-01' },
  { id: 'emp-10', firstName: 'Fiordaliza', lastName: 'Peña', email: 'fiordaliza@charm.do', phone: '8095551090', position: 'Estilista', department: 'Operaciones', branchIds: ['charm-santiago'], contractType: 'Indefinido', initialSalary: 24000, salary: 26000, vacationDays: 0, usuarioId: null, jefeIds: ['emp-2'], clienteId: null, active: false, hireDate: '2020-09-15' },
  { id: 'emp-11', firstName: 'María', lastName: 'López', email: 'maria.rrhh@charm.do', phone: '8095551100', position: 'Analista RRHH', department: 'Recursos Humanos', branchIds: ['charm-dn'], contractType: 'Indefinido', initialSalary: 34000, salary: 38000, vacationDays: 15, usuarioId: null, jefeIds: ['emp-1'], clienteId: null, active: true, hireDate: '2021-05-20' },
  { id: 'emp-12', firstName: 'Pedro', lastName: 'Santos', email: 'pedro@charm.do', phone: '8095551110', position: 'Contador', department: 'Finanzas', branchIds: ['charm-dn', 'charm-santiago'], contractType: 'Indefinido', initialSalary: 38000, salary: 42000, vacationDays: 14, usuarioId: null, jefeIds: ['emp-1'], clienteId: null, active: true, hireDate: '2019-11-01' },
  {
    id: 'emp-13',
    firstName: 'Yafreisy',
    lastName: 'Rodríguez',
    email: 'yafreisy@charm.do',
    phone: '8095551120',
    position: 'Especialista Laser',
    department: 'Laser',
    branchIds: ['charm-dn'],
    contractType: 'Indefinido',
    initialSalary: 28000,
    salary: 32000,
    vacationDays: 10,
    usuarioId: null,
    jefeIds: ['emp-1'],
    clienteId: null,
    active: true,
    hireDate: '2023-09-01',
    workSchedule: YAFREISY_SCHEDULE,
  },
].map((e) => ({ ...e, createdAt: daysAgo(400), updatedAt: daysAgo(1) }))

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
    hireDate: data.hireDate || now().slice(0, 10),
    bankName: data.bankName?.trim() || '',
    bankAccountType: data.bankAccountType || 'ahorro',
    bankAccountNumber: data.bankAccountNumber?.trim() || '',
    bankDocument: data.bankDocument?.trim() || '',
    workSchedule: normalizeWorkSchedule(data.workSchedule),
    createdAt: data.createdAt || now(),
    updatedAt: now(),
  }
}

export const useRrhhStore = create(
  persist(
    (set, get) => ({
      employees: SEED_EMPLOYEES,
      vacationRequests: SEED_REQUESTS,
      employeeDebts: SEED_DEBTS,
      documentHistory: [],
      payrollRuns: [],
      performanceReviews: SEED_REVIEWS,
      currentUserId: 'u1',

      getEmployeeByUserId: (userId) => get().employees.find((e) => e.usuarioId === userId),

      addEmployee: (data) => {
        const emp = normalizeEmployee(data)
        set((s) => ({ employees: [emp, ...s.employees] }))
        return emp
      },

      updateEmployee: (id, data) =>
        set((s) => ({
          employees: s.employees.map((e) => (e.id === id ? normalizeEmployee({ ...e, ...data, id }) : e)),
        })),

      deleteEmployee: (id) => set((s) => ({ employees: s.employees.filter((e) => e.id !== id) })),

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
      version: 3,
      migrate: (persisted) => persisted ?? {},
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        if (Array.isArray(state.employees)) {
          state.employees = state.employees.map((e) => normalizeEmployee(e))
          const hasYafreisy = state.employees.some((e) => e.id === 'emp-13')
          if (!hasYafreisy) {
            state.employees = [...state.employees, normalizeEmployee(SEED_EMPLOYEES.find((e) => e.id === 'emp-13'))]
          }
        }
        return state
      },
    }
  )
)

export { debtBalance, debtStatus }
