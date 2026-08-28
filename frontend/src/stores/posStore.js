import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CUSTOMERS } from '@/data/customers'
import { useCatalogStore } from '@/stores/catalogStore'
import { buildShiftMovements } from '@/modules/pos/lib/caja'
import { getReceivableStatus, normalizeReceivable } from '@/modules/pos/lib/receivables'

const DEFAULT_CUSTOMER = CUSTOMERS[0]
const now = () => new Date().toISOString()
const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

// Payment methods that DON'T settle immediately -> generate an account receivable (CxC).
export const RECEIVABLE_METHODS = ['transferencia', 'link', 'cxc']

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const minsAgo = (n) => new Date(Date.now() - n * 60000).toISOString()

const SEED_SHIFT_SALES = [
  { id: 'shift-s1', total: 3600, method: 'tarjeta', customer: { id: 'c6', name: 'Airenys Mateo Cedano' }, reference: 'APR-4410', items: [{ name: 'Paq. sesiones', qty: 1, price: 3600 }], createdAt: minsAgo(32) },
  { id: 'shift-s2', total: 3600, method: 'tarjeta', customer: { id: 'c7', name: 'Onna Pacheco' }, reference: 'APR-4408', items: [{ name: 'Paq. sesiones', qty: 1, price: 3600 }], createdAt: minsAgo(31) },
  { id: 'shift-s3', total: 3600, method: 'tarjeta', customer: { id: 'c8', name: 'Propina Celimar' }, reference: 'APR-4405', items: [{ name: 'Propina', qty: 1, price: 3600 }], createdAt: minsAgo(27) },
  { id: 'shift-s4', total: 3600, method: 'tarjeta', customer: { id: 'c8', name: 'Propina Celimar' }, reference: 'APR-4402', items: [{ name: 'Propina', qty: 1, price: 3600 }], createdAt: minsAgo(23) },
]

const SEED_SHIFT_EXPENSES = [
  { id: 'exp-shift-1', concept: 'Gift Card', amount: 250, createdAt: minsAgo(7) },
  { id: 'exp-shift-2', concept: 'Propina a Celimar', amount: 200, createdAt: minsAgo(22) },
  { id: 'exp-shift-3', concept: 'Propina a celimar', amount: 200, createdAt: minsAgo(23) },
]

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

