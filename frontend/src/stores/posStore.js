import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CUSTOMERS } from '@/data/customers'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { buildShiftMovements } from '@/modules/pos/lib/caja'
import { getReceivableStatus, normalizeReceivable, getBalance } from '@/modules/pos/lib/receivables'
import {
  calcSnapshotTotal,
  countSnapshotItems,
  mergeCartItems,
  snapshotCart,
  EMPTY_CART_PATCH,
} from '@/modules/pos/lib/openAccount'
import { CURRENT_USER } from '@/data/dashboard'

const DEFAULT_CUSTOMER = CUSTOMERS[0]
const now = () => new Date().toISOString()
const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const agendaReceivableId = (appointmentId) => `cxc-agenda-${appointmentId}`

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
  { id: 'cxc-seed-1', saleId: 'sale-seed-1', branchId: 'charm-dn', customer: { id: 'c1', name: 'María Fernández' }, amount: 5500, method: 'transferencia', reference: 'TRF-8842', status: 'pending', createdAt: daysAgo(1), dueDate: daysFromNow(14), notes: '', payments: [], items: [{ name: 'Paq. 12 sesiones Brasileño (íntimo)', qty: 1, price: 5500 }] },
  { id: 'cxc-seed-2', saleId: 'sale-seed-2', branchId: 'charm-dn', customer: { id: 'c2', name: 'José Ramírez' }, amount: 12000, method: 'link', reference: 'LNK-3391', status: 'pending', createdAt: daysAgo(0), dueDate: daysFromNow(7), notes: '', payments: [], items: [{ name: '50% Paquete de 2 Cuerpos Completos', qty: 1, price: 12000 }] },
  {
    id: 'cxc-seed-partial',
    saleId: 'sale-seed-partial',
    branchId: 'charm-este',
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
    branchId: 'charm-santiago',
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

const SEED_OPEN_QUOTES = [
  {
    id: 'quote-seed-1',
    customer: { id: 'c1', name: 'María Fernández', phone: '809-555-0142' },
    items: [{ id: 'svc-axilas', name: '1 sesión axilas', price: 900, listPrice: 900, sku: '8', qty: 2 }],
    discountMode: 'pct',
    discountValue: 0,
    paymentMethod: 'efectivo',
    paymentReference: '',
    documentKind: 'quote',
    createdAt: daysAgo(0),
    updatedAt: daysAgo(0),
  },
]

// Historial de ventas mock
const SEED_SALES = [
  { id: 'sale-h1', branchId: 'charm-dn', total: 900, method: 'efectivo', soldBy: 'Leonedis Hamburgo', customer: { id: 'c1', name: 'María Fernández' }, reference: null, items: [{ name: '1 sesión axilas', qty: 1, price: 720, listPrice: 900 }], createdAt: daysAgo(1) },
  { id: 'sale-h2', branchId: 'charm-dn', total: 5000, method: 'tarjeta', soldBy: 'Ana Vendedora', customer: { id: 'c3', name: 'Ana Cristina Vargas' }, reference: 'APR-2231', items: [{ name: 'Paq. 12 sesiones Rostro completo', qty: 1, price: 5000, listPrice: 5000 }], createdAt: daysAgo(2) },
  { id: 'sale-h3', branchId: 'charm-este', total: 1780, method: 'efectivo', soldBy: 'Ana Vendedora', customer: { id: 'c5', name: 'Carla Jiménez' }, reference: null, items: [{ name: 'Red Bull', qty: 2, price: 180, listPrice: 180 }, { name: '1 sesión axilas', qty: 1, price: 900, listPrice: 900 }, { name: '1 Sesión rostro', qty: 1, price: 700, listPrice: 700 }], createdAt: daysAgo(3) },
  { id: 'sale-h4', branchId: 'charm-dn', total: 12000, method: 'link', soldBy: 'Carlos Cajero', customer: { id: 'c2', name: 'José Ramírez' }, reference: 'LNK-3391', items: [{ name: '50% Paquete de 2 Cuerpos Completos', qty: 1, price: 12000, listPrice: 12000 }], createdAt: daysAgo(4) },
  { id: 'sale-h5', branchId: 'charm-santiago', total: 1200, method: 'tarjeta', soldBy: 'María Recepción', customer: { id: 'c4', name: 'Luis Alberto Peña' }, reference: 'APR-9910', items: [{ name: '1 sesión piernas completas', qty: 1, price: 1200, listPrice: 1200 }], createdAt: daysAgo(5) },
  { id: 'sale-h6', branchId: 'charm-dn', total: 2500, method: 'efectivo', soldBy: 'Leonedis Hamburgo', customer: { id: 'c3', name: 'Ana Cristina Vargas' }, reference: null, items: [{ name: 'Facial hidratante', qty: 1, price: 2000, listPrice: 2500 }], createdAt: daysAgo(6) },
  { id: 'sale-h7', branchId: 'charm-este', total: 900, method: 'efectivo', soldBy: 'Carlos Cajero', customer: { id: 'c1', name: 'María Fernández' }, reference: null, items: [{ name: '1 sesión axilas', qty: 1, price: 900, listPrice: 900 }], createdAt: daysAgo(9) },
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
      documentKind: 'quote',
      isFinalized: false,
      heldCarts: SEED_OPEN_QUOTES.map((q) => ({
        ...q,
        heldKind: 'quote',
        label: `${q.customer?.name || 'Sin cliente'} · Cotización`,
      })),
      openQuotes: SEED_OPEN_QUOTES,

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
          if (cat && !isPosSellable(cat)) return {}
          const cap = cat && cat.type === 'product' && cat.stock !== null && !cat.allowNegativeStock ? cat.stock : Infinity
          const existing = state.items.find((i) => i.id === product.id)
          const currentQty = existing ? existing.qty : 0
          if (currentQty >= cap) return {} // at stock ceiling
          if (existing) {
            return { items: state.items.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i)) }
          }
          const price = Number(product.price) || 0
          return {
            items: [
              ...state.items,
              { id: product.id, name: product.name, price, listPrice: price, sku: product.sku, qty: 1 },
            ],
          }
        }),
      setItemPrice: (id, price) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, price: Math.max(0, Number(price) || 0) } : i
          ),
        })),
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
      clearCart: () => set({ ...EMPTY_CART_PATCH, customer: DEFAULT_CUSTOMER }),

      setDocumentKind: (documentKind) => {
        if (get().isFinalized) return
        set({ documentKind })
      },

      retainCart: () => {
        const s = get()
        if (!s.items.length) return false
        const held = {
          id: genId('held'),
          ...snapshotCart(s),
          branchId: s.branchId,
          heldKind: 'park',
          createdAt: now(),
          label: s.customer?.name || 'Sin cliente',
        }
        set({
          heldCarts: [held, ...s.heldCarts],
          ...EMPTY_CART_PATCH,
          customer: DEFAULT_CUSTOMER,
        })
        return true
      },

      restoreHeldCart: (id) => {
        const s = get()
        const held = s.heldCarts.find((h) => h.id === id)
        if (!held) return false
        set({
          customer: held.customer,
          items: held.items.map((i) => ({ ...i })),
          discountMode: held.discountMode,
          discountValue: held.discountValue,
          paymentMethod: held.paymentMethod,
          paymentReference: held.paymentReference,
          documentKind: held.documentKind || 'quote',
          isFinalized: false,
          heldCarts: s.heldCarts.filter((h) => h.id !== id),
        })
        return true
      },

      removeHeldCart: (id) =>
        set((s) => {
          const held = s.heldCarts.find((h) => h.id === id)
          const heldCarts = s.heldCarts.filter((h) => h.id !== id)
          if (!held || held.heldKind !== 'quote') return { heldCarts }
          const customerId = held.customer?.id
          return {
            heldCarts,
            openQuotes: s.openQuotes.filter(
              (q) => q.id !== id && (!customerId || q.customer?.id !== customerId)
            ),
          }
        }),

      saveOpenQuote: () => {
        const s = get()
        if (!s.items.length || s.isFinalized) return false
        const held = {
          id: genId('held'),
          ...snapshotCart({ ...s, documentKind: 'quote' }),
          branchId: s.branchId,
          heldKind: 'quote',
          createdAt: now(),
          label: `${s.customer?.name || 'Sin cliente'} · Cotización`,
        }
        const quote = {
          id: held.id,
          ...snapshotCart({ ...s, documentKind: 'quote' }),
          branchId: s.branchId,
          createdAt: now(),
          updatedAt: now(),
        }
        set({
          heldCarts: [held, ...s.heldCarts],
          openQuotes: [
            quote,
            ...s.openQuotes.filter((q) => q.customer?.id !== quote.customer?.id),
          ],
          ...EMPTY_CART_PATCH,
          customer: DEFAULT_CUSTOMER,
        })
        return true
      },

      requestBill: () => {
        if (!get().items.length) return false
        set({ documentKind: 'invoice', isFinalized: true })
        return true
      },

      loadOpenQuoteToCart: (quoteId) => {
        const quote = get().openQuotes.find((q) => q.id === quoteId)
        if (!quote) return false
        set({
          customer: quote.customer,
          items: quote.items.map((i) => ({ ...i })),
          discountMode: quote.discountMode,
          discountValue: quote.discountValue,
          paymentMethod: quote.paymentMethod || 'efectivo',
          paymentReference: quote.paymentReference || '',
          documentKind: 'quote',
          isFinalized: false,
        })
        return true
      },

      addOpenAccountToCart: (customerId) => {
        const s = get()
        const quote = s.openQuotes.find((q) => q.customer?.id === customerId)
        const receivables = s.receivables.filter(
          (r) => r.customer?.id === customerId && getReceivableStatus(r) !== 'paid'
        )
        if (!quote && !receivables.length) return false

        const incoming = []
        if (quote) incoming.push(...quote.items.map((i) => ({ ...i })))

        receivables.forEach((r) => {
          const balance = getBalance(r)
          if (balance <= 0) return
          if (r.items?.length) {
            r.items.forEach((item, idx) => {
              incoming.push({
                id: `cxc-${r.id}-${idx}`,
                name: `${item.name} (saldo CxC)`,
                price: item.price,
                listPrice: item.price,
                qty: item.qty || 1,
                sku: null,
              })
            })
          } else {
            incoming.push({
              id: `cxc-${r.id}`,
              name: `Saldo pendiente · ${r.reference || r.id}`,
              price: balance,
              listPrice: balance,
              qty: 1,
              sku: null,
            })
          }
        })

        set({
          customer: quote?.customer || receivables[0]?.customer || s.customer,
          items: mergeCartItems(s.items, incoming),
          documentKind: 'quote',
          isFinalized: false,
        })
        return true
      },

      addReceivableToCart: (customerId) => {
        const s = get()
        const receivables = s.receivables.filter(
          (r) => r.customer?.id === customerId && getReceivableStatus(r) !== 'paid'
        )
        if (!receivables.length) return false

        const incoming = []
        receivables.forEach((r) => {
          const balance = getBalance(r)
          if (balance <= 0) return
          if (r.items?.length) {
            r.items.forEach((item, idx) => {
              incoming.push({
                id: `cxc-${r.id}-${idx}`,
                name: `${item.name} (saldo CxC)`,
                price: item.price,
                listPrice: item.price,
                qty: item.qty || 1,
                sku: null,
              })
            })
          } else {
            incoming.push({
              id: `cxc-${r.id}`,
              name: `Saldo pendiente · ${r.reference || r.id}`,
              price: balance,
              listPrice: balance,
              qty: 1,
              sku: null,
            })
          }
        })
        if (!incoming.length) return false

        set({
          customer: receivables[0]?.customer || s.customer,
          items: mergeCartItems(s.items, incoming),
          documentKind: 'invoice',
          isFinalized: false,
        })
        return true
      },

      removeOpenQuote: (customerId) =>
        set((s) => ({
          openQuotes: s.openQuotes.filter((q) => q.customer?.id !== customerId),
        })),

      getCustomerDebtSummary: (customerId) => {
        if (!customerId || customerId === 'walk-in') return null
        const s = get()
        const receivables = s.receivables.filter(
          (r) => r.customer?.id === customerId && getReceivableStatus(r) !== 'paid'
        )
        const receivableBalance = receivables.reduce((sum, r) => sum + getBalance(r), 0)
        const openQuote = s.openQuotes.find((q) => q.customer?.id === customerId)
        const quoteTotal = openQuote ? calcSnapshotTotal({ ...openQuote, taxPct: s.taxPct }) : 0
        const quoteItemCount = openQuote ? countSnapshotItems(openQuote.items) : 0
        const receivableItemCount = receivables.reduce(
          (n, r) => n + (r.items?.reduce((sum, i) => sum + (Number(i.qty) || 1), 0) || 1),
          0
        )
        const total = receivableBalance + quoteTotal
        if (total <= 0 && !openQuote && !receivables.length) return null
        return {
          receivables,
          receivableBalance,
          openQuote,
          quoteTotal,
          quoteItemCount,
          receivableItemCount,
          total,
          itemCount: quoteItemCount + receivableItemCount,
        }
      },

      getOpenQuotesTotal: () => {
        const taxPct = get().taxPct
        return get().openQuotes.reduce((sum, q) => sum + calcSnapshotTotal({ ...q, taxPct }), 0)
      },

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
            branchId: s.branchId,
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

      recordSale: ({ total, method, customer, reference, items, subtotal, discountAmt, discountPct, taxPct, taxAmt }) => {
        const id = genId('sale')
        const normalizedItems = (items || []).map((i) => ({
          ...i,
          qty: i.qty || 1,
          price: Number(i.price) || 0,
          listPrice: Number(i.listPrice ?? i.price) || 0,
        }))
        const computedSubtotal = subtotal ?? normalizedItems.reduce((a, i) => a + i.price * i.qty, 0)
        const sale = {
          id,
          branchId: get().branchId,
          total,
          method,
          customer,
          reference: reference || null,
          items: normalizedItems,
          subtotal: computedSubtotal,
          discountAmt: discountAmt ?? 0,
          discountPct: discountPct ?? 0,
          taxPct: taxPct ?? get().taxPct,
          taxAmt: taxAmt ?? 0,
          soldBy: CURRENT_USER.name,
          createdAt: now(),
        }
        set((s) => {
          const patch = { sales: [sale, ...s.sales] }
          if (s.register.open) patch.shiftSales = [sale, ...s.shiftSales]
          if (method === 'efectivo') patch.cashSales = s.cashSales + total
          if (RECEIVABLE_METHODS.includes(method)) {
            patch.receivables = [
              normalizeReceivable({
                id: genId('cxc'),
                saleId: id,
                branchId: get().branchId,
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

      syncAppointmentReceivable: (appointment) => {
        if (!appointment?.id) return
        const shouldHave = appointment.pendingPayment && Number(appointment.pendingAmount) > 0
        const receivableId = agendaReceivableId(appointment.id)

        set((s) => {
          const existing =
            s.receivables.find((r) => r.id === receivableId) ||
            s.receivables.find((r) => r.appointmentId === appointment.id)

          if (!shouldHave) {
            if (!existing) return {}
            if ((existing.payments || []).length > 0) return {}
            return { receivables: s.receivables.filter((r) => r.id !== existing.id) }
          }

          const amount = Number(appointment.pendingAmount) || 0
          const customer = {
            id: appointment.customerId || 'walk-in',
            name: appointment.customerName || 'Cliente',
            phone: appointment.customerPhone || '',
          }
          const receivable = normalizeReceivable({
            id: existing?.id || receivableId,
            appointmentId: appointment.id,
            source: 'agenda',
            branchId: appointment.branchId || 'charm-dn',
            customer,
            amount,
            method: 'agenda',
            reference: `Cita ${appointment.date} · ${appointment.time}`,
            status: 'pending',
            createdAt: existing?.createdAt || appointment.createdAt || now(),
            dueDate: appointment.date,
            notes: appointment.serviceName ? `Servicio: ${appointment.serviceName}` : 'Saldo pendiente de cita',
            payments: existing?.payments || [],
            items: [
              {
                name: appointment.serviceName || 'Servicio de cita',
                qty: 1,
                price: amount,
              },
            ],
            saleId: null,
          })

          if (existing) {
            return { receivables: s.receivables.map((r) => (r.id === existing.id ? receivable : r)) }
          }
          return { receivables: [receivable, ...s.receivables] }
        })
      },

      removeAppointmentReceivable: (appointmentId) => {
        if (!appointmentId) return
        const receivableId = agendaReceivableId(appointmentId)
        set((s) => ({
          receivables: s.receivables.filter(
            (r) => r.id !== receivableId && r.appointmentId !== appointmentId
          ),
        }))
      },

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
          if (balance <= 0 && updated.source === 'agenda' && updated.appointmentId) {
            queueMicrotask(() => {
              import('@/modules/agenda/lib/receivableSync').then(({ notifyAgendaReceivablePaid }) => {
                notifyAgendaReceivablePaid(updated.appointmentId)
              })
            })
          }
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
      version: 7,
      migrate: (persisted) => persisted ?? {},
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted || {}) }
        const branchFallback = ['charm-dn', 'charm-dn', 'charm-este', 'charm-dn', 'charm-santiago', 'charm-dn', 'charm-este']
        if (Array.isArray(state.items)) {
          state.items = state.items.map((i) => ({
            ...i,
            listPrice: i.listPrice ?? i.price,
          }))
        }
        if (!Array.isArray(state.heldCarts)) state.heldCarts = []
        if (!Array.isArray(state.openQuotes) || state.openQuotes.length === 0) {
          state.openQuotes = SEED_OPEN_QUOTES
        }
        if (Array.isArray(state.openQuotes) && state.openQuotes.length > 0) {
          const heldIds = new Set(state.heldCarts.map((h) => h.id))
          const backfill = state.openQuotes
            .filter((q) => !heldIds.has(q.id))
            .map((q) => ({
              ...q,
              heldKind: 'quote',
              label: `${q.customer?.name || 'Sin cliente'} · Cotización`,
            }))
          if (backfill.length) state.heldCarts = [...backfill, ...state.heldCarts]
        }
        if (!state.documentKind) state.documentKind = 'quote'
        if (state.isFinalized == null) state.isFinalized = false
        if (!Array.isArray(state.sales) || state.sales.length === 0) {
          state.sales = SEED_SALES
        } else {
          state.sales = state.sales.map((s, i) => ({
            ...s,
            branchId: s.branchId || branchFallback[i % branchFallback.length] || 'charm-dn',
            items: (s.items || []).map((item) => ({
              ...item,
              listPrice: item.listPrice ?? item.price,
            })),
          }))
        }
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
        documentKind: s.documentKind,
        isFinalized: s.isFinalized,
        heldCarts: s.heldCarts,
        openQuotes: s.openQuotes,
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
