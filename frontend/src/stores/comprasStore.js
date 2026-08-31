import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { purchasingApi } from '@/services/purchasingApi'
import {
  mapPurchaseRequestFromApi,
  mapPurchasingSettingsFromApi,
  mapSupplierFromApi,
  purchaseRequestToApiPayload,
  purchasingSettingsToApiPayload,
  supplierToApiPayload,
} from '@/services/adapters/purchasing'

const genId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString()

const SEED_SUPPLIERS = [
  { id: 'sup-1', name: 'Distribuidora del Caribe', rnc: '131-12345-6', contactName: 'Juan Pérez', phone: '809-555-0199', email: 'ventas@proveedor.com', address: 'Calle Central #12, Santo Domingo', branchIds: ['charm-dn', 'charm-santiago'], productCount: 24, active: true, createdAt: daysAgo(60) },
  { id: 'sup-2', name: 'Beauty Supply RD', rnc: '101-99887-2', contactName: 'María López', phone: '829-555-4400', email: 'pedidos@beautysupply.do', address: 'Av. Winston Churchill, SD', branchIds: ['charm-dn'], productCount: 12, active: true, createdAt: daysAgo(30) },
]

const SEED_REQUESTS = [
  {
    id: 'req-1',
    number: 'req-1',
    supplierId: 'sup-1',
    branchId: 'charm-dn',
    requesterName: 'Leonedis Hamburgo',
    requesterId: 'u1',
    items: [
      { name: 'Cera depilatoria premium', qty: 10, unit: 'unidad', price: 450 },
      { name: 'Guantes desechables', qty: 5, unit: 'caja', price: 320 },
    ],
    status: 'pendiente',
    priority: 'normal',
    notes: 'Reposición mensual de insumos láser.',
    quoteFile: null,
    createdAt: daysAgo(1),
    reviewedAt: null,
    reviewedBy: null,
  },
  {
    id: 'req-2',
    number: 'req-2',
    supplierId: 'sup-2',
    branchId: 'charm-dn',
    requesterName: 'María Recepción',
    requesterId: 'u2',
    items: [{ name: 'Shampoo profesional', qty: 20, unit: 'unidad', price: 280 }],
    status: 'aprobada',
    priority: 'alta',
    notes: 'Urgente para sucursal DN.',
    quoteFile: { name: 'cotizacion-shampoo.pdf' },
    createdAt: daysAgo(4),
    reviewedAt: daysAgo(3),
    reviewedBy: 'u1',
  },
]

const SEED_SETTINGS = { approverUserId: 'u1', notifyOnRequest: true }
let purchasingHydrationPromise = null

export function requestTotal(request) {
  return (request.items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
    0
  )
}

export function deriveRequestStats(requests) {
  return {
    total: requests.length,
    pendiente: requests.filter((request) => request.status === 'pendiente').length,
    aprobada: requests.filter((request) => request.status === 'aprobada').length,
    rechazada: requests.filter((request) => request.status === 'rechazada').length,
    entregada: requests.filter((request) => request.status === 'entregada').length,
  }
}

function replaceById(items, next) {
  return items.map((item) => (item.id === next.id ? next : item))
}

function localSupplier(data) {
  return {
    id: genId('sup'),
    productCount: 0,
    active: true,
    createdAt: now(),
    branchIds: [],
    ...data,
  }
}

function localRequest(data) {
  const id = genId('req')
  return {
    id,
    number: id,
    status: 'pendiente',
    priority: 'normal',
    quoteFile: null,
    createdAt: now(),
    reviewedAt: null,
    reviewedBy: null,
    ...data,
  }
}

