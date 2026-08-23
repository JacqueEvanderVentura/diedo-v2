import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PRODUCTS } from '@/data/products'

export const LOW_STOCK_THRESHOLD = 5
const genId = () => `prod-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

// Single source of truth for products/services. POS + Inventarios both read this.
const SEED = PRODUCTS.map((p) => ({
  id: p.id,
  sku: p.sku ?? null,
  name: p.name,
  price: p.price,
  category: p.category,
  type: p.type, // 'service' | 'product'
  stock: p.type === 'service' ? null : p.stock ?? 0,
  taxPct: 18,
  branchId: 'charm-dn',
}))

export function deriveLowStock(products) {
  return products
    .filter((p) => p.type === 'product' && p.stock !== null && p.stock <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku || 'N/A',
      units: p.stock,
      level: p.stock === 0 ? 'critical' : 'low',
    }))
}

export const useCatalogStore = create(
  persist(
    (set, get) => ({
      products: SEED,

      addProduct: (data) =>
        set((s) => ({
          products: [
            {
              id: genId(),
              sku: data.sku || null,
              name: data.name,
              price: Number(data.price) || 0,
              category: data.category || 'otros',
              type: data.type || 'product',
              stock: data.type === 'service' ? null : Number(data.stock) || 0,
              taxPct: Number(data.taxPct) || 18,
              branchId: data.branchId || 'charm-dn',
            },
            ...s.products,
          ],
        })),

      updateProduct: (id, data) =>
        set((s) => ({
          products: s.products.map((p) =>
            p.id === id
              ? {
                  ...p,
                  ...data,
                  price: Number.isFinite(Number(data.price)) ? Number(data.price) : p.price,
                  taxPct: Number(data.taxPct) || p.taxPct,
                  stock: data.type === 'service' ? null : Number(data.stock) || 0,
                }
              : p
          ),
        })),

      deleteProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

      setStock: (id, stock) =>
        set((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, stock: Math.max(0, Number(stock) || 0) } : p)) })),

      // Called on POS checkout — decrements stock of product-type items sold.
      decrementForSale: (items) =>
        set((s) => ({
          products: s.products.map((p) => {
            const sold = items.find((i) => i.id === p.id)
            if (sold && p.type === 'product' && p.stock !== null) {
              return { ...p, stock: Math.max(0, p.stock - sold.qty) }
            }
            return p
          }),
        })),

      getLowStock: () => deriveLowStock(get().products),
    }),
    { name: 'diedo-catalog', partialize: (s) => ({ products: s.products }) }
  )
)
