import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const genId = () => `fin-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const dayKey = (n = 0) => {
  const d = new Date(Date.now() - n * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
export const catName = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.name || id

const SEED_EXPENSES = [
  { id: 'exp-s1', concept: 'Compra de guantes de nitrilo', amount: 1200, category: 'insumos', date: dayKey(2) },
  { id: 'exp-s2', concept: 'Publicidad Instagram Ads', amount: 3000, category: 'marketing', date: dayKey(5) },
  { id: 'exp-s3', concept: 'Mantenimiento equipo láser', amount: 1800, category: 'mantenimiento', date: dayKey(8) },
  { id: 'exp-s4', concept: 'Compra de cera y consumibles', amount: 950, category: 'insumos', date: dayKey(12) },
  { id: 'exp-s5', concept: 'Factura de agua', amount: 700, category: 'servicios', date: dayKey(15) },
]

const SEED_FIXED = [
  { id: 'fix-s1', concept: 'Alquiler del local', amount: 35000, category: 'alquiler' },
  { id: 'fix-s2', concept: 'Internet + teléfono', amount: 2500, category: 'servicios' },
  { id: 'fix-s3', concept: 'Nómina del equipo', amount: 60000, category: 'nomina' },
  { id: 'fix-s4', concept: 'Energía eléctrica (estimado)', amount: 9000, category: 'servicios' },
]

export const useFinanzasStore = create(
  persist(
    (set) => ({
      expenses: SEED_EXPENSES,
      fixedExpenses: SEED_FIXED,

      addExpense: (data) =>
        set((s) => ({
          expenses: [
            { id: genId(), concept: data.concept, amount: Number(data.amount) || 0, category: data.category || 'otros', date: data.date || dayKey(0) },
            ...s.expenses,
          ],
        })),
      updateExpense: (id, data) =>
        set((s) => ({
          expenses: s.expenses.map((e) =>
            e.id === id ? { ...e, ...data, amount: data.amount === undefined ? e.amount : Number(data.amount) || 0 } : e
          ),
        })),
      deleteExpense: (id) => set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id) })),

      addFixed: (data) =>
        set((s) => ({
          fixedExpenses: [
            { id: genId(), concept: data.concept, amount: Number(data.amount) || 0, category: data.category || 'otros' },
            ...s.fixedExpenses,
          ],
        })),
      updateFixed: (id, data) =>
        set((s) => ({
          fixedExpenses: s.fixedExpenses.map((e) =>
            e.id === id ? { ...e, ...data, amount: data.amount === undefined ? e.amount : Number(data.amount) || 0 } : e
          ),
        })),
      deleteFixed: (id) => set((s) => ({ fixedExpenses: s.fixedExpenses.filter((e) => e.id !== id) })),
    }),
    { name: 'diedo-finanzas', partialize: (s) => ({ expenses: s.expenses, fixedExpenses: s.fixedExpenses }) }
  )
)