export const useComprasStore = create(
  persist(
    (set, get) => ({
      suppliers: SEED_SUPPLIERS,
      purchaseRequests: SEED_REQUESTS,
      settings: SEED_SETTINGS,
      approvers: [],
      stats: deriveRequestStats(SEED_REQUESTS),
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,

      hydrateFromApi: async ({ force = false } = {}) => {
        if (purchasingHydrationPromise) return purchasingHydrationPromise
        if (get().apiContext.hydrated && !force) return get().purchaseRequests

        set((state) => ({
          hydrating: true,
          error: null,
          ...(state.apiContext.hydrated
            ? {}
            : { suppliers: [], purchaseRequests: [], stats: deriveRequestStats([]) }),
        }))
        purchasingHydrationPromise = (async () => {
          try {
            const [supplierResponse, requestResponse, stats, settings, approvers] = await Promise.all([
              purchasingApi.listAllSuppliers({ active: true, sortBy: 'name', sortDirection: 'asc' }),
              purchasingApi.listAllRequests({ sortBy: 'createdAt', sortDirection: 'desc' }),
              purchasingApi.getRequestStats(),
              purchasingApi.getSettings(),
              purchasingApi.listApprovers(),
            ])
            const suppliers = (supplierResponse.items || []).map(mapSupplierFromApi)
            const purchaseRequests = (requestResponse.items || []).map(mapPurchaseRequestFromApi)
            set({
              suppliers,
              purchaseRequests,
              stats,
              settings: mapPurchasingSettingsFromApi(settings),
              approvers,
              apiContext: { hydrated: true },
              hydrating: false,
              error: null,
            })
            return purchaseRequests
          } catch (error) {
            set({
              hydrating: false,
              error: error.message || 'No se pudo cargar el módulo de Compras.',
            })
            throw error
          } finally {
            purchasingHydrationPromise = null
          }
        })()
        return purchasingHydrationPromise
      },

      addSupplier: async (data, { isOnline = false } = {}) => {
        if (!isOnline) {
          const supplier = localSupplier(data)
          set((state) => ({ suppliers: [supplier, ...state.suppliers] }))
          return supplier
        }
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const supplier = mapSupplierFromApi(
          await purchasingApi.createSupplier(supplierToApiPayload(data))
        )
        set((state) => ({ suppliers: [supplier, ...state.suppliers], error: null }))
        return supplier
      },

      updateSupplier: async (id, data, { isOnline = false } = {}) => {
        if (!isOnline) {
          set((state) => ({
            suppliers: state.suppliers.map((supplier) => (
              supplier.id === id ? { ...supplier, ...data } : supplier
            )),
          }))
          return get().suppliers.find((supplier) => supplier.id === id)
        }
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().suppliers.find((supplier) => supplier.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar el proveedor antes de editarlo.')
        const supplier = mapSupplierFromApi(
          await purchasingApi.updateSupplier(id, {
            version: current.version,
            ...supplierToApiPayload(data),
          })
        )
        set((state) => ({ suppliers: replaceById(state.suppliers, supplier), error: null }))
        return supplier
      },

      deleteSupplier: async (id, { isOnline = false } = {}) => {
        if (isOnline) {
          if (!get().apiContext.hydrated) await get().hydrateFromApi()
          await purchasingApi.deleteSupplier(id)
        }
        set((state) => ({
          suppliers: state.suppliers.filter((supplier) => supplier.id !== id),
          error: null,
        }))
      },

      addPurchaseRequest: async (data, { isOnline = false } = {}) => {
        if (isOnline && !get().apiContext.hydrated) await get().hydrateFromApi()
        const request = isOnline
          ? mapPurchaseRequestFromApi(
              await purchasingApi.createRequest(purchaseRequestToApiPayload(data))
            )
          : localRequest(data)
        set((state) => {
          const purchaseRequests = [request, ...state.purchaseRequests]
          return { purchaseRequests, stats: deriveRequestStats(purchaseRequests), error: null }
        })
        return request
      },

      updatePurchaseRequest: async (id, data, { isOnline = false } = {}) => {
        if (!isOnline) {
          set((state) => {
            const purchaseRequests = state.purchaseRequests.map((request) => (
              request.id === id ? { ...request, ...data } : request
            ))
            return { purchaseRequests, stats: deriveRequestStats(purchaseRequests) }
          })
          return get().purchaseRequests.find((request) => request.id === id)
        }
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().purchaseRequests.find((request) => request.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar la solicitud antes de editarla.')
        const request = mapPurchaseRequestFromApi(
          await purchasingApi.updateRequest(id, {
            version: current.version,
            ...purchaseRequestToApiPayload({ ...current, ...data }),
          })
        )
        set((state) => {
          const purchaseRequests = replaceById(state.purchaseRequests, request)
          return { purchaseRequests, stats: deriveRequestStats(purchaseRequests), error: null }
        })
        return request
      },

      reviewPurchaseRequest: async (id, status, reviewerId, { isOnline = false } = {}) => {
        if (!isOnline) {
          set((state) => {
            const purchaseRequests = state.purchaseRequests.map((request) => (
              request.id === id
                ? { ...request, status, reviewedAt: now(), reviewedBy: reviewerId }
                : request
            ))
            return { purchaseRequests, stats: deriveRequestStats(purchaseRequests) }
          })
          return get().purchaseRequests.find((request) => request.id === id)
        }
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().purchaseRequests.find((request) => request.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar la solicitud antes de revisarla.')
        const request = mapPurchaseRequestFromApi(
          await purchasingApi.reviewRequest(id, { version: current.version, status })
        )
        set((state) => {
          const purchaseRequests = replaceById(state.purchaseRequests, request)
          return { purchaseRequests, stats: deriveRequestStats(purchaseRequests), error: null }
        })
        return request
      },

      markRequestDelivered: async (id, { isOnline = false } = {}) => {
        if (!isOnline) {
          set((state) => {
            const purchaseRequests = state.purchaseRequests.map((request) => (
              request.id === id ? { ...request, status: 'entregada', deliveredAt: now() } : request
            ))
            return { purchaseRequests, stats: deriveRequestStats(purchaseRequests) }
          })
          return get().purchaseRequests.find((request) => request.id === id)
        }
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().purchaseRequests.find((request) => request.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar la solicitud antes de entregarla.')
        const request = mapPurchaseRequestFromApi(
          await purchasingApi.deliverRequest(id, { version: current.version })
        )
        set((state) => {
          const purchaseRequests = replaceById(state.purchaseRequests, request)
          return { purchaseRequests, stats: deriveRequestStats(purchaseRequests), error: null }
        })
        return request
      },

      updateSettings: async (data, { isOnline = false } = {}) => {
        if (!isOnline) {
          set((state) => ({ settings: { ...state.settings, ...data } }))
          return get().settings
        }
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().settings
        if (!current?.version) throw new Error('Vuelve a cargar la configuración antes de guardarla.')
        const settings = mapPurchasingSettingsFromApi(
          await purchasingApi.updateSettings(
            purchasingSettingsToApiPayload({ ...current, ...data }, current.version)
          )
        )
        set({ settings, error: null })
        return settings
      },

      getRequestStats: () => get().stats || deriveRequestStats(get().purchaseRequests),
      getRequestTotal: requestTotal,

      clearSensitive: () => set({
        suppliers: SEED_SUPPLIERS,
        purchaseRequests: SEED_REQUESTS,
        settings: SEED_SETTINGS,
        approvers: [],
        stats: deriveRequestStats(SEED_REQUESTS),
        apiContext: { hydrated: false },
        hydrating: false,
        error: null,
      }),
    }),
    {
      name: 'diedo-compras',
      storage: ephemeralJsonStorage,
      partialize: (state) => ({
        suppliers: state.suppliers,
        purchaseRequests: state.purchaseRequests,
        settings: state.settings,
        apiContext: { hydrated: false },
      }),
    }
  )
)

registerSensitiveStateCleaner(() => useComprasStore.getState().clearSensitive())
