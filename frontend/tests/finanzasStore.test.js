import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getOverview: vi.fn(),
  listAllExpenses: vi.fn(),
  listAllFixedExpenses: vi.fn(),
  listAllLiabilities: vi.fn(),
  getLiabilityStats: vi.fn(),
  listAllBudgets: vi.fn(),
  getBudgetStats: vi.fn(),
  listAllAccounts: vi.fn(),
  getAccountStats: vi.fn(),
  listAllIncomes: vi.fn(),
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}))

vi.mock('@/services/financeApi', () => ({ financeApi: mocks }))

import { useFinanzasStore } from '@/stores/finanzasStore'
import { useSessionStore } from '@/stores/sessionStore'

const overview = {
  period: '2026-09',
  branchId: null,
  currency: 'DOP',
  incomes: '20000.00',
  expenses: '7500.00',
  balance: '12500.00',
  alerts: 2,
  grossProfitEstimate: '14000.00',
  netMarginPercent: '62.50',
  trend: [{ period: '2026-09', label: 'sep', value: '20000.00' }],
}

const expense = {
  id: 'expense-id',
  concept: 'Insumos',
  amount: '1250.50',
  category: 'insumos',
  date: '2026-09-01',
  branchId: 'branch-id',
  status: 'pagado',
  budgetId: 'budget-id',
  source: 'finanzas',
  editable: true,
  version: 1,
}

function mockHydration() {
  mocks.getOverview.mockResolvedValue(overview)
  mocks.listAllExpenses.mockResolvedValue({
    items: [expense, { ...expense, id: 'cash-id', source: 'caja', editable: false, version: null }],
  })
  mocks.listAllFixedExpenses.mockResolvedValue({ items: [] })
  mocks.listAllLiabilities.mockResolvedValue({ items: [] })
  mocks.getLiabilityStats.mockResolvedValue({ totalDebt: '0', cards: 0, loans: 0 })
  mocks.listAllBudgets.mockResolvedValue({ items: [] })
  mocks.getBudgetStats.mockResolvedValue({ totalBudget: '0', spent: '0', remaining: '0', overBudget: 0 })
  mocks.listAllAccounts.mockResolvedValue({ items: [] })
  mocks.getAccountStats.mockResolvedValue({ total: '0', bank: '0', investment: '0', shareholders: '0' })
  mocks.listAllIncomes.mockResolvedValue({
    items: [
      { id: 'income-id', amount: '5000', source: 'Formulario', editable: true, version: 1 },
      { id: 'sale-id', amount: '15000', source: 'POS', editable: false, version: null },
    ],
  })
}

describe('store de Finanzas conectado a la API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({ status: 'online' })
    useFinanzasStore.setState({
      expenses: [],
      expensesProjected: false,
      fixedExpenses: [],
      pasivos: [],
      budgets: [],
      accounts: [],
      manualIncomes: [],
      incomeEntries: [],
      incomesProjected: false,
      overview: null,
      liabilityStats: null,
      budgetStats: null,
      accountStats: null,
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,
    })
    mockHydration()
  })

  it('reemplaza semillas por las diez respuestas y evita duplicar POS/Caja', async () => {
    await useFinanzasStore.getState().hydrateFromApi()

    expect(mocks.getOverview).toHaveBeenCalledOnce()
    expect(mocks.listAllExpenses).toHaveBeenCalledOnce()
    expect(mocks.listAllIncomes).toHaveBeenCalledOnce()
    expect(useFinanzasStore.getState()).toMatchObject({
      expenses: [
        expect.objectContaining({ id: 'expense-id', amount: 1250.5, editable: true }),
        expect.objectContaining({ id: 'cash-id', source: 'caja', editable: false }),
      ],
      expensesProjected: true,
      manualIncomes: [expect.objectContaining({ id: 'income-id', amount: 5000 })],
      incomeEntries: [
        expect.objectContaining({ id: 'income-id' }),
        expect.objectContaining({ id: 'sale-id', source: 'POS' }),
      ],
      incomesProjected: true,
      apiContext: { hydrated: true },
    })
    expect(useFinanzasStore.getState().getOverviewStats()).toMatchObject({
      ingresosMes: 20000,
      gastosMes: 7500,
      balance: 12500,
      alertas: 2,
    })
  })

  it('usa versión en edición y bloquea movimientos proyectados de Caja', async () => {
    await useFinanzasStore.getState().hydrateFromApi()
    mocks.updateExpense.mockResolvedValue({ ...expense, amount: '1400.00', version: 2 })

    await useFinanzasStore.getState().updateExpense('expense-id', { amount: 1400 })

    expect(mocks.updateExpense).toHaveBeenCalledWith(
      'expense-id',
      expect.objectContaining({ version: 1, amount: 1400 })
    )
    await expect(
      useFinanzasStore.getState().updateExpense('cash-id', { amount: 1 })
    ).rejects.toThrow(/Caja/)
    expect(mocks.updateExpense).toHaveBeenCalledTimes(1)
  })
})
