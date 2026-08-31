import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'
import { PRODUCTS, SUPPLIES } from '@/data/products'
import { catalogApi } from '@/services/catalogApi'
import { inventoryApi } from '@/services/inventoryApi'
import { lookupsApi } from '@/services/lookupsApi'
import { mapCategoryFromApi } from '@/services/adapters/catalog'
import { useConfigStore } from '@/stores/configStore'
import {
  defaultUnitId,
  mergeProductLists,
  resolveApiBranchIds,
  resolveCategoryId,
} from '@/lib/catalogSync'

export const LOW_STOCK_THRESHOLD = 5
const genId = () => `prod-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`

export function isPosSellable(product) {
  return product?.type === 'product' || product?.type === 'service'
}

export function isStockTracked(product) {
  return product?.type === 'product' || product?.type === 'supply'
}

function normalizeSeed(p) {
  const isSupply = p.type === 'supply'
  return {
    id: p.id,
    sku: p.sku ?? null,
    name: p.name,
    price: isSupply ? 0 : p.price,
    category: p.category,
    type: p.type,
    stock: p.type === 'service' ? null : p.stock ?? 0,
    minStock: p.minStock ?? 0,
    taxPct: isSupply ? 0 : 18,
    branchId: p.branchId || 'charm-dn',
    branchIds: p.branchIds || [p.branchId || 'charm-dn'],
    cost: Number(p.cost) || 0,
    unit: p.unit || 'ud',
    subtype: isSupply ? 'raw' : 'sale',
  }
}

const SEED = [
  ...PRODUCTS.map((p) => normalizeSeed(p)),
  ...SUPPLIES.map((p) => normalizeSeed(p)),
]

