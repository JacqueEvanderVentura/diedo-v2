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
  minStock: p.minStock ?? 0,
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

      addProduct: (data) => {
        const product = {
          id: genId(),
          sku: data.sku || null,
          name: data.name,
          price: Number(data.price) || 0,
          category: data.category || 'otros',
          type: data.type || 'product',
          stock: data.type === 'service' ? null : Number(data.stock) || 0,
          taxPct: data.appliesTax === false ? 0 : Number(data.taxPct) || 18,
          branchId: data.branchId || data.branchIds?.[0] || 'charm-dn',
          branchIds: data.branchIds || (data.branchId ? [data.branchId] : ['charm-dn']),
          subtype: data.subtype || 'sale',
          cost: Number(data.cost) || 0,
          minStock: Number(data.minStock) || 0,
          requiresSize: !!data.requiresSize,
          isMembership: !!data.isMembership,
          unit: data.unit || 'ud',
          dynamicPrice: !!data.dynamicPrice,
          allowNegativeStock: !!data.allowNegativeStock,
          image: data.image || null,
        }
        set((s) => ({ products: [product, ...s.products] }))
        return product
      },

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

      bulkDecrementStock: (items) =>
        set((s) => ({
          products: s.products.map((p) => {
            const row = items.find((i) => i.id === p.id)
            if (!row || p.type !== 'product' || p.stock === null) return p
            const next = p.stock - (Number(row.qty) || 0)
            return { ...p, stock: p.allowNegativeStock ? next : Math.max(0, next) }
          }),
        })),

      getInventoryStats: () => {
        const products = get().products.filter((p) => p.type === 'product')
        const low = products.filter((p) => p.stock !== null && p.stock > 0 && p.stock <= (p.minStock || LOW_STOCK_THRESHOLD)).length
        const out = products.filter((p) => p.stock === 0).length
        const totalValue = products.reduce((sum, p) => sum + (Number(p.price) || 0) * (Number(p.stock) || 0), 0)
        return { total: products.length, low, out, totalValue }
      },

      getLowStock: () => deriveLowStock(get().products),
    }),
    { name: 'diedo-catalog', partialize: (s) => ({ products: s.products }) }
  )
)
