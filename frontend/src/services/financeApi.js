import { apiClient } from './apiClient'

const PAGE_SIZE = 200

const idempotencyOptions = () => ({
  headers: { 'Idempotency-Key': crypto.randomUUID() },
})

async function listAll(path, params = {}) {
  const first = await apiClient.get(path, { ...params, page: 1, pageSize: PAGE_SIZE })
  const totalPages = Math.max(1, Number(first.totalPages) || 1)
  const remaining = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, index) =>
          apiClient.get(path, { ...params, page: index + 2, pageSize: PAGE_SIZE })
        )
      )
    : []
  return {
    ...first,
    items: [first, ...remaining].flatMap((page) => page.items || []),
  }
}

const create = (path, payload) => apiClient.post(path, payload, idempotencyOptions())
const update = (path, payload) => apiClient.patch(path, payload)
const remove = (path, version) => apiClient.delete(path, { version })

export const financeApi = {
  getOverview: (params) => apiClient.get('/api/v1/finance/overview', params),

  listAllExpenses: (params) => listAll('/api/v1/finance/expenses', params),
  createExpense: (payload) => create('/api/v1/finance/expenses', payload),
  updateExpense: (id, payload) => update(`/api/v1/finance/expenses/${id}`, payload),
  deleteExpense: (id, version) => remove(`/api/v1/finance/expenses/${id}`, version),

  listAllFixedExpenses: (params) => listAll('/api/v1/finance/fixed-expenses', params),
  createFixedExpense: (payload) => create('/api/v1/finance/fixed-expenses', payload),
  updateFixedExpense: (id, payload) => update(`/api/v1/finance/fixed-expenses/${id}`, payload),
  deleteFixedExpense: (id, version) => remove(`/api/v1/finance/fixed-expenses/${id}`, version),
  payFixedExpense: (id, payload = {}) => apiClient.post(
    `/api/v1/finance/fixed-expenses/${id}/payments`,
    payload,
    idempotencyOptions()
  ),

  listAllLiabilities: (params) => listAll('/api/v1/finance/liabilities', params),
  getLiabilityStats: (params) => apiClient.get('/api/v1/finance/liabilities/stats', params),
  createLiability: (payload) => create('/api/v1/finance/liabilities', payload),
  updateLiability: (id, payload) => update(`/api/v1/finance/liabilities/${id}`, payload),
  deleteLiability: (id, version) => remove(`/api/v1/finance/liabilities/${id}`, version),

  listAllBudgets: (params) => listAll('/api/v1/finance/budgets', params),
  getBudgetStats: (params) => apiClient.get('/api/v1/finance/budgets/stats', params),
  createBudget: (payload) => create('/api/v1/finance/budgets', payload),
  updateBudget: (id, payload) => update(`/api/v1/finance/budgets/${id}`, payload),
  deleteBudget: (id, version) => remove(`/api/v1/finance/budgets/${id}`, version),

  listAllAccounts: (params) => listAll('/api/v1/finance/accounts', params),
  getAccountStats: (params) => apiClient.get('/api/v1/finance/accounts/stats', params),
  createAccount: (payload) => create('/api/v1/finance/accounts', payload),
  updateAccount: (id, payload) => update(`/api/v1/finance/accounts/${id}`, payload),
  deleteAccount: (id, version) => remove(`/api/v1/finance/accounts/${id}`, version),

  listAllIncomes: (params) => listAll('/api/v1/finance/incomes', params),
  createManualIncome: (payload) => create('/api/v1/finance/manual-incomes', payload),
  updateManualIncome: (id, payload) => update(`/api/v1/finance/manual-incomes/${id}`, payload),
  deleteManualIncome: (id, version) => remove(`/api/v1/finance/manual-incomes/${id}`, version),
}
