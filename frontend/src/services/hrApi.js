import { apiClient } from './apiClient'
import { createModuleGateway } from './dataGateway'
import { demoRepository, DEMO_SEED_ENABLED } from './demoRepository'
import { useSessionStore } from '@/stores/sessionStore'

const idempotencyOptions = () => ({
  headers: { 'Idempotency-Key': crypto.randomUUID() },
})

function mapProfile(item) {
  return {
    employeeId: item.employeeId,
    initialSalary: Number(item.initialSalary) || 0,
    salary: Number(item.salary) || 0,
    vacationDays: Number(item.vacationDays) || 0,
    bankName: item.bankName || '',
    bankAccountType: item.bankAccountType || 'ahorro',
    bankAccountNumber: item.bankAccountNumber || '',
    bankDocument: item.bankDocument || '',
    profileVersion: item.version,
    profileUpdatedAt: item.updatedAt,
  }
}

function mapLeaveRequest(item) {
  return {
    id: item.id || item.seedKey,
    employeeId: item.employeeId || item.employeeSeedKey,
    startDate: item.startDate,
    endDate: item.endDate,
    reason: item.reason,
    status: item.status,
    createdAt: item.createdAt || item.startDate,
    reviewedAt: item.reviewedAt || null,
    reviewedBy: item.reviewedByPlatformUserId || item.reviewedByUserSeedKey || null,
    version: item.version || 1,
  }
}

function mapDebt(item) {
  return {
    id: item.id || item.seedKey,
    employeeId: item.employeeId || item.employeeSeedKey,
    concept: item.concept,
    clientName: item.clientName || null,
    amount: Number(item.amount) || 0,
    payments: (item.payments || []).map((payment) => ({
      id: payment.id || payment.seedKey,
      amount: Number(payment.amount) || 0,
      date: payment.paidOn || payment.date,
    })),
    createdAt: item.createdAt || null,
    version: item.version || 1,
  }
}

function mapDocument(item) {
  return {
    id: item.id || item.seedKey,
    employeeId: item.employeeId || item.employeeSeedKey,
    templateId: item.templateId,
    issueDate: item.issueDate,
    includeSalary: item.includeSalary === true,
    referenceCode: item.referenceCode || null,
    snapshot: item.snapshot || null,
    createdAt: item.createdAt || item.issueDate,
  }
}

function mapDebtStats(item) {
  if (!item) return null
  return {
    totalDebt: Number(item.totalDebt) || 0,
    totalPaid: Number(item.totalPaid) || 0,
    pending: Number(item.pending) || 0,
    employeesWithDebt: Number(item.employeesWithDebt) || 0,
  }
}

function mapOverview(item) {
  if (!item) return null
  return {
    totalEmployees: Number(item.totalEmployees) || 0,
    activeEmployees: Number(item.activeEmployees) || 0,
    approvedVacations: Number(item.approvedVacations) || 0,
    pendingApprovals: Number(item.pendingApprovals) || 0,
    debt: mapDebtStats(item.debt),
    recentRequests: (item.recentRequests || []).map(mapLeaveRequest),
  }
}

function mapDemoOverview(data) {
  const employees = demoRepository.employees()
  const requests = (data.leaveRequests || []).map(mapLeaveRequest)
  const debts = (data.debts || []).map(mapDebt)
  const debt = debts.reduce((summary, item) => {
    const paid = item.payments.reduce((total, payment) => total + payment.amount, 0)
    const pending = Math.max(0, item.amount - paid)
    summary.totalDebt += item.amount
    summary.totalPaid += paid
    summary.pending += pending
    if (pending > 0) summary.employeeIds.add(item.employeeId)
    return summary
  }, { totalDebt: 0, totalPaid: 0, pending: 0, employeeIds: new Set() })
  return {
    totalEmployees: employees.length,
    activeEmployees: employees.filter((employee) => employee.status !== 'inactive').length,
    approvedVacations: requests.filter((request) => request.status === 'aprobada').length,
    pendingApprovals: requests.filter((request) => request.status === 'pendiente').length,
    debt: {
      totalDebt: debt.totalDebt,
      totalPaid: debt.totalPaid,
      pending: debt.pending,
      employeesWithDebt: debt.employeeIds.size,
    },
    recentRequests: requests.slice(0, 3),
  }
}