const SEED_RECEIVABLES = [
  { id: 'cxc-seed-1', saleId: 'sale-seed-1', customer: { id: 'c1', name: 'María Fernández' }, amount: 5500, method: 'transferencia', reference: 'TRF-8842', status: 'pending', createdAt: daysAgo(1), dueDate: daysFromNow(14), notes: '', payments: [], items: [{ name: 'Paq. 12 sesiones Brasileño (íntimo)', qty: 1, price: 5500 }] },
  { id: 'cxc-seed-2', saleId: 'sale-seed-2', customer: { id: 'c2', name: 'José Ramírez' }, amount: 12000, method: 'link', reference: 'LNK-3391', status: 'pending', createdAt: daysAgo(0), dueDate: daysFromNow(7), notes: '', payments: [], items: [{ name: '50% Paquete de 2 Cuerpos Completos', qty: 1, price: 12000 }] },
  {
    id: 'cxc-seed-partial',
    saleId: 'sale-seed-partial',
    customer: { id: 'c6', name: 'Cheisy Marte Rochttis' },
    amount: 7000,
    method: 'cxc',
    reference: 'CXC-0142',
    status: 'partial',
    createdAt: daysAgo(5),
    dueDate: daysFromNow(3),
    notes: 'Plan de 3 abonos acordado con cliente.',
    payments: [
      { id: 'pay-p1', amount: 2500, method: 'transferencia', reference: 'TRF-2201', note: 'Primer abono', createdAt: daysAgo(4) },
      { id: 'pay-p2', amount: 1500, method: 'efectivo', reference: null, note: 'Segundo abono en caja', createdAt: daysAgo(2) },
    ],
    items: [{ name: 'Paquete corporal premium', qty: 1, price: 7000 }],
  },
  {
    id: 'cxc-seed-3',
    saleId: 'sale-seed-3',
    customer: { id: 'c3', name: 'Ana Cristina Vargas' },
    amount: 700,
    method: 'cxc',
    reference: 'CXC-0007',
    status: 'paid',
    createdAt: daysAgo(2),
    dueDate: daysAgo(1),
    notes: '',
    paidAt: daysAgo(1),
    paidMethod: 'efectivo',
    payments: [{ id: 'pay-full', amount: 700, method: 'efectivo', reference: null, note: 'Pago completo', createdAt: daysAgo(1) }],
    items: [{ name: '1 Sesión rostro', qty: 1, price: 700 }],
  },
].map(normalizeReceivable)

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
      isExpense: false,

      // ---- caja (register) ----
      register: { open: true, openedAt: minsAgo(90), openingCash: 2000, closedAt: null },
      cashSales: 0,
      shiftSales: SEED_SHIFT_SALES,
      shiftIncomes: [],
      expenses: SEED_SHIFT_EXPENSES,
      registerHistory: [],
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
      setIsExpense: (isExpense) => set({ isExpense: !!isExpense }),
      toggleExpense: () => set((s) => ({ isExpense: !s.isExpense })),
      openCartDrawer: () => set({ cartDrawerOpen: true }),
      closeCartDrawer: () => set({ cartDrawerOpen: false }),

      addItem: (product) =>
        set((state) => {
          const cat = useCatalogStore.getState().products.find((p) => p.id === product.id)
          const cap = cat && cat.type === 'product' && cat.stock !== null && !cat.allowNegativeStock ? cat.stock : Infinity
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
          const cap = cat && cat.type === 'product' && cat.stock !== null && !cat.allowNegativeStock ? cat.stock : Infinity
          if (item.qty >= cap) return {}
          return { items: state.items.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i)) }
        }),
      decItem: (id) => set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i)).filter((i) => i.qty > 0) })),
      removeItem: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
      clearCart: () => set({ items: [], discountMode: 'pct', discountValue: 0, customer: DEFAULT_CUSTOMER, transferProof: null, paymentReference: '', isExpense: false }),

      // ---- caja actions ----
      openRegister: (openingCash) =>
        set({
          register: { open: true, openedAt: now(), openingCash: Number(openingCash) || 0, closedAt: null },
          cashSales: 0,
          shiftSales: [],
          shiftIncomes: [],
          expenses: [],
          lastCloseSummary: null,
        }),
      closeRegister: (actualCash) =>
        set((s) => {
          const cashExpenses = s.expenses.reduce((a, e) => a + e.amount, 0)
          const cashIncomes = s.shiftIncomes.reduce((a, i) => a + i.amount, 0)
          const expected = s.register.openingCash + s.cashSales + cashIncomes - cashExpenses
          const totalSales = s.shiftSales.reduce((a, sale) => a + sale.total, 0)
          const summary = {
            openingCash: s.register.openingCash,
            cashSales: s.cashSales,
            cashIncomes,
            expenses: cashExpenses,
            totalSales,
            salesCount: s.shiftSales.length,
            expected,
            actual: actualCash != null ? Number(actualCash) : expected,
            difference: actualCash != null ? Number(actualCash) - expected : 0,
            closedAt: now(),
          }
          return {
            register: { ...s.register, open: false, closedAt: now() },
            lastCloseSummary: summary,
            registerHistory: [
              {
                id: genId('close'),
                openedAt: s.register.openedAt,
                userName: 'Leonedis Hamburgo',
                ...summary,
              },
              ...s.registerHistory,
            ],
          }
        }),
      addIncome: ({ concept, amount, method }) =>
        set((s) => {
          const entry = {
            id: genId('inc'),
            concept,
            amount: Number(amount) || 0,
            method: method || 'efectivo',
            createdAt: now(),
          }
          const patch = { shiftIncomes: [entry, ...s.shiftIncomes] }
          if ((method || 'efectivo') === 'efectivo') patch.cashSales = s.cashSales + entry.amount
          return patch
        }),
      addExpense: ({ concept, amount, items, method, reference }) =>
        set((s) => ({
          expenses: [
            {
              id: genId('exp'),
              concept,
              amount: Number(amount) || 0,
              items: items || null,
              method: method || null,
              reference: reference || null,
              createdAt: now(),
            },
            ...s.expenses,
          ],
        })),

      recordSale: ({ total, method, customer, reference, items }) => {
        const id = genId('sale')
        const sale = { id, total, method, customer, reference: reference || null, items, createdAt: now() }
        set((s) => {
          const patch = { sales: [sale, ...s.sales] }
          if (s.register.open) patch.shiftSales = [sale, ...s.shiftSales]
          if (method === 'efectivo') patch.cashSales = s.cashSales + total
          if (RECEIVABLE_METHODS.includes(method)) {
            patch.receivables = [
              normalizeReceivable({
                id: genId('cxc'),
                saleId: id,
                customer,
                amount: total,
                method,
                reference: reference || null,
                status: 'pending',
                createdAt: now(),
                dueDate: null,
                notes: '',
                payments: [],
                items,
              }),
              ...s.receivables,
            ]
          }
          return patch
        })
        return id
      },

      updateReceivable: (id, data) =>
        set((s) => ({
          receivables: s.receivables.map((r) =>
            r.id === id
              ? normalizeReceivable({
                  ...r,
                  ...data,
                  amount: data.amount != null ? Number(data.amount) : r.amount,
                })
              : r
          ),
        })),

      addReceivablePayment: (id, { amount, method = 'efectivo', reference, note, proof }) => {
        const paymentAmount = Number(amount) || 0
        if (paymentAmount <= 0) return
        set((s) => {
          const r = s.receivables.find((x) => x.id === id)
          if (!r || getReceivableStatus(r) === 'paid') return {}
          const payment = {
            id: genId('pay'),
            amount: paymentAmount,
            method,
            reference: reference || null,
            note: note || null,
            proof: proof || null,
            createdAt: now(),
          }
          const updated = normalizeReceivable({
            ...r,
            payments: [payment, ...(r.payments || [])],
            paidAt: null,
            paidMethod: null,
          })
          const balance = Math.max(0, updated.amount - (updated.payments || []).reduce((sum, p) => sum + p.amount, 0))
          if (balance <= 0) {
            updated.status = 'paid'
            updated.paidAt = now()
            updated.paidMethod = method
          }
          const patch = {
            receivables: s.receivables.map((x) => (x.id === id ? updated : x)),
          }
          if (method === 'efectivo') patch.cashSales = s.cashSales + paymentAmount
          return patch
        })
      },

      markReceivablePaid: (id, method = 'efectivo', extra = {}) => {
        const r = get().receivables.find((x) => x.id === id)
        if (!r || getReceivableStatus(r) === 'paid') return
        const balance = Math.max(0, r.amount - (r.payments || []).reduce((sum, p) => sum + p.amount, 0))
        const note = method === 'efectivo' ? 'Cobro completo (efectivo)' : 'Pago confirmado'
        get().addReceivablePayment(id, {
          amount: balance,
          method,
          note,
          proof: extra.proof || null,
          reference: extra.reference || null,
        })
        if (extra.proof) {
          set((s) => ({
            receivables: s.receivables.map((x) =>
              x.id === id ? { ...x, proof: extra.proof, reference: extra.reference || x.reference } : x
            ),
          }))
        }
      },

      attachReceivableProof: (id, payload) =>
        set((s) => ({
          receivables: s.receivables.map((x) =>
            x.id === id
              ? {
                  ...x,
                  proof: payload?.proof ?? x.proof,
                  reference: payload?.reference || x.reference,
                }
              : x
          ),
        })),

      deleteReceivable: (id) =>
        set((s) => ({ receivables: s.receivables.filter((r) => r.id !== id) })),

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
      getCashIncomes: () => get().shiftIncomes.reduce((a, i) => a + i.amount, 0),
      getCashInDrawer: () => {
        const s = get()
        return s.register.openingCash + s.cashSales - s.getCashExpenses()
      },
      getShiftSalesTotal: () => get().shiftSales.reduce((a, sale) => a + sale.total, 0),
      getShiftMovements: () => {
        const { shiftSales, shiftIncomes, expenses } = get()
        return buildShiftMovements({ shiftSales, shiftIncomes, expenses })
      },
      getPendingReceivables: () => get().receivables.filter((r) => getReceivableStatus(r) !== 'paid'),
      getPendingTotal: () =>
        get()
          .receivables.filter((r) => getReceivableStatus(r) !== 'paid')
          .reduce((a, r) => {
            const paid = (r.payments || []).reduce((s, p) => s + p.amount, 0)
            return a + Math.max(0, r.amount - paid)
          }, 0),
    }),
    {
      name: 'diedo-pos',
      version: 4,
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        if (!Array.isArray(state.sales) || state.sales.length === 0) state.sales = SEED_SALES
        if (!Array.isArray(state.shiftSales)) state.shiftSales = state.register?.open ? SEED_SHIFT_SALES : []
        if (!Array.isArray(state.shiftIncomes)) state.shiftIncomes = []
        if (!Array.isArray(state.registerHistory)) state.registerHistory = []
        if (Array.isArray(state.receivables)) {
          state.receivables = state.receivables.map((r) => {
            if (r.payments?.length) return normalizeReceivable(r)
            if (r.status === 'paid' && r.paidAt) {
              return normalizeReceivable({
                ...r,
                payments: [{ id: 'pay-migrated', amount: r.amount, method: r.paidMethod || 'efectivo', createdAt: r.paidAt }],
              })
            }
            return normalizeReceivable({ ...r, payments: [] })
          })
        } else {
          state.receivables = SEED_RECEIVABLES
        }
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
        isExpense: s.isExpense,
        register: s.register,
        cashSales: s.cashSales,
        shiftSales: s.shiftSales,
        shiftIncomes: s.shiftIncomes,
        expenses: s.expenses,
        sales: s.sales,
        receivables: s.receivables,
        registerHistory: s.registerHistory,
        lastCloseSummary: s.lastCloseSummary,
      }),
    }
  )
)
