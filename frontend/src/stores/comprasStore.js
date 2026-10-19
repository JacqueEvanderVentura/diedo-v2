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
import {
  mergePurchaseRequestExtras,
  savePurchaseRequestExtras,
} from '@/modules/compras/lib/purchaseRequestExtras'
import { uploadPurchaseQuote } from '@/lib/documentAttachments'
import { receivePurchaseRequestInventory } from '@/modules/compras/lib/receivePurchaseInventory'

const genId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const EMPTY_SETTINGS = { approverUserId: null, notifyOnRequest: true }
const API_UNAVAILABLE = 'La API no está disponible.'

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

export const useComprasStore = create(
  persist(
    (set, get) => ({
      suppliers: [],
      purchaseRequests: [],
      settings: EMPTY_SETTINGS,
      approvers: [],
      stats: deriveRequestStats([]),
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
            const purchaseRequests = (requestResponse.items || [])
              .map(mapPurchaseRequestFromApi)
              .map(mergePurchaseRequestExtras)
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
        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const supplier = mapSupplierFromApi(
          await purchasingApi.createSupplier(supplierToApiPayload(data))
        )
        set((state) => ({ suppliers: [supplier, ...state.suppliers], error: null }))
        return supplier
      },

      updateSupplier: async (id, data, { isOnline = false } = {}) => {
        if (!isOnline) throw new Error(API_UNAVAILABLE)
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
        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const request = mergePurchaseRequestExtras(mapPurchaseRequestFromApi(
          await purchasingApi.createRequest(purchaseRequestToApiPayload(data))
        ))
        savePurchaseRequestExtras(request.id, {
          quoteFile: data.quoteFile,
          items: data.items,
        })
        set((state) => {
          const purchaseRequests = [request, ...state.purchaseRequests]
          return { purchaseRequests, stats: deriveRequestStats(purchaseRequests), error: null }
        })
        return request
      },

      updatePurchaseRequest: async (id, data, { isOnline = false } = {}) => {
        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        const current = get().purchaseRequests.find((request) => request.id === id)
        if (!current?.version) throw new Error('Vuelve a cargar la solicitud antes de editarla.')
        const request = mergePurchaseRequestExtras(mapPurchaseRequestFromApi(
          await purchasingApi.updateRequest(id, {
            version: current.version,
            ...purchaseRequestToApiPayload({ ...current, ...data }),
          })
        ))
        savePurchaseRequestExtras(request.id, {
          quoteFile: data.quoteFile ?? current.quoteFile,
          items: data.items ?? current.items,
        })
        set((state) => {
          const purchaseRequests = replaceById(state.purchaseRequests, request)
          return { purchaseRequests, stats: deriveRequestStats(purchaseRequests), error: null }
        })
        return request
      },

      attachPurchaseQuote: async (id, quoteFile, { isOnline = false } = {}) => {
        if (!isOnline) throw new Error(API_UNAVAILABLE)
        const current = get().purchaseRequests.find((request) => request.id === id)
        if (!current) throw new Error('Solicitud no encontrada.')
        if (current.version) {
          if (quoteFile?.pendingFile) {
            await uploadPurchaseQuote(id, quoteFile)
            await get().hydrateFromApi({ force: true })
            return get().purchaseRequests.find((request) => request.id === id)
          }
          return get().updatePurchaseRequest(id, { quoteFile }, { isOnline: true })
        }
        throw new Error('Vuelve a cargar la solicitud antes de adjuntar la cotización.')
      },

      reviewPurchaseRequest: async (id, status, reviewerId, { isOnline = false } = {}) => {
        if (!isOnline) throw new Error(API_UNAVAILABLE)
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
        const current = mergePurchaseRequestExtras(
          get().purchaseRequests.find((request) => request.id === id) || null
        )
        if (!current) throw new Error('Solicitud no encontrada.')
        const inventoryResult = await receivePurchaseRequestInventory(current, { isOnline })

        if (!isOnline) throw new Error(API_UNAVAILABLE)
        if (!get().apiContext.hydrated) await get().hydrateFromApi()
        if (!current.version) throw new Error('Vuelve a cargar la solicitud antes de entregarla.')
        const request = mergePurchaseRequestExtras(mapPurchaseRequestFromApi(
          await purchasingApi.deliverRequest(id, { version: current.version })
        ))
        set((state) => {
          const purchaseRequests = replaceById(state.purchaseRequests, request)
          return { purchaseRequests, stats: deriveRequestStats(purchaseRequests), error: null }
        })
        return { request, inventoryResult }
      },

      updateSettings: async (data, { isOnline = false } = {}) => {
        if (!isOnline) throw new Error(API_UNAVAILABLE)
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
        suppliers: [],
        purchaseRequests: [],
        settings: EMPTY_SETTINGS,
        approvers: [],
        stats: deriveRequestStats([]),
        apiContext: { hydrated: false },
        hydrating: false,
        error: null,
      }),
    }),
    {
      name: 'diedo-compras',
      storage: ephemeralJsonStorage,
      version: 2,
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