function mapDemoHr(data) {
  const employeeProfiles = demoRepository.employees().map((employee) => ({
    employeeId: employee.seedKey,
    initialSalary: Number(employee.futureHr?.initialSalary) || 0,
    salary: Number(employee.futureHr?.salary) || 0,
    vacationDays: Number(employee.futureHr?.vacationDays) || 0,
    bankName: employee.futureHr?.bankName || '',
    bankAccountType: employee.futureHr?.bankAccountType || 'ahorro',
    bankAccountNumber: employee.futureHr?.bankAccountNumber || '',
    bankDocument: employee.futureHr?.bankDocument || '',
    profileVersion: 1,
  }))
  return {
    employeeProfiles,
    vacationRequests: (data.leaveRequests || []).map(mapLeaveRequest),
    employeeDebts: (data.debts || []).map(mapDebt),
    documentHistory: (data.documents || []).map(mapDocument),
    debtStats: null,
    overview: mapDemoOverview(data),
  }
}

export const hrApi = {
  hr: async () => {
    const session = useSessionStore.getState()
    const can = (permission) => session.hasPermission(permission)
    const [profiles, ownLeave, leaveRequests, debts, documents, debtStats, overview] = await Promise.all([
      can('hr.profile.read')
        ? apiClient.get('/api/v1/hr/profiles', { pageSize: 100 })
        : Promise.resolve({ items: [] }),
      can('hr.leave.request')
        ? apiClient.get('/api/v1/hr/leave-requests/me').catch((error) => {
            if (error.status === 404) return { items: [] }
            throw error
          })
        : Promise.resolve({ items: [] }),
      can('hr.leave.review')
        ? apiClient.get('/api/v1/hr/leave-requests', { pageSize: 100 })
        : Promise.resolve(null),
      can('hr.debt.read')
        ? apiClient.get('/api/v1/hr/debts', { pageSize: 100 })
        : Promise.resolve({ items: [] }),
      can('hr.document.read')
        ? apiClient.get('/api/v1/hr/documents', { pageSize: 100 })
        : Promise.resolve({ items: [] }),
      can('hr.debt.read')
        ? apiClient.get('/api/v1/hr/debts/stats')
        : Promise.resolve(null),
      can('hr.overview.read')
        ? apiClient.get('/api/v1/hr/overview').then(mapOverview)
        : Promise.resolve(null),
    ])
    const employeeProfiles = profiles.items.map(mapProfile)
    if (
      ownLeave.employeeId
      && !employeeProfiles.some((profile) => profile.employeeId === ownLeave.employeeId)
    ) {
      employeeProfiles.push({
        employeeId: ownLeave.employeeId,
        initialSalary: 0,
        salary: 0,
        vacationDays: Number(ownLeave.vacationDays) || 0,
        bankName: '',
        bankAccountType: 'ahorro',
        bankAccountNumber: '',
        bankDocument: '',
        profileVersion: 1,
        profileUpdatedAt: null,
      })
    }
    return {
      employeeProfiles,
      vacationRequests: (leaveRequests?.items || ownLeave.items || []).map(mapLeaveRequest),
      employeeDebts: debts.items.map(mapDebt),
      documentHistory: documents.items.map(mapDocument),
      debtStats: mapDebtStats(debtStats),
      overview,
    }
  },
  overview: async () => useSessionStore.getState().hasPermission('hr.overview.read')
    ? mapOverview(await apiClient.get('/api/v1/hr/overview'))
    : null,
  createLeaveRequest: async (payload) => mapLeaveRequest(
    await apiClient.post('/api/v1/hr/leave-requests', payload)
  ),
  reviewLeaveRequest: async (id, payload) => mapLeaveRequest(
    await apiClient.post(`/api/v1/hr/leave-requests/${id}/decision`, payload)
  ),
  createDebt: async (payload) => mapDebt(
    await apiClient.post('/api/v1/hr/debts', payload, idempotencyOptions())
  ),
  createDebtPayment: async (id, payload) => mapDebt(
    await apiClient.post(`/api/v1/hr/debts/${id}/payments`, payload, idempotencyOptions())
  ),
  createDocument: async (payload) => mapDocument(
    await apiClient.post('/api/v1/hr/documents', payload, idempotencyOptions())
  ),
}

export const hrGateway = createModuleGateway({
  module: 'hr',
  apiRepository: hrApi,
  demoRepository: {
    hr: () => mapDemoHr(demoRepository.hr()),
    overview: () => mapDemoOverview(demoRepository.hr()),
  },
  demoEnabled: DEMO_SEED_ENABLED,
  demoActive: () => useSessionStore.getState().status === 'demo',
})

export { mapDebt, mapDebtStats, mapDocument, mapLeaveRequest, mapOverview, mapProfile }
