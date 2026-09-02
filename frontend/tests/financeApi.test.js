import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/services/apiClient', () => ({ apiClient: mocks }))

import { financeApi } from '@/services/financeApi'

describe('cliente API de Finanzas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue({ items: [], totalPages: 0 })
  })

  it('consulta overview, colecciones y estadísticas con paginación completa', async () => {
    await Promise.all([
      financeApi.getOverview(),
      financeApi.listAllExpenses(),
      financeApi.listAllFixedExpenses(),
      financeApi.listAllLiabilities(),
      financeApi.getLiabilityStats(),
      financeApi.listAllBudgets(),
      financeApi.getBudgetStats(),
      financeApi.listAllAccounts(),
      financeApi.getAccountStats(),
      financeApi.listAllIncomes(),
    ])

    expect(mocks.get).toHaveBeenCalledWith('/api/v1/finance/overview', undefined)
    for (const path of [
      'expenses',
      'fixed-expenses',
      'liabilities',
      'budgets',
      'accounts',
      'incomes',
    ]) {
      expect(mocks.get).toHaveBeenCalledWith(`/api/v1/finance/${path}`, {
        page: 1,
        pageSize: 200,
      })
    }
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/finance/liabilities/stats', undefined)
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/finance/budgets/stats', undefined)
    expect(mocks.get).toHaveBeenCalledWith('/api/v1/finance/accounts/stats', undefined)
  })

  it('envía altas idempotentes, versiones y pagos al recurso correcto', async () => {
    mocks.post.mockResolvedValue({})
    mocks.patch.mockResolvedValue({})
    mocks.delete.mockResolvedValue(null)

    await financeApi.createExpense({ concept: 'Gasto' })
    await financeApi.updateExpense('expense-id', { version: 2, amount: 10 })
    await financeApi.deleteExpense('expense-id', 3)
    await financeApi.payFixedExpense('fixed-id', { period: '2026-09-01' })
    await financeApi.createLiability({ name: 'Préstamo' })
    await financeApi.createBudget({ name: 'Operaciones' })
    await financeApi.createAccount({ name: 'Banco' })
    await financeApi.createManualIncome({ amount: 20 })

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/finance/expenses',
      { concept: 'Gasto' },
      { headers: { 'Idempotency-Key': expect.any(String) } }
    )
    expect(mocks.patch).toHaveBeenCalledWith('/api/v1/finance/expenses/expense-id', {
      version: 2,
      amount: 10,
    })
    expect(mocks.delete).toHaveBeenCalledWith('/api/v1/finance/expenses/expense-id', {
      version: 3,
    })
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/finance/fixed-expenses/fixed-id/payments',
      { period: '2026-09-01' },
      { headers: { 'Idempotency-Key': expect.any(String) } }
    )
    for (const path of ['liabilities', 'budgets', 'accounts']) {
      expect(mocks.post).toHaveBeenCalledWith(
        `/api/v1/finance/${path}`,
        expect.any(Object),
        { headers: { 'Idempotency-Key': expect.any(String) } }
      )
    }
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/finance/manual-incomes',
      { amount: 20 },
      { headers: { 'Idempotency-Key': expect.any(String) } }
    )
  })
})
