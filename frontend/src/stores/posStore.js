import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CUSTOMERS } from '@/data/customers'

const DEFAULT_CUSTOMER = CUSTOMERS[0]

// POS store — cart, customer, discount, payment. Persisted so an in-progress
// sale survives an accidental reload.
export const usePosStore = create(
  persist(
    (set, get) => ({
      branchId: 'charm-dn',
      items: [], // { id, name, price, qty, sku }
      customer: DEFAULT_CUSTOMER,
      discountPct: 0,
      taxPct: 18, // ITBIS
      paymentMethod: 'efectivo',
      transferProof: null, // { name } for uploaded receipt
      paymentReference: '', // voucher / reference number
      cartDrawerOpen: false, // mobile bottom sheet

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
            return {
              items: state.items.map((i) =>
                i.id === product.id ? { ...i, qty: i.qty + 1 } : i
              ),
            }
          }
          return {
            items: [
              ...state.items,
              { id: product.id, name: product.name, price: product.price, sku: product.sku, qty: 1 },
            ],
          }
        }),

      incItem: (id) =>
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i)),
        })),

      decItem: (id) =>
        set((state) => ({
          items: state.items
            .map((i) => (i.id === id ? { ...i, qty: i.qty - 1 } : i))
            .filter((i) => i.qty > 0),
        })),

      removeItem: (id) =>
        set((state) => ({ items: state.items.filter((i) => i.id !== id) })),

      clearCart: () =>
        set({ items: [], discountPct: 0, customer: DEFAULT_CUSTOMER, transferProof: null, paymentReference: '' }),

      // ---- derived selectors ----
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
    }),
    {
      name: 'diedo-pos',
      partialize: (s) => ({
        branchId: s.branchId,
        items: s.items,
        customer: s.customer,
        discountPct: s.discountPct,
        paymentMethod: s.paymentMethod,
      }),
    }
  )
)
