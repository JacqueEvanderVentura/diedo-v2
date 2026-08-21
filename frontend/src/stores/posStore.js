import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CUSTOMERS } from '@/data/customers'

const DEFAULT_CUSTOMER = CUSTOMERS[0]
const now = () => new Date().toISOString()
const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

// Payment methods that DON'T settle immediately -> generate an account receivable (CxC).
export const RECEIVABLE_METHODS = ['transferencia', 'link', 'cxc']

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

const SEED_RECEIVABLES = [
  { id: 'cxc-seed-1', saleId: 'sale-seed-1', customer: { id: 'c1', name: 'María Fernández' }, amount: 5500, method: 'transferencia', reference: 'TRF-8842', status: 'pending', createdAt: daysAgo(1), items: [{ name: 'Paq. 12 sesiones Brasileño (íntimo)', qty: 1, price: 5500 }] },
  { id: 'cxc-seed-2', saleId: 'sale-seed-2', customer: { id: 'c2', name: 'José Ramírez' }, amount: 12000, method: 'link', reference: 'LNK-3391', status: 'pending', createdAt: daysAgo(0), items: [{ name: '50% Paquete de 2 Cuerpos Completos', qty: 1, price: 12000 }] },
  { id: 'cxc-seed-3', saleId: 'sale-seed-3', customer: { id: 'c3', name: 'Ana Cristina Vargas' }, amount: 700, method: 'cxc', reference: 'CXC-0007', status: 'paid', createdAt: daysAgo(2), paidAt: daysAgo(1), paidMethod: 'efectivo', items: [{ name: '1 Sesión rostro', qty: 1, price: 700 }] },
]

// POS store — cart + caja (register) + expenses + receivables (CxC). Persisted.
export const usePosStore = create(
  persist(
    (set, get) => ({
      // ---- cart ----
      branchId: 'charm-dn',
      items: [],
      customer: DEFAULT_CUSTOMER,
      discountPct: 0,
      taxPct: 18,
      paymentMethod: 'efectivo',
      transferProof: null,
      paymentReference: '',
      cartDrawerOpen: false,

      // ---- caja (register) ----
      register: { open: true, openedAt: now(), openingCash: 2000, closedAt: null },
      cashSales: 0,
      expenses: [], // { id, concept, amount, createdAt }
      sales: [],
      receivables: SEED_RECEIVABLES,
      lastCloseSummary: null,

      // ---- cart actions ----
      setBranch: (branchId) => set({ branchId }),
      setCustomer: (customer) => set({ customer }),
      setDiscountPct: (discountPct) => set({ discountPct: Math.max(0, Math.min(100, Number(discountPct) || 0)) }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod, transferProof: paymentMethod === 'transferencia' ? get().transferProof : null }),
      setTransferProof: (transferProof) => set({ transferProof }),
      setPaymentReference: (paymentReference) => set({ paymentReference }),
      openCartDrawer: () => set({ cartDrawerOpen: true }),
      closeCartDrawer: () => set({ cartDrawerOpen: false }),

      addItem: (product) =>
        set((state) => {
          const existing = state.items.find((i) => i.id === product.id)
          if (existing) {
            return { items: state.items.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i)) }
          }
          return { items: [...state.items, { id: product.id, name: product.name, price: product.price, sku: product.sku, qty: 1 }] }
        }),
      incItem: (id) => set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i)) })),
      decItem: (id) => set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0) })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      clearCart: () => set({ items: [], discountPct: 0, customer: DEFAULT_CUSTOMER, transferProof: null, paymentReference: '' }),

      // ---- caja actions ----
      openRegister: (openingCash) =>
        set({ register: { open: true, openedAt: now(), openingCash: Number(openingCash) || 0, closedAt: null }, cashSales: 0, expenses: [], lastCloseSummary: null }),
      closeRegister: () =>
        set((s) => {
          const cashExpenses = s.expenses.reduce((a, e) => a + e.amount, 0)
          const expected = s.register.openingCash + s.cashSales - cashExpenses
          return {
            register: { ...s.register, open: false, closedAt: now() },
            lastCloseSummary: { openingCash: s.register.openingCash, cashSales: s.cashSales, expenses: cashExpenses, expected, closedAt: now() },
          }
        }),
      addExpense: ({ concept, amount }) =>
        set((s) => ({ expenses: [{ id: genId('exp'), concept, amount: Number(amount) || 0, createdAt: now() }, ...s.expenses] })),

      // Records a sale; efectivo increases cash, receivable methods create a pending CxC.
      recordSale: ({ total, method, customer, reference, items }) => {
        const id = genId('sale')
        set((s) => {
          const patch = { sales: [{ id, total, method, customer, reference: reference || null, items, createdAt: now() }, ...s.sales] }
          if (method === 'efectivo') patch.cashSales = s.cashSales + total
          if (RECEIVABLE_METHODS.includes(method)) {
            patch.receivables = [
              { id: genId('cxc'), saleId: id, customer, amount: total, method, reference: reference || null, status: 'pending', createdAt: now(), items },
              ...s.receivables,
            ]
          }
          return patch
        })
        return id
      },

      markReceivablePaid: (id, method = 'efectivo') =>
        set((s) => {
          const r = s.receivables.find((x) => x.id === id)
          if (!r || r.status === 'paid') return {}
          const patch = {
            receivables: s.receivables.map((x) => (x.id === id ? { ...x, status: 'paid', paidAt: now(), paidMethod: method } : x)),
          }
          if (method === 'efectivo') patch.cashSales = s.cashSales + r.amount
          return patch
        }),

      // ---- selectors ----
      getSubtotal: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),
      getDiscountAmount: () => (get().getSubtotal() * get().discountPct) / 100,
      getTaxAmount: () => {
        const base = get().getSubtotal() - get().getDiscountAmount()
        return (base * get().taxPct) / 100
      },
      getTotal: () => {
        const base = get().getSubtotal() - get().getDiscountAmount()
        return base + (base * get().taxPct) / 100
      },
      getItemCount: () => get().items.reduce((sum, i) => sum + i.qty, 0),
      getCashExpenses: () => get().expenses.reduce((a, e) => a + e.amount, 0),
      getCashInDrawer: () => get().register.openingCash + get().cashSales - get().getCashExpenses(),
      getPendingReceivables: () => get().receivables.filter((r) => r.status === 'pending'),
      getPendingTotal: () => get().receivables.filter((r) => r.status === 'pending').reduce((a, r) => a + r.amount, 0),
    }),
    {
      name: 'diedo-pos',
      partialize: (s) => ({
        branchId: s.branchId,
        items: s.items,
        customer: s.customer,
        discountPct: s.discountPct,
        paymentMethod: s.paymentMethod,
        register: s.register,
        cashSales: s.cashSales,
        expenses: s.expenses,
        sales: s.sales,
        receivables: s.receivables,
        lastCloseSummary: s.lastCloseSummary,
      }),
    }
  )
)
