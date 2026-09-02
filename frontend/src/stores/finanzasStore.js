import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEMO_SNAPSHOT } from '@/data/generated/demoSnapshot'
import { financeApi } from '@/services/financeApi'
import {
  accountToApiPayload,
  budgetToApiPayload,
  expenseToApiPayload,
  fixedExpenseToApiPayload,
  liabilityToApiPayload,
  manualIncomeToApiPayload,
  mapFinanceAccountFromApi,
  mapFinanceBudgetFromApi,
  mapFinanceExpenseFromApi,
  mapFinanceFixedExpenseFromApi,
  mapFinanceIncomeFromApi,
  mapFinanceLiabilityFromApi,
  mapFinanceOverviewFromApi,
} from '@/services/adapters/finance'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { useSessionStore } from '@/stores/sessionStore'
import { isThisMonth } from '@/modules/finanzas/lib/finanzas'

const genId = (prefix = 'fin') =>
  `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const dayKey = () => new Date().toISOString().slice(0, 10)
const monthKey = () => dayKey().slice(0, 7)
const isOnline = () => useSessionStore.getState().status === 'online'
const BRANCH_ID_BY_CODE = {
  DOWNTOWN: 'charm-dn',
  NORTH: 'charm-santiago',
  EAST: 'charm-este',
  HQ: 'charm-dn',
}
const branchIdFor = (code) => BRANCH_ID_BY_CODE[code] || code

export const EXPENSE_CATEGORIES = [
  { id: 'alquiler', name: 'Alquiler' },
  { id: 'servicios', name: 'Servicios (luz/agua/internet)' },
  { id: 'nomina', name: 'Nómina' },
  { id: 'insumos', name: 'Insumos' },
  { id: 'marketing', name: 'Marketing' },
  { id: 'mantenimiento', name: 'Mantenimiento' },
  { id: 'otros', name: 'Otros' },
]

export const BUDGET_GROUPS = [
  { id: 'marketing', name: 'Marketing' },
  { id: 'operaciones', name: 'Operaciones' },
  { id: 'rh', name: 'RH & Nómina' },
  { id: 'it', name: 'IT & Infraestructura' },
]

export const ACCOUNT_TYPES = [
  { id: 'banco', name: 'Cuenta Bancaria' },
  { id: 'inversion', name: 'Inversión' },
  { id: 'accionistas', name: 'Accionistas' },
]

export const catName = (id) => EXPENSE_CATEGORIES.find((category) => category.id === id)?.name || id

const financeFixture = DEMO_SNAPSHOT.finance || {}
const budgetIdFor = (seedKey) => seedKey ? `budget:${seedKey}` : null

const SEED_EXPENSES = (financeFixture.expenses || []).map((item) => ({
  id: `expense:${item.seedKey}`,
  concept: item.concept,
  amount: Number(item.amount),
  category: item.category,
  date: item.date,
  branchId: branchIdFor(item.branchCode),
  status: item.status,
  budgetId: budgetIdFor(item.budgetSeedKey),
  source: 'finanzas',
  editable: true,
  createdAt: item.createdAt,
}))

const SEED_FIXED = (financeFixture.fixedExpenses || []).map((item) => ({
  id: `fixed:${item.seedKey}`,
  concept: item.concept,
  amount: Number(item.amount),
  category: item.category,
  branchId: branchIdFor(item.branchCode),
  dayOfMonth: Number(item.dayOfMonth),
  paidMonths: (item.payments || []).map((payment) => payment.period.slice(0, 7)),
  payments: item.payments || [],
  createdAt: item.createdAt,
}))

const SEED_PASIVOS = (financeFixture.liabilities || []).map((item) => ({
  id: `liability:${item.seedKey}`,
  name: item.name,
  type: item.type,
  initialAmount: Number(item.initialAmount),
  pendingAmount: Number(item.pendingAmount),
  branchId: branchIdFor(item.branchCode),
  payDay: Number(item.payDay),
  cutDay: item.cutDay,
  installment: item.installment == null ? null : Number(item.installment),
  paidInstallments: Number(item.paidInstallments) || 0,
  totalInstallments: item.totalInstallments,
  categoryIds: item.categoryIds || [],
  createdAt: item.createdAt,
}))

const SEED_BUDGETS = (financeFixture.budgets || []).map((item) => ({
  id: budgetIdFor(item.seedKey),
  name: item.name,
  group: item.group,
  monthlyLimit: Number(item.monthlyLimit),
  branchId: branchIdFor(item.branchCode),
  createdAt: item.createdAt,
}))

const SEED_ACCOUNTS = (financeFixture.accounts || []).map((item) => ({
  id: `account:${item.seedKey}`,
  name: item.name,
  type: item.type,
  bank: item.bank,
  accountNumber: item.accountNumberMasked,
  balance: Number(item.balance),
  currency: item.currency,
  branchId: branchIdFor(item.branchCode),
  notes: item.notes || '',
  createdAt: item.createdAt,
}))

const SEED_MANUAL_INCOMES = (financeFixture.manualIncomes || []).map((item) => ({
  id: `income:${item.seedKey}`,
  category: item.category,
  branchId: branchIdFor(item.branchCode),
  amount: Number(item.amount),
  date: item.date,
  customer: item.customer || '',
  source: item.source,
  status: item.status,
  editable: true,
  createdAt: item.createdAt,
}))

let financeHydrationPromise = null

function sumInMonth(items, dateKey, amountKey = 'amount') {
  return items
    .filter((item) => isThisMonth(item[dateKey]))
    .reduce((sum, item) => sum + (Number(item[amountKey]) || 0), 0)
}

function replaceById(items, next) {
  return items.map((item) => (item.id === next.id ? next : item))
}

function derivePasivoStats(pasivos) {
  return {
    deudaTotal: pasivos.reduce((sum, item) => sum + item.pendingAmount, 0),
    tarjetas: pasivos.filter((item) => item.type === 'tarjeta').length,
    prestamos: pasivos.filter((item) => item.type === 'prestamo').length,
  }
}

function deriveBudgetStats(budgets, expenses, branchId = null) {
  const list = branchId ? budgets.filter((budget) => budget.branchId === branchId) : budgets
  const spentFor = (budget) => budget.spent ?? expenses
    .filter((expense) => expense.budgetId === budget.id && isThisMonth(expense.date))
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0)
  const totalBudget = list.reduce((sum, budget) => sum + budget.monthlyLimit, 0)
  const spent = list.reduce((sum, budget) => sum + spentFor(budget), 0)
  return {
    totalBudget,
    spent,
    remaining: totalBudget - spent,
    overBudget: list.filter((budget) => spentFor(budget) > budget.monthlyLimit).length,
  }
}

function deriveAccountStats(accounts) {
  const sum = (type) => accounts
    .filter((account) => account.type === type)
    .reduce((total, account) => total + account.balance, 0)
  return {
    total: accounts.reduce((total, account) => total + account.balance, 0),
    banco: sum('banco'),
    inversion: sum('inversion'),
    accionistas: sum('accionistas'),
  }
}

function initialState() {
  return {
    expenses: structuredClone(SEED_EXPENSES),
    expensesProjected: false,
    fixedExpenses: structuredClone(SEED_FIXED),
    pasivos: structuredClone(SEED_PASIVOS),
    budgets: structuredClone(SEED_BUDGETS),
    accounts: structuredClone(SEED_ACCOUNTS),
    manualIncomes: structuredClone(SEED_MANUAL_INCOMES),
    incomeEntries: [],
    incomesProjected: false,
    overview: null,
    liabilityStats: derivePasivoStats(SEED_PASIVOS),
    budgetStats: deriveBudgetStats(SEED_BUDGETS, SEED_EXPENSES),
    accountStats: deriveAccountStats(SEED_ACCOUNTS),
    apiContext: { hydrated: false },
    hydrating: false,
    error: null,
  }
}

export const useFinanzasStore = create(
  persist(
    (set, get) => ({
      ...initialState(),

      hydrateFromApi: async ({ force = false } = {}) => {
        if (!isOnline()) return get().expenses
        if (financeHydrationPromise) return financeHydrationPromise
        if (get().apiContext.hydrated && !force) return get().expenses

        set({ hydrating: true, error: null })
        financeHydrationPromise = (async () => {
          try {
            const [
              overviewResponse,
              expenseResponse,
              fixedResponse,
              liabilityResponse,
              liabilityStatsResponse,
              budgetResponse,
              budgetStatsResponse,
              accountResponse,
              accountStatsResponse,
              incomeResponse,
            ] = await Promise.all([
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
            const expenses = (expenseResponse.items || []).map(mapFinanceExpenseFromApi)
            const fixedExpenses = (fixedResponse.items || []).map(mapFinanceFixedExpenseFromApi)
            const pasivos = (liabilityResponse.items || []).map(mapFinanceLiabilityFromApi)
            const budgets = (budgetResponse.items || []).map(mapFinanceBudgetFromApi)
            const accounts = (accountResponse.items || []).map(mapFinanceAccountFromApi)
            const incomeEntries = (incomeResponse.items || []).map(mapFinanceIncomeFromApi)
            set({
              expenses,
              expensesProjected: true,
              fixedExpenses,
              pasivos,
              budgets,
              accounts,
              manualIncomes: incomeEntries.filter((item) => item.editable),
              incomeEntries,
              incomesProjected: true,
              overview: mapFinanceOverviewFromApi(overviewResponse),
              liabilityStats: {
                deudaTotal: Number(liabilityStatsResponse.totalDebt) || 0,
                tarjetas: liabilityStatsResponse.cards,
                prestamos: liabilityStatsResponse.loans,
              },
              budgetStats: {
                totalBudget: Number(budgetStatsResponse.totalBudget) || 0,
                spent: Number(budgetStatsResponse.spent) || 0,
                remaining: Number(budgetStatsResponse.remaining) || 0,
                overBudget: budgetStatsResponse.overBudget,
              },
              accountStats: {
                total: Number(accountStatsResponse.total) || 0,
                banco: Number(accountStatsResponse.bank) || 0,
                inversion: Number(accountStatsResponse.investment) || 0,
                accionistas: Number(accountStatsResponse.shareholders) || 0,
              },
              apiContext: { hydrated: true },
              hydrating: false,
              error: null,
            })
            return expenses
          } catch (error) {
            set({
              hydrating: false,
              error: error.message || 'No se pudo cargar el módulo de Finanzas.',
            })
            throw error
          } finally {
            financeHydrationPromise = null
          }
        })()
        return financeHydrationPromise
      },

      addExpense: async (data) => {
        if (!isOnline()) {
          const expense = {
            id: genId('exp'),
            ...expenseToApiPayload({ ...data, date: data.date || dayKey() }),
            source: 'finanzas',
            editable: true,
          }
          set((state) => ({ expenses: [expense, ...state.expenses] }))
          return expense
        }
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const expense = mapFinanceExpenseFromApi(
          await financeApi.createExpense(expenseToApiPayload(data))
        )
        await get().hydrateFromApi({ force: true })
        return expense
      },

      updateExpense: async (id, data) => {
        if (!isOnline()) {
          set((state) => ({
            expenses: state.expenses.map((item) => item.id === id
              ? { ...item, ...data, amount: Number(data.amount ?? item.amount) || 0 }
              : item),
          }))
          return get().expenses.find((item) => item.id === id)
        }
        const current = get().expenses.find((item) => item.id === id)
        if (!current?.editable || !current.version) throw new Error('Este movimiento viene de Caja y no se edita aquí.')
        const expense = mapFinanceExpenseFromApi(await financeApi.updateExpense(id, {
          version: current.version,
          ...expenseToApiPayload({ ...current, ...data }),
        }))
        set((state) => ({ expenses: replaceById(state.expenses, expense) }))
        await get().hydrateFromApi({ force: true })
        return expense
      },

      deleteExpense: async (id) => {
        const current = get().expenses.find((item) => item.id === id)
        if (isOnline()) {
          if (!current?.editable || !current.version) throw new Error('Este movimiento se administra desde Caja.')
          await financeApi.deleteExpense(id, current.version)
          await get().hydrateFromApi({ force: true })
        } else {
          set((state) => ({ expenses: state.expenses.filter((item) => item.id !== id) }))
        }
      },

      addFixed: async (data) => {
        if (!isOnline()) {
          const expense = {
            id: genId('fix'),
            ...fixedExpenseToApiPayload(data),
            paidMonths: [],
          }
          set((state) => ({ fixedExpenses: [expense, ...state.fixedExpenses] }))
          return expense
        }
        const expense = mapFinanceFixedExpenseFromApi(
          await financeApi.createFixedExpense(fixedExpenseToApiPayload(data))
        )
        set((state) => ({ fixedExpenses: [expense, ...state.fixedExpenses] }))
        await get().hydrateFromApi({ force: true })
        return expense
      },

      updateFixed: async (id, data) => {
        if (!isOnline()) {
          set((state) => ({
            fixedExpenses: state.fixedExpenses.map((item) => item.id === id
              ? { ...item, ...data, amount: Number(data.amount ?? item.amount) || 0 }
              : item),
          }))
          return get().fixedExpenses.find((item) => item.id === id)
        }
        const current = get().fixedExpenses.find((item) => item.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar el gasto fijo antes de editarlo.')
        const expense = mapFinanceFixedExpenseFromApi(await financeApi.updateFixedExpense(id, {
          version: current.version,
          ...fixedExpenseToApiPayload({ ...current, ...data }),
        }))
        set((state) => ({ fixedExpenses: replaceById(state.fixedExpenses, expense) }))
        await get().hydrateFromApi({ force: true })
        return expense
      },

      deleteFixed: async (id) => {
        const current = get().fixedExpenses.find((item) => item.id === id)
        if (isOnline()) {
          if (!current?.version) throw new Error('Vuelve a cargar el gasto fijo antes de eliminarlo.')
          await financeApi.deleteFixedExpense(id, current.version)
          await get().hydrateFromApi({ force: true })
        } else {
          set((state) => ({ fixedExpenses: state.fixedExpenses.filter((item) => item.id !== id) }))
        }
      },

      payFixed: async (id) => {
        if (!isOnline()) {
          const period = monthKey()
          set((state) => ({
            fixedExpenses: state.fixedExpenses.map((item) =>
              item.id === id && !item.paidMonths?.includes(period)
                ? { ...item, paidMonths: [...(item.paidMonths || []), period] }
                : item),
          }))
          return get().fixedExpenses.find((item) => item.id === id)
        }
        const expense = mapFinanceFixedExpenseFromApi(await financeApi.payFixedExpense(id))
        set((state) => ({ fixedExpenses: replaceById(state.fixedExpenses, expense) }))
        await get().hydrateFromApi({ force: true })
        return expense
      },

      isFixedPaidThisMonth: (fixed) => (fixed.paidMonths || []).includes(monthKey()),

      addPasivo: async (data) => {
        if (!isOnline()) {
          const pasivo = { id: genId('pas'), ...liabilityToApiPayload(data) }
          set((state) => ({ pasivos: [pasivo, ...state.pasivos] }))
          return pasivo
        }
        const pasivo = mapFinanceLiabilityFromApi(
          await financeApi.createLiability(liabilityToApiPayload(data))
        )
        set((state) => ({ pasivos: [pasivo, ...state.pasivos] }))
        await get().hydrateFromApi({ force: true })
        return pasivo
      },

      updatePasivo: async (id, data) => {
        if (!isOnline()) {
          set((state) => ({
            pasivos: state.pasivos.map((item) => item.id === id ? { ...item, ...data } : item),
          }))
          return get().pasivos.find((item) => item.id === id)
        }
        const current = get().pasivos.find((item) => item.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar el pasivo antes de editarlo.')
        const pasivo = mapFinanceLiabilityFromApi(await financeApi.updateLiability(id, {
          version: current.version,
          ...liabilityToApiPayload({ ...current, ...data }),
        }))
        set((state) => ({ pasivos: replaceById(state.pasivos, pasivo) }))
        await get().hydrateFromApi({ force: true })
        return pasivo
      },

      deletePasivo: async (id) => {
        const current = get().pasivos.find((item) => item.id === id)
        if (isOnline()) {
          if (!current?.version) throw new Error('Vuelve a cargar el pasivo antes de eliminarlo.')
          await financeApi.deleteLiability(id, current.version)
          await get().hydrateFromApi({ force: true })
        } else {
          set((state) => ({ pasivos: state.pasivos.filter((item) => item.id !== id) }))
        }
      },

      addBudget: async (data) => {
        if (!isOnline()) {
          const budget = { id: genId('bud'), ...budgetToApiPayload(data) }
          set((state) => ({ budgets: [budget, ...state.budgets] }))
          return budget
        }
        const budget = mapFinanceBudgetFromApi(
          await financeApi.createBudget(budgetToApiPayload(data))
        )
        set((state) => ({ budgets: [budget, ...state.budgets] }))
        await get().hydrateFromApi({ force: true })
        return budget
      },

      updateBudget: async (id, data) => {
        if (!isOnline()) {
          set((state) => ({
            budgets: state.budgets.map((item) => item.id === id
              ? { ...item, ...data, monthlyLimit: Number(data.monthlyLimit ?? item.monthlyLimit) || 0 }
              : item),
          }))
          return get().budgets.find((item) => item.id === id)
        }
        const current = get().budgets.find((item) => item.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar el presupuesto antes de editarlo.')
        const budget = mapFinanceBudgetFromApi(await financeApi.updateBudget(id, {
          version: current.version,
          ...budgetToApiPayload({ ...current, ...data }),
        }))
        set((state) => ({ budgets: replaceById(state.budgets, budget) }))
        await get().hydrateFromApi({ force: true })
        return budget
      },

      deleteBudget: async (id) => {
        const current = get().budgets.find((item) => item.id === id)
        if (isOnline()) {
          if (!current?.version) throw new Error('Vuelve a cargar el presupuesto antes de eliminarlo.')
          await financeApi.deleteBudget(id, current.version)
          await get().hydrateFromApi({ force: true })
        } else {
          set((state) => ({ budgets: state.budgets.filter((item) => item.id !== id) }))
        }
      },

      addAccount: async (data) => {
        if (!isOnline()) {
          const account = { id: genId('acc'), ...accountToApiPayload(data) }
          set((state) => ({ accounts: [account, ...state.accounts] }))
          return account
        }
        const account = mapFinanceAccountFromApi(
          await financeApi.createAccount(accountToApiPayload(data))
        )
        set((state) => ({ accounts: [account, ...state.accounts] }))
        await get().hydrateFromApi({ force: true })
        return account
      },

      updateAccount: async (id, data) => {
        if (!isOnline()) {
          set((state) => ({
            accounts: state.accounts.map((item) => item.id === id
              ? { ...item, ...data, balance: Number(data.balance ?? item.balance) || 0 }
              : item),
          }))
          return get().accounts.find((item) => item.id === id)
        }
        const current = get().accounts.find((item) => item.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar la cuenta antes de editarla.')
        const account = mapFinanceAccountFromApi(await financeApi.updateAccount(id, {
          version: current.version,
          ...accountToApiPayload({ ...current, ...data }),
        }))
        set((state) => ({ accounts: replaceById(state.accounts, account) }))
        await get().hydrateFromApi({ force: true })
        return account
      },

      deleteAccount: async (id) => {
        const current = get().accounts.find((item) => item.id === id)
        if (isOnline()) {
          if (!current?.version) throw new Error('Vuelve a cargar la cuenta antes de eliminarla.')
          await financeApi.deleteAccount(id, current.version)
          await get().hydrateFromApi({ force: true })
        } else {
          set((state) => ({ accounts: state.accounts.filter((item) => item.id !== id) }))
        }
      },

      addManualIncome: async (data) => {
        if (!isOnline()) {
          const income = {
            id: genId('inc'),
            ...manualIncomeToApiPayload({ ...data, date: data.date || dayKey() }),
            editable: true,
          }
          set((state) => ({ manualIncomes: [income, ...state.manualIncomes] }))
          return income
        }
        const income = mapFinanceIncomeFromApi(
          await financeApi.createManualIncome(manualIncomeToApiPayload(data))
        )
        await get().hydrateFromApi({ force: true })
        return income
      },

      updateManualIncome: async (id, data) => {
        if (!isOnline()) {
          set((state) => ({
            manualIncomes: state.manualIncomes.map((item) => item.id === id
              ? { ...item, ...data, amount: Number(data.amount ?? item.amount) || 0 }
              : item),
          }))
          return get().manualIncomes.find((item) => item.id === id)
        }
        const current = get().manualIncomes.find((item) => item.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar el ingreso antes de editarlo.')
        const income = mapFinanceIncomeFromApi(await financeApi.updateManualIncome(id, {
          version: current.version,
          ...manualIncomeToApiPayload({ ...current, ...data }),
        }))
        await get().hydrateFromApi({ force: true })
        return income
      },

      deleteManualIncome: async (id) => {
        const current = get().manualIncomes.find((item) => item.id === id)
        if (isOnline()) {
          if (!current?.version) throw new Error('Vuelve a cargar el ingreso antes de eliminarlo.')
          await financeApi.deleteManualIncome(id, current.version)
          await get().hydrateFromApi({ force: true })
        } else {
          set((state) => ({ manualIncomes: state.manualIncomes.filter((item) => item.id !== id) }))
        }
      },

      getOverviewStats: (sales = []) => {
        const { overview, expenses, fixedExpenses, pasivos, manualIncomes } = get()
        if (overview) {
          return {
            ingresosMes: overview.incomes,
            gastosMes: overview.expenses,
            balance: overview.balance,
            alertas: overview.alerts,
            grossProfitEstimate: overview.grossProfitEstimate,
            netMarginPercent: overview.netMarginPercent,
          }
        }
        const salesTotal = sales
          .filter((sale) => isThisMonth(sale.createdAt))
          .reduce((sum, sale) => sum + (sale.total || 0), 0)
        const incomeTotal = salesTotal + sumInMonth(manualIncomes, 'date')
        const expenseTotal = sumInMonth(expenses, 'date')
          + fixedExpenses.reduce((sum, expense) => sum + expense.amount, 0)
        return {
          ingresosMes: incomeTotal,
          gastosMes: expenseTotal,
          balance: incomeTotal - expenseTotal,
          alertas: pasivos.some((item) => item.pendingAmount > 0) ? 1 : 0,
          grossProfitEstimate: incomeTotal * 0.7,
          netMarginPercent: incomeTotal > 0 ? ((incomeTotal - expenseTotal) / incomeTotal) * 100 : 0,
        }
      },

      getIncomeTrend: (sales = [], months = 6) => {
        if (get().overview?.trend?.length) {
          return get().overview.trend.map((point) => ({ label: point.label, value: point.value }))
        }
        const points = []
        for (let offset = months - 1; offset >= 0; offset -= 1) {
          const date = new Date()
          date.setMonth(date.getMonth() - offset)
          const month = date.getMonth()
          const year = date.getFullYear()
          const label = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][month]
          const matchesMonth = (value) => {
            const parsed = new Date(value)
            return parsed.getMonth() === month && parsed.getFullYear() === year
          }
          const salesTotal = sales
            .filter((sale) => matchesMonth(sale.createdAt))
            .reduce((sum, sale) => sum + (sale.total || 0), 0)
          const manualTotal = get().manualIncomes
            .filter((income) => matchesMonth(income.date))
            .reduce((sum, income) => sum + income.amount, 0)
          points.push({ label, value: salesTotal + manualTotal })
        }
        return points
      },

      getPasivoStats: () => get().liabilityStats || derivePasivoStats(get().pasivos),
      getBudgetStats: (branchId = null) => branchId
        ? deriveBudgetStats(get().budgets, get().expenses, branchId)
        : get().budgetStats || deriveBudgetStats(get().budgets, get().expenses),
      getAccountStats: () => get().accountStats || deriveAccountStats(get().accounts),

      clearSensitive: () => set(initialState()),
    }),
    {
      name: 'diedo-finanzas',
      storage: ephemeralJsonStorage,
      partialize: (state) => ({
        expenses: state.expenses,
        fixedExpenses: state.fixedExpenses,
        pasivos: state.pasivos,
        budgets: state.budgets,
        accounts: state.accounts,
        manualIncomes: state.manualIncomes,
        apiContext: { hydrated: false },
      }),
    }
  )
)

registerSensitiveStateCleaner(() => useFinanzasStore.getState().clearSensitive())
