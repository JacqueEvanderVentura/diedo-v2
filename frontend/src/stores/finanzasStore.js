import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'
import { isThisMonth } from '@/modules/finanzas/lib/finanzas'

const genId = (p = 'fin') => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const dayKey = (n = 0) => {
  const d = new Date(Date.now() - n * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const monthKey = (offset = 0) => {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

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

export const catName = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.name || id

const SEED_EXPENSES = [
  { id: 'exp-s1', concept: 'Compra de guantes de nitrilo', amount: 1200, category: 'insumos', date: dayKey(2), branchId: 'charm-dn', status: 'pagado', budgetId: null },
  { id: 'exp-s2', concept: 'Publicidad Instagram Ads', amount: 3000, category: 'marketing', date: dayKey(5), branchId: 'charm-dn', status: 'pagado', budgetId: 'bud-marketing' },
  { id: 'exp-s3', concept: 'Mantenimiento equipo láser', amount: 1800, category: 'mantenimiento', date: dayKey(8), branchId: 'charm-santiago', status: 'pagado', budgetId: null },
  { id: 'exp-s4', concept: 'Compra de cera y consumibles', amount: 950, category: 'insumos', date: dayKey(12), branchId: 'charm-dn', status: 'pagado', budgetId: 'bud-operaciones' },
  { id: 'exp-s5', concept: 'Factura de agua', amount: 700, category: 'servicios', date: dayKey(15), branchId: 'charm-este', status: 'pendiente', budgetId: null },
]

const SEED_FIXED = [
  { id: 'fix-s1', concept: 'Alquiler del local', amount: 35000, category: 'alquiler', branchId: 'charm-dn', dayOfMonth: 1, paidMonths: [] },
  { id: 'fix-s2', concept: 'Internet + teléfono', amount: 2500, category: 'servicios', branchId: 'charm-dn', dayOfMonth: 5, paidMonths: [monthKey(0)] },
  { id: 'fix-s3', concept: 'Nómina del equipo', amount: 60000, category: 'nomina', branchId: 'charm-dn', dayOfMonth: 15, paidMonths: [] },
  { id: 'fix-s4', concept: 'Energía eléctrica (estimado)', amount: 9000, category: 'servicios', branchId: 'charm-santiago', dayOfMonth: 10, paidMonths: [] },
]

const SEED_PASIVOS = [
  { id: 'pas-s1', name: 'Préstamo BHD Local', type: 'prestamo', initialAmount: 850000, pendingAmount: 620000, branchId: 'charm-dn', payDay: 5, cutDay: null, installment: 28000, paidInstallments: 8, totalInstallments: 31, categoryIds: ['alquiler'] },
  { id: 'pas-s2', name: 'Tarjeta Popular', type: 'tarjeta', initialAmount: 150000, pendingAmount: 89000, branchId: 'charm-dn', payDay: 20, cutDay: 15, installment: null, paidInstallments: null, totalInstallments: null, categoryIds: ['insumos', 'marketing'] },
  { id: 'pas-s3', name: 'Préstamo equipos', type: 'prestamo', initialAmount: 420000, pendingAmount: 310000, branchId: 'charm-santiago', payDay: 12, cutDay: null, installment: 18500, paidInstallments: 6, totalInstallments: 24, categoryIds: ['mantenimiento'] },
]

const SEED_BUDGETS = [
  { id: 'bud-marketing', name: 'Marketing', group: 'marketing', monthlyLimit: 15000, branchId: 'charm-dn' },
  { id: 'bud-operaciones', name: 'Operaciones', group: 'operaciones', monthlyLimit: 25000, branchId: 'charm-dn' },
  { id: 'bud-rh', name: 'RH & Nómina', group: 'rh', monthlyLimit: 80000, branchId: 'charm-dn' },
  { id: 'bud-it', name: 'IT & Infraestructura', group: 'it', monthlyLimit: 12000, branchId: 'charm-dn' },
]

const SEED_ACCOUNTS = [
  { id: 'acc-s1', name: 'Corriente Operativa', type: 'banco', bank: 'BHD', accountNumber: '****4521', balance: 185000, currency: 'DOP', branchId: 'charm-dn', notes: '' },
  { id: 'acc-s2', name: 'Fondo de Inversión', type: 'inversion', bank: 'Popular', accountNumber: '****8890', balance: 420000, currency: 'DOP', branchId: 'charm-dn', notes: 'Reserva estratégica' },
]

const SEED_MANUAL_INCOMES = [
  { id: 'inc-s1', category: 'servicios', branchId: 'charm-dn', amount: 4500, date: dayKey(1), customer: 'Cliente corporativo', source: 'Formulario', status: 'pagado' },
]

function sumInMonth(items, dateKey, amountKey = 'amount') {
  return items.filter((i) => isThisMonth(i[dateKey])).reduce((a, i) => a + (Number(i[amountKey]) || 0), 0)
}

export const useFinanzasStore = create(
  persist(
    (set, get) => ({
      expenses: SEED_EXPENSES,
      fixedExpenses: SEED_FIXED,
      pasivos: SEED_PASIVOS,
      budgets: SEED_BUDGETS,
      accounts: SEED_ACCOUNTS,
      manualIncomes: SEED_MANUAL_INCOMES,

      // --- Variable expenses ---
      addExpense: (data) =>
        set((s) => ({
          expenses: [
            {
              id: genId('exp'),
              concept: data.concept,
              amount: Number(data.amount) || 0,
              category: data.category || 'otros',
              date: data.date || dayKey(0),
              branchId: data.branchId || 'charm-dn',
              status: data.status || 'pagado',
              budgetId: data.budgetId || null,
            },
            ...s.expenses,
          ],
        })),
      updateExpense: (id, data) =>
        set((s) => ({
          expenses: s.expenses.map((e) =>
            e.id === id
              ? {
                  ...e,
                  ...data,
                  amount: data.amount === undefined ? e.amount : Number(data.amount) || 0,
                  budgetId: data.budgetId === undefined ? e.budgetId : data.budgetId || null,
                }
              : e
          ),
        })),
      deleteExpense: (id) => set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),

      // --- Fixed expenses ---
      addFixed: (data) =>
        set((s) => ({
          fixedExpenses: [
            {
              id: genId('fix'),
              concept: data.concept,
              amount: Number(data.amount) || 0,
              category: data.category || 'otros',
              branchId: data.branchId || 'charm-dn',
              dayOfMonth: Number(data.dayOfMonth) || 1,
              paidMonths: [],
            },
            ...s.fixedExpenses,
          ],
        })),
      updateFixed: (id, data) =>
        set((s) => ({
          fixedExpenses: s.fixedExpenses.map((e) =>
            e.id === id
              ? {
                  ...e,
                  ...data,
                  amount: data.amount === undefined ? e.amount : Number(data.amount) || 0,
                  dayOfMonth: data.dayOfMonth === undefined ? e.dayOfMonth : Number(data.dayOfMonth) || 1,
                }
              : e
          ),
        })),
      deleteFixed: (id) => set((s) => ({ fixedExpenses: s.fixedExpenses.filter((e) => e.id !== id) })),
      payFixed: (id) => {
        const mk = monthKey(0)
        set((s) => ({
          fixedExpenses: s.fixedExpenses.map((e) =>
            e.id === id && !e.paidMonths?.includes(mk) ? { ...e, paidMonths: [...(e.paidMonths || []), mk] } : e
          ),
        }))
      },
      isFixedPaidThisMonth: (fixed) => (fixed.paidMonths || []).includes(monthKey(0)),

      // --- Pasivos ---
      addPasivo: (data) =>
        set((s) => ({
          pasivos: [
            {
              id: genId('pas'),
              name: data.name,
              type: data.type || 'prestamo',
              initialAmount: Number(data.initialAmount) || 0,
              pendingAmount: Number(data.pendingAmount ?? data.initialAmount) || 0,
              branchId: data.branchId || 'charm-dn',
              payDay: Number(data.payDay) || 1,
              cutDay: data.cutDay ? Number(data.cutDay) : null,
              installment: data.installment ? Number(data.installment) : null,
              paidInstallments: data.paidInstallments ? Number(data.paidInstallments) : 0,
              totalInstallments: data.totalInstallments ? Number(data.totalInstallments) : null,
              categoryIds: data.categoryIds || [],
            },
            ...s.pasivos,
          ],
        })),
      updatePasivo: (id, data) =>
        set((s) => ({
          pasivos: s.pasivos.map((p) => (p.id === id ? { ...p, ...data } : p)),
        })),
      deletePasivo: (id) => set((s) => ({ pasivos: s.pasivos.filter((p) => p.id !== id) })),

      // --- Budgets ---
      addBudget: (data) =>
        set((s) => ({
          budgets: [
            { id: genId('bud'), name: data.name, group: data.group || 'operaciones', monthlyLimit: Number(data.monthlyLimit) || 0, branchId: data.branchId || 'charm-dn' },
            ...s.budgets,
          ],
        })),
      updateBudget: (id, data) =>
        set((s) => ({
          budgets: s.budgets.map((b) => (b.id === id ? { ...b, ...data, monthlyLimit: data.monthlyLimit === undefined ? b.monthlyLimit : Number(data.monthlyLimit) || 0 } : b)),
        })),
      deleteBudget: (id) => set((s) => ({ budgets: s.budgets.filter((b) => b.id !== id) })),

      // --- Accounts ---
      addAccount: (data) =>
        set((s) => ({
          accounts: [
            {
              id: genId('acc'),
              name: data.name,
              type: data.type || 'banco',
              bank: data.bank || '',
              accountNumber: data.accountNumber || '',
              balance: Number(data.balance) || 0,
              currency: data.currency || 'DOP',
              branchId: data.branchId || 'charm-dn',
              notes: data.notes || '',
            },
            ...s.accounts,
          ],
        })),
      updateAccount: (id, data) =>
        set((s) => ({
          accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...data, balance: data.balance === undefined ? a.balance : Number(data.balance) || 0 } : a)),
        })),
      deleteAccount: (id) => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) })),

      // --- Manual incomes ---
      addManualIncome: (data) =>
        set((s) => ({
          manualIncomes: [
            {
              id: genId('inc'),
              category: data.category || 'servicios',
              branchId: data.branchId || 'charm-dn',
              amount: Number(data.amount) || 0,
              date: data.date || dayKey(0),
              customer: data.customer || '',
              source: data.source || 'Formulario',
              status: data.status || 'pagado',
            },
            ...s.manualIncomes,
          ],
        })),
      updateManualIncome: (id, data) =>
        set((s) => ({
          manualIncomes: s.manualIncomes.map((i) => (i.id === id ? { ...i, ...data, amount: data.amount === undefined ? i.amount : Number(data.amount) || 0 } : i)),
        })),
      deleteManualIncome: (id) => set((s) => ({ manualIncomes: s.manualIncomes.filter((i) => i.id !== id) })),

      // --- Overview helpers ---
      getOverviewStats: (sales = []) => {
        const { expenses, fixedExpenses, pasivos } = get()
        const ingresosMes = sales.filter((s) => isThisMonth(s.createdAt)).reduce((a, s) => a + (s.total || 0), 0)
        const manualMes = sumInMonth(get().manualIncomes, 'date')
        const gastosVar = sumInMonth(expenses, 'date')
        const gastosFijos = fixedExpenses.reduce((a, e) => a + e.amount, 0)
        const gastosMes = gastosVar + gastosFijos
        const balance = ingresosMes + manualMes - gastosMes
        const alertas = pasivos.filter((p) => p.pendingAmount > 0).length > 0 ? 1 : 0
        return { ingresosMes: ingresosMes + manualMes, gastosMes, balance, alertas }
      },

      getIncomeTrend: (sales = [], months = 6) => {
        const points = []
        const { manualIncomes } = get()
        for (let i = months - 1; i >= 0; i--) {
          const d = new Date()
          d.setMonth(d.getMonth() - i)
          const m = d.getMonth()
          const y = d.getFullYear()
          const label = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m]
          const salesSum = sales
            .filter((s) => {
              const sd = new Date(s.createdAt)
              return sd.getMonth() === m && sd.getFullYear() === y
            })
            .reduce((a, s) => a + (s.total || 0), 0)
          const manualSum = manualIncomes
            .filter((inc) => {
              const id = new Date(inc.date)
              return id.getMonth() === m && id.getFullYear() === y
            })
            .reduce((a, inc) => a + inc.amount, 0)
          points.push({ label, value: salesSum + manualSum })
        }
        return points
      },

      getPasivoStats: () => {
        const { pasivos } = get()
        return {
          deudaTotal: pasivos.reduce((a, p) => a + p.pendingAmount, 0),
          tarjetas: pasivos.filter((p) => p.type === 'tarjeta').length,
          prestamos: pasivos.filter((p) => p.type === 'prestamo').length,
        }
      },

      getBudgetStats: (branchId = null) => {
        const { budgets, expenses } = get()
        const list = branchId ? budgets.filter((b) => b.branchId === branchId) : budgets
        const totalBudget = list.reduce((a, b) => a + b.monthlyLimit, 0)
        const spent = list.reduce((total, b) => {
          const s = expenses
            .filter((e) => e.budgetId === b.id && isThisMonth(e.date))
            .reduce((a, e) => a + (Number(e.amount) || 0), 0)
          return total + s
        }, 0)
        const overBudget = list.filter((b) => {
          const s = expenses
            .filter((e) => e.budgetId === b.id && isThisMonth(e.date))
            .reduce((a, e) => a + (Number(e.amount) || 0), 0)
          return s > b.monthlyLimit
        }).length
        return { totalBudget, spent, remaining: totalBudget - spent, overBudget }
      },

      getAccountStats: () => {
        const { accounts } = get()
        const sum = (type) => accounts.filter((a) => a.type === type).reduce((t, a) => t + a.balance, 0)
        return {
          total: accounts.reduce((a, acc) => a + acc.balance, 0),
          banco: sum('banco'),
          inversion: sum('inversion'),
          accionistas: sum('accionistas'),
        }
      },
    }),
    {
      name: 'diedo-finanzas',
      storage: ephemeralJsonStorage,
      partialize: (s) => ({
        expenses: s.expenses,
        fixedExpenses: s.fixedExpenses,
        pasivos: s.pasivos,
        budgets: s.budgets,
        accounts: s.accounts,
        manualIncomes: s.manualIncomes,
      }),
    }
  )
)
