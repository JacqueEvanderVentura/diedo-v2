import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CUSTOMERS } from '@/data/customers'
import { useCatalogStore } from '@/stores/catalogStore'

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

// Historial de ventas mock (para CRM Ventas + ficha de cliente). No afecta la caja del turno.
const SEED_SALES = [
  { id: 'sale-h1', total: 900, method: 'efectivo', customer: { id: 'c1', name: 'María Fernández' }, reference: null, items: [{ name: '1 sesión axilas', qty: 1, price: 900 }], createdAt: daysAgo(1) },
  { id: 'sale-h2', total: 5000, method: 'tarjeta', customer: { id: 'c3', name: 'Ana Cristina Vargas' }, reference: 'APR-2231', items: [{ name: 'Paq. 12 sesiones Rostro completo', qty: 1, price: 5000 }], createdAt: daysAgo(2) },
  { id: 'sale-h3', total: 1780, method: 'efectivo', customer: { id: 'c5', name: 'Carla Jiménez' }, reference: null, items: [{ name: 'Red Bull', qty: 2, price: 180 }, { name: '1 sesión axilas', qty: 1, price: 900 }, { name: '1 Sesión rostro', qty: 1, price: 700 }], createdAt: daysAgo(3) },
  { id: 'sale-h4', total: 12000, method: 'link', customer: { id: 'c2', name: 'José Ramírez' }, reference: 'LNK-3391', items: [{ name: '50% Paquete de 2 Cuerpos Completos', qty: 1, price: 12000 }], createdAt: daysAgo(4) },
  { id: 'sale-h5', total: 1200, method: 'tarjeta', customer: { id: 'c4', name: 'Luis Alberto Peña' }, reference: 'APR-9910', items: [{ name: '1 sesión piernas completas', qty: 1, price: 1200 }], createdAt: daysAgo(5) },
  { id: 'sale-h6', total: 2500, method: 'efectivo', customer: { id: 'c3', name: 'Ana Cristina Vargas' }, reference: null, items: [{ name: 'Facial hidratante', qty: 1, price: 2500 }], createdAt: daysAgo(6) },
  { id: 'sale-h7', total: 900, method: 'efectivo', customer: { id: 'c1', name: 'María Fernández' }, reference: null, items: [{ name: '1 sesión axilas', qty: 1, price: 900 }], createdAt: daysAgo(9) },
]

// POS store — cart + caja (register) + expenses + receivables (CxC) + customers. Persisted.
export const usePosStore = create(
  persist(
    (set, get) => ({
      // ---- cart ----
      branchId: 'charm-dn',
      items: [],
      customer: DEFAULT_CUSTOMER,
      customers: CUSTOMERS,
      discountMode: 'pct', // 'pct' | 'amount'
      discountValue: 0,
      taxPct: 18,
      paymentMethod: 'efectivo',
      transferProof: null,
      paymentReference: '',
      cartDrawerOpen: false,

      // ---- caja (register) ----
      register: { open: true, openedAt: now(), openingCash: 2000, closedAt: null },
      cashSales: 0,
      expenses: [],
      sales: SEED_SALES,
      receivables: SEED_RECEIVABLES,
      lastCloseSummary: null,

      // ---- cart actions ----
      setBranch: (branchId) => set({ branchId }),
      setCustomer: (customer) => set({ customer }),
      addCustomer: (customer) => set((s) => ({ customers: [customer, ...s.customers], customer })),
      updateCustomer: (id, data) =>
        set((s) => ({
          customers: s.customers.map((c) => (c.id === id ? { ...c, ...data } : c)),
          customer: s.customer?.id === id ? { ...s.customer, ...data } : s.customer,
        })),
      setDiscountMode: (discountMode) => set({ discountMode }),
      setDiscountValue: (v) => set({ discountValue: Math.max(0, Number(v) || 0) }),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod, transferProof: paymentMethod === 'transferencia' ? get().transferProof : null }),
      setTransferProof: (transferProof) => set({ transferProof }),
      setPaymentReference: (paymentReference) => set({ paymentReference }),
      openCartDrawer: () => set({ cartDrawerOpen: true }),
      closeCartDrawer: () => set({ cartDrawerOpen: false }),

      addItem: (product) =>
        set((state) => {
          const cat = useCatalogStore.getState().products.find((p) => p.id === product.id)
          const cap = cat && cat.type === 'product' && cat.stock !== null ? cat.stock : Infinity
          const existing = state.items.find((i) => i.id === product.id)
          const currentQty = existing ? existing.qty : 0
          if (currentQty >= cap) return {} // at stock ceiling
          if (existing) {
            return { items: state.items.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i)) }
          }
          return { items: [...state.items, { id: product.id, name: product.name, price: product.price, sku: product.sku, qty: 1 }] }
        }),
      incItem: (id) =>
        set((state) => {
          const item = state.items.find((i) => i.id === id)
          if (!item) return {}
          const cat = useCatalogStore.getState().products.find((p) => p.id === id)
          const cap = cat && cat.type === 'product' && cat.stock !== null ? cat.stock : Infinity
          if (item.qty >= cap) return {}
          return { items: state.items.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i)) }
        }),
      decItem: (id) => set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0) })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      clearCart: () => set({ items: [], discountMode: 'pct', discountValue: 0, customer: DEFAULT_CUSTOMER, transferProof: null, paymentReference: '' }),

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
      getDiscountAmount: () => {
        const sub = get().getSubtotal()
        if (get().discountMode === 'amount') return Math.min(sub, Math.max(0, get().discountValue))
        const pct = Math.min(100, Math.max(0, get().discountValue))
        return (sub * pct) / 100
      },
      getDiscountPct: () => {
        const sub = get().getSubtotal()
        if (get().discountMode === 'amount') return sub > 0 ? Math.min(100, (Math.min(sub, get().discountValue) / sub) * 100) : 0
        return Math.min(100, Math.max(0, get().discountValue))
      },
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
      version: 2,
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        if (!Array.isArray(state.sales) || state.sales.length === 0) state.sales = SEED_SALES
        return state
      },
      partialize: (s) => ({
        branchId: s.branchId,
        items: s.items,
        customer: s.customer,
        customers: s.customers,
        discountMode: s.discountMode,
        discountValue: s.discountValue,
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