export function deriveLowStock(products) {
  return products
    .filter((p) => isStockTracked(p) && p.stock !== null && p.stock <= (p.minStock || LOW_STOCK_THRESHOLD))
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
      apiContext: { units: [], apiBranches: [], hydrated: false },

      hydrateFromApi: async (configBranches = []) => {
        const [categoriesRes, productsRes, units, apiBranches] = await Promise.all([
          catalogApi.listCategories({ page: 1, pageSize: 100, status: 'active' }),
          inventoryApi.listAllItems({ status: 'active' }),
          catalogApi.listUnitsOfMeasure(),
          lookupsApi.branches(),
        ])

        const categories = (categoriesRes.items || []).map((category, index) =>
          mapCategoryFromApi(category, index)
        )
        useConfigStore.getState().setCategories(categories)

        const categoryIdToLocal = new Map()
        categories.forEach((c) => {
          if (c.api) categoryIdToLocal.set(c.id, c.id)
        })

        const merged = mergeProductLists(productsRes.items || [], get().products, categoryIdToLocal)
        set({
          products: merged,
          apiContext: { units, apiBranches, categories, hydrated: true, configBranches },
        })
        return merged
      },

      saveProduct: async (form, existing, { categories, configBranches, isOnline }) => {
        if (!isOnline) {
          if (existing) {
            get().updateProduct(existing.id, form)
            return existing.id
          }
          return get().addProduct(form).id
        }

        let context = get().apiContext
        if (!context.hydrated || !context.units?.length || !context.apiBranches?.length || !context.categories?.length) {
          await get().hydrateFromApi(configBranches)
          context = get().apiContext
        }

        const syncedCategories = categories.some((category) => category.api)
          ? categories
          : context.categories || []
        const { units, apiBranches } = context
        const categoryId = resolveCategoryId(form.category, syncedCategories)
        const unitOfMeasureId = defaultUnitId(units, form.unit || 'ud')
        const branchIds = resolveApiBranchIds(form.branchId, configBranches, apiBranches)
        const branchId = branchIds[0]

        if (!categoryId) throw new Error('Selecciona una categoría sincronizada con la API.')
        if (!unitOfMeasureId) throw new Error('No hay unidades de medida en el catálogo API.')
        if (!branchIds.length) throw new Error('No hay sucursales API asignables.')

        const commonPayload = {
          name: form.name.trim(),
          sku: form.sku || null,
          categoryId,
          unitOfMeasureId,
          branchId,
          status: 'active',
        }

        let apiProduct
        if (existing?.apiSynced && existing.version) {
          const updatePayload = {
            version: existing.version,
            ...commonPayload,
            minimumStock: form.type === 'service' ? undefined : Number(form.minStock) || 0,
          }
          if (form.type === 'supply') {
            updatePayload.unitCost = Number(form.cost) || 0
          } else {
            updatePayload.salePrice = Number(form.price) || 0
            updatePayload.taxRate = Number(form.taxPct) || 0
            if (form.type === 'product') updatePayload.unitCost = Number(form.cost) || 0
          }
          apiProduct = await inventoryApi.updateItem(existing.id, updatePayload)
        } else {
          const stockPayload = {
            stock: Number(form.stock) || 0,
            minimumStock: Number(form.minStock) || 0,
          }
          if (form.type === 'supply') {
            apiProduct = await inventoryApi.createSupply({
              ...commonPayload,
              unitCost: Number(form.cost) || 0,
              ...stockPayload,
            })
          } else if (form.type === 'service') {
            apiProduct = await inventoryApi.createService({
              ...commonPayload,
              salePrice: Number(form.price) || 0,
              taxRate: Number(form.taxPct) || 0,
            })
          } else {
            apiProduct = await inventoryApi.createProduct({
              ...commonPayload,
              salePrice: Number(form.price) || 0,
              unitCost: Number(form.cost) || 0,
              taxRate: Number(form.taxPct) || 0,
              ...stockPayload,
            })
          }
        }

        const categoryIdToLocal = new Map([[categoryId, categoryId]])
        const merged = mergeProductLists([apiProduct], [{ ...existing, ...form }], categoryIdToLocal)[0]

        set((s) => {
          const without = s.products.filter((p) => p.id !== existing?.id)
          const idx = without.findIndex((p) => p.id === merged.id)
          if (idx >= 0) {
            const next = [...without]
            next[idx] = merged
            return { products: next }
          }
          return { products: [merged, ...without] }
        })

        return merged.id
      },

      addProduct: (data) => {
        const type = data.type || 'product'
        const isSupply = type === 'supply'
        const product = {
          id: genId(),
          sku: data.sku || null,
          name: data.name,
          price: isSupply ? 0 : Number(data.price) || 0,
          category: data.category || (isSupply ? 'insumos' : 'otros'),
          type,
          stock: type === 'service' ? null : Number(data.stock) || 0,
          taxPct: isSupply ? 0 : data.appliesTax === false ? 0 : Number(data.taxPct) || 18,
          branchId: data.branchId || data.branchIds?.[0] || 'charm-dn',
          branchIds: data.branchIds || (data.branchId ? [data.branchId] : ['charm-dn']),
          subtype: isSupply ? 'raw' : data.subtype || 'sale',
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
          products: s.products.map((p) => {
            if (p.id !== id) return p
            const type = data.type || p.type
            const isSupply = type === 'supply'
            return {
              ...p,
              ...data,
              type,
              price: isSupply ? 0 : Number.isFinite(Number(data.price)) ? Number(data.price) : p.price,
              taxPct: isSupply ? 0 : Number(data.taxPct) || p.taxPct,
              stock: type === 'service' ? null : Number(data.stock) || 0,
              cost: Number.isFinite(Number(data.cost)) ? Number(data.cost) : p.cost,
              subtype: isSupply ? 'raw' : data.subtype || p.subtype,
            }
          }),
        })),

      deleteProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

      setStock: (id, stock) =>
        set((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, stock: Math.max(0, Number(stock) || 0) } : p)) })),

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
            if (!row || !isStockTracked(p) || p.stock === null) return p
            const next = p.stock - (Number(row.qty) || 0)
            return { ...p, stock: p.allowNegativeStock ? next : Math.max(0, next) }
          }),
        })),

      getSupplies: () => get().products.filter((p) => p.type === 'supply'),

      getInventoryStats: () => {
        const stocked = get().products.filter((p) => isStockTracked(p))
        const low = stocked.filter((p) => p.stock !== null && p.stock > 0 && p.stock <= (p.minStock || LOW_STOCK_THRESHOLD)).length
        const out = stocked.filter((p) => p.stock === 0).length
        const totalValue = stocked.reduce(
          (sum, p) => sum + (Number(p.cost) || Number(p.price) || 0) * (Number(p.stock) || 0),
          0
        )
        return { total: stocked.length, low, out, totalValue, supplies: get().getSupplies().length }
      },

      getLowStock: () => deriveLowStock(get().products),
    }),
    { name: 'diedo-catalog', storage: ephemeralJsonStorage, partialize: (s) => ({ products: s.products, apiContext: { hydrated: false } }) }
  )
)
