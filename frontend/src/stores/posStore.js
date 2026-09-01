import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage, registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { WALK_IN_CUSTOMER } from '@/stores/customersStore'
import { useCatalogStore, isPosSellable } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { useSessionStore } from '@/stores/sessionStore'
import { posApi, createPosIdempotencyKey } from '@/services/posApi'
import {
  checkoutToApiPayload,
  mapCashMovementsPageFromApi,
  mapPaymentMethodsFromApi,
  mapPaymentProofMutationResponse,
  mapPosStateFromApi,
  mapQuoteFromApi,
  mapQuoteSummaryFromApi,
  mapQuotesPageFromApi,
  mapQuoteMutationResponse,
  mapReceivableFromApi,
  mapReceivableStateMutationResponse,
  mapReceivableSummaryFromApi,
  mapReceivablesPageFromApi,
  mapRegisterHistoryMutationResponse,
  mapRegisterMutationResponse,
  mapSalesPageFromApi,
  mapSaleMutationResponse,
  movementToApiPayload,
  quotePatchToApiPayload,
  quoteToApiPayload,
  receivablePatchToApiPayload,
  receivablePaymentToApiPayload,
  registerCloseToApiPayload,
  registerOpenToApiPayload,
  voidToApiPayload,
} from '@/services/adapters/pos'
import { buildShiftMovements } from '@/modules/pos/lib/caja'
import { getReceivableStatus, normalizeReceivable, getBalance } from '@/modules/pos/lib/receivables'
import {
  calculatePosTotals,
  calcSnapshotTotal,
  countSnapshotItems,
  mergeCartItems,
  snapshotCart,
  EMPTY_CART_PATCH,
} from '@/modules/pos/lib/openAccount'
import { currentSessionActor } from '@/lib/sessionActor'

const DEFAULT_CUSTOMER = WALK_IN_CUSTOMER
const now = () => new Date().toISOString()
const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const agendaReceivableId = (appointmentId) => `cxc-agenda-${appointmentId}`
const POS_PAGE_SIZE = 50

let posHydrationRequest = null
let posGeneration = 0
const mutationAttemptKeys = new Map()
const detailRequests = new Map()

const isOnlineMode = () => useSessionStore.getState().status === 'online'

function serializableAttemptPayload(value) {
  return JSON.stringify(value, (_key, current) => {
    if (typeof File !== 'undefined' && current instanceof File) {
      return { name: current.name, size: current.size, type: current.type, lastModified: current.lastModified }
    }
    return current
  })
}

function mutationAttempt(operation, payload) {
  const fingerprint = `${operation}:${serializableAttemptPayload(payload)}`
  let idempotencyKey = mutationAttemptKeys.get(fingerprint)
  if (!idempotencyKey) {
    idempotencyKey = createPosIdempotencyKey()
    mutationAttemptKeys.set(fingerprint, idempotencyKey)
  }
  return {
    idempotencyKey,
    complete: () => mutationAttemptKeys.delete(fingerprint),
  }
}

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

const EMPTY_ONLINE_REGISTER = Object.freeze({
  id: null,
  open: false,
  status: 'closed',
  branchId: null,
  openedAt: null,
  openingCash: 0,
  closedAt: null,
  version: null,
  apiSynced: true,
})

function emptyOnlineData(branchId) {
  return {
    posCatalog: [],
    register: { ...EMPTY_ONLINE_REGISTER, branchId },
    cashSales: 0,
    shiftSales: [],
    shiftIncomes: [],
    expenses: [],
    registerHistory: [],
    sales: [],
    receivables: [],
    receivableSummary: null,
    quoteSummary: null,
    registerSummary: null,
    heldCarts: [],
    openQuotes: [],
    lastCloseSummary: null,
    pagination: emptyPagination(),
  }
}

function demoServerData() {
  return {
    posCatalog: [],
    register: { open: true, openedAt: minsAgo(90), openingCash: 2000, closedAt: null },
    cashSales: 0,
    shiftSales: structuredClone(SEED_SHIFT_SALES),
    shiftIncomes: [],
    expenses: structuredClone(SEED_SHIFT_EXPENSES),
    registerHistory: [],
    sales: structuredClone(SEED_SALES),
    receivables: structuredClone(SEED_RECEIVABLES),
    receivableSummary: null,
    quoteSummary: null,
    registerSummary: null,
    heldCarts: SEED_OPEN_QUOTES.map((quote) => ({
      ...structuredClone(quote),
      heldKind: 'quote',
      label: `${quote.customer?.name || 'Sin cliente'} · Cotización`,
    })),
    openQuotes: structuredClone(SEED_OPEN_QUOTES),
    lastCloseSummary: null,
    pagination: emptyPagination(),
  }
}

function replaceById(items, next) {
  if (!next?.id) return items
  const exists = items.some((item) => item.id === next.id)
  return exists
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items]
}

function appendUniqueById(items, additions) {
  const seen = new Set(items.map((item) => item.id))
  return [...items, ...additions.filter((item) => !seen.has(item.id))]
}

function emptyPage() {
  return { page: 0, pageSize: POS_PAGE_SIZE, totalItems: 0, totalPages: 0, loading: false }
}

function emptyPagination() {
  return {
    sales: emptyPage(),
    movements: emptyPage(),
    receivables: emptyPage(),
    quotes: emptyPage(),
  }
}

function optionalRead(request) {
  return request.catch((error) => {
    if ([403, 404].includes(error?.status)) return null
    throw error
  })
}

function splitCashMovements(items) {
  const operational = items.filter((movement) => movement.movementType !== 'sale')
  return {
    shiftIncomes: operational.filter((movement) => movement.type === 'ingreso'),
    expenses: operational.filter((movement) => movement.type === 'egreso'),
  }
}

function splitQuotes(items) {
  return {
    heldCarts: items,
    openQuotes: items.filter((quote) => quote.heldKind === 'quote'),
  }
}

function updateReceivableState(items, response) {
  const patch = mapReceivableStateMutationResponse(response)
  if (!patch) return items
  return items.map((item) => item.id === patch.id ? { ...item, ...patch } : item)
}

async function refreshOnlineState(get, branchId) {
  try {
    await get().hydrateFromApi(branchId, { force: true })
  } catch {
    // The mutation already committed. Keep its response locally and expose the refresh error.
  }
}

async function loadNextOnlinePage({ key, set, get, request, mapPage, merge }) {
  if (!isOnlineMode()) return false
  const pageState = get().pagination?.[key] || emptyPage()
  if (pageState.loading || pageState.page >= pageState.totalPages) return false
  const nextPage = pageState.page + 1
  const branchId = get().branchId
  const requestGeneration = posGeneration
  set((state) => ({
    pagination: {
      ...state.pagination,
      [key]: { ...state.pagination[key], loading: true },
    },
    error: null,
  }))
  try {
    const response = await request(nextPage, pageState.pageSize || POS_PAGE_SIZE)
    const mapped = mapPage(response)
    if (requestGeneration !== posGeneration || get().branchId !== branchId) return false
    set((state) => ({
      ...merge(state, mapped.items),
      pagination: {
        ...state.pagination,
        [key]: { ...mapped.pagination, loading: false },
      },
    }))
    return true
  } catch (error) {
    if (requestGeneration === posGeneration) {
      set((state) => ({
        pagination: {
          ...state.pagination,
          [key]: { ...state.pagination[key], loading: false },
        },
        error: error.message || 'No se pudo cargar la siguiente página de Terminal POS.',
      }))
    }
    throw error
  }
}

async function runOnlineMutation({ set, get, operation, payload, request, apply }) {
  const attempt = mutationAttempt(operation, payload)
  set({ mutating: operation, error: null })
  let response
  try {
    response = await request(attempt.idempotencyKey)
    attempt.complete()
    if (apply) apply(response)
  } catch (error) {
    set({
      mutating: null,
      error: error.message || 'No se pudo completar la operación en Terminal POS.',
    })
    throw error
  }
  await refreshOnlineState(get, get().branchId)
  set((state) => ({
    mutating: state.mutating === operation ? null : state.mutating,
  }))
  return response
}

// POS store — cart + caja (register) + expenses + receivables (CxC). Persisted only in memory.
export const usePosStore = create(
  persist(
    (set, get) => ({
      // ---- cart ----
      branchId: 'charm-dn',
      items: [],
      customer: DEFAULT_CUSTOMER,
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
      activeQuoteId: null,
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
      receivableSummary: null,
      quoteSummary: null,
      registerSummary: null,
      lastCloseSummary: null,
      pagination: emptyPagination(),

      // ---- online synchronization ----
      posCatalog: [],
      apiContext: { hydrated: false, mode: 'demo', branchId: null, lastSyncedAt: null },
      hydrating: false,
      mutating: null,
      error: null,

      hydrateFromApi: async (branchOrOptions, maybeOptions = {}) => {
        const branchId = typeof branchOrOptions === 'string' ? branchOrOptions : get().branchId
        const options = typeof branchOrOptions === 'object' && branchOrOptions !== null
          ? branchOrOptions
          : maybeOptions
        const force = Boolean(options.force)
        if (!branchId || branchId === 'all') throw new Error('Selecciona una sucursal para cargar Terminal POS.')
        if (!isOnlineMode()) return null
        if (
          get().apiContext.hydrated
          && get().apiContext.branchId === branchId
          && !force
        ) {
          return get()
        }
        if (posHydrationRequest?.branchId === branchId) return posHydrationRequest.promise

        const requestGeneration = posGeneration
        const hadCurrentData = get().apiContext.hydrated && get().apiContext.branchId === branchId
        set({
          hydrating: true,
          error: null,
          apiContext: {
            ...get().apiContext,
            hydrated: hadCurrentData,
            mode: 'online',
            branchId,
          },
          ...(hadCurrentData ? {} : emptyOnlineData(branchId)),
        })

        let promise
        promise = (async () => {
          try {
            const [
              response,
              methodsResponse,
              registersResponse,
              receivablesResponse,
              receivableSummaryResponse,
              quotesResponse,
              quoteSummaryResponse,
            ] = await Promise.all([
              posApi.state({ branchId }),
              posApi.paymentMethods().catch(() => null),
              optionalRead(posApi.listRegisters({ branchId, page: 1, pageSize: POS_PAGE_SIZE })),
              optionalRead(posApi.listReceivables({ branchId, page: 1, pageSize: POS_PAGE_SIZE })),
              optionalRead(posApi.receivablesSummary({ branchId })),
              optionalRead(posApi.listQuotes({
                branchId,
                status: 'open',
                page: 1,
                pageSize: POS_PAGE_SIZE,
              })),
              optionalRead(posApi.quotesSummary({ branchId })),
            ])
            if (requestGeneration !== posGeneration || get().branchId !== branchId) return null
            const mappedResponse = registersResponse
              ? { ...response, registerHistory: registersResponse.items || [] }
              : response
            const {
              paymentMethods: stateMethods,
              ...mapped
            } = mapPosStateFromApi(mappedResponse, { branchId })
            const registerId = mapped.register?.id
            const [salesResponse, movementsResponse] = registerId
              ? await Promise.all([
                  optionalRead(posApi.listSales({
                    branchId,
                    registerId,
                    page: 1,
                    pageSize: POS_PAGE_SIZE,
                  })),
                  optionalRead(posApi.listRegisterMovements(registerId, {
                    page: 1,
                    pageSize: POS_PAGE_SIZE,
                  })),
                ])
              : [null, null]
            if (requestGeneration !== posGeneration || get().branchId !== branchId) return null

            const salesPage = mapSalesPageFromApi(salesResponse || { items: [] })
            const movementsPage = mapCashMovementsPageFromApi(movementsResponse || { items: [] })
            const receivablesPage = mapReceivablesPageFromApi(receivablesResponse || { items: [] })
            const quotesPage = mapQuotesPageFromApi(quotesResponse || { items: [] })
            const movementCollections = splitCashMovements(movementsPage.items)
            const quoteCollections = splitQuotes(quotesPage.items)
            const registerSummary = mapped.register?.id ? mapped.register.summary : null
            Object.assign(mapped, {
              sales: salesPage.items,
              shiftSales: salesPage.items,
              ...movementCollections,
              receivables: receivablesPage.items,
              receivableSummary: mapReceivableSummaryFromApi(
                receivableSummaryResponse || response.receivableSummary
              ),
              ...quoteCollections,
              quoteSummary: mapQuoteSummaryFromApi(quoteSummaryResponse),
              registerSummary,
              cashSales: registerSummary?.cashSales || 0,
              pagination: {
                sales: salesPage.pagination,
                movements: movementsPage.pagination,
                receivables: receivablesPage.pagination,
                quotes: quotesPage.pagination,
              },
            })
            const fallbackMethods = methodsResponse ? mapPaymentMethodsFromApi(methodsResponse) : []
            const methods = stateMethods.length ? stateMethods : fallbackMethods
            const catalogById = new Map(
              useCatalogStore.getState().products.map((product) => [product.id, product])
            )
            mapped.posCatalog = mapped.posCatalog.map((item) => ({
              ...catalogById.get(item.id),
              ...item,
              branchId,
              branchIds: [branchId],
            }))
            if (methods.length) useConfigStore.getState().setPaymentMethods(methods)
            const availableMethods = methods.length
              ? methods
              : useConfigStore.getState().paymentMethods
            const selectedMethod = availableMethods.some((method) => method.id === get().paymentMethod)
              ? get().paymentMethod
              : availableMethods.find((method) => method.enabled)?.id || get().paymentMethod
            set({
              ...mapped,
              paymentMethod: selectedMethod,
              hydrating: false,
              error: null,
              apiContext: {
                hydrated: true,
                mode: 'online',
                branchId,
                lastSyncedAt: now(),
              },
            })
            return mapped
          } catch (error) {
            if (requestGeneration === posGeneration) {
              set({
                hydrating: false,
                error: error.message || 'No se pudo cargar Terminal POS.',
              })
            }
            throw error
          } finally {
            if (posHydrationRequest?.promise === promise) posHydrationRequest = null
          }
        })()
        posHydrationRequest = { branchId, promise }
        return promise
      },

      loadMoreShiftSales: () => {
        const registerId = get().register?.id
        if (!registerId) return Promise.resolve(false)
        return loadNextOnlinePage({
          key: 'sales',
          set,
          get,
          request: (page, pageSize) => posApi.listSales({
            branchId: get().branchId,
            registerId,
            page,
            pageSize,
          }),
          mapPage: mapSalesPageFromApi,
          merge: (state, items) => ({
            sales: appendUniqueById(state.sales, items),
            shiftSales: appendUniqueById(state.shiftSales, items),
          }),
        })
      },

      loadMoreCashMovements: () => {
        const registerId = get().register?.id
        if (!registerId) return Promise.resolve(false)
        return loadNextOnlinePage({
          key: 'movements',
          set,
          get,
          request: (page, pageSize) => posApi.listRegisterMovements(registerId, { page, pageSize }),
          mapPage: mapCashMovementsPageFromApi,
          merge: (state, items) => {
            const collections = splitCashMovements(items)
            return {
              shiftIncomes: appendUniqueById(state.shiftIncomes, collections.shiftIncomes),
              expenses: appendUniqueById(state.expenses, collections.expenses),
            }
          },
        })
      },

      loadMoreReceivables: () => loadNextOnlinePage({
        key: 'receivables',
        set,
        get,
        request: (page, pageSize) => posApi.listReceivables({
          branchId: get().branchId,
          page,
          pageSize,
        }),
        mapPage: mapReceivablesPageFromApi,
        merge: (state, items) => ({
          receivables: appendUniqueById(state.receivables, items),
        }),
      }),

      loadMoreQuotes: () => loadNextOnlinePage({
        key: 'quotes',
        set,
        get,
        request: (page, pageSize) => posApi.listQuotes({
          branchId: get().branchId,
          status: 'open',
          page,
          pageSize,
        }),
        mapPage: mapQuotesPageFromApi,
        merge: (state, items) => {
          const collections = splitQuotes(items)
          return {
            heldCarts: appendUniqueById(state.heldCarts, collections.heldCarts),
            openQuotes: appendUniqueById(state.openQuotes, collections.openQuotes),
          }
        },
      }),

      ensureReceivableDetail: (receivableId) => {
        const current = get().receivables.find((item) => item.id === receivableId)
        if (!isOnlineMode() || current?.detailLoaded) return Promise.resolve(current || null)
        const key = `receivable:${receivableId}`
        if (detailRequests.has(key)) return detailRequests.get(key)
        const requestGeneration = posGeneration
        const branchId = get().branchId
        const request = posApi.getReceivable(receivableId)
          .then((response) => {
            const detail = mapReceivableFromApi(response)
            if (requestGeneration === posGeneration && get().branchId === branchId) {
              set((state) => ({ receivables: replaceById(state.receivables, detail) }))
            }
            return detail
          })
          .finally(() => detailRequests.delete(key))
        detailRequests.set(key, request)
        return request
      },

      ensureQuoteDetail: (quoteId) => {
        const current = get().heldCarts.find((item) => item.id === quoteId)
          || get().openQuotes.find((item) => item.id === quoteId)
        if (!isOnlineMode() || current?.detailLoaded) return Promise.resolve(current || null)
        const key = `quote:${quoteId}`
        if (detailRequests.has(key)) return detailRequests.get(key)
        const requestGeneration = posGeneration
        const branchId = get().branchId
        const request = posApi.getQuote(quoteId)
          .then((response) => {
            const detail = mapQuoteFromApi(response)
            if (requestGeneration === posGeneration && get().branchId === branchId) {
              set((state) => ({
                heldCarts: replaceById(state.heldCarts, detail),
                openQuotes: detail.heldKind === 'quote'
                  ? replaceById(state.openQuotes, detail)
                  : state.openQuotes.filter((item) => item.id !== quoteId),
              }))
            }
            return detail
          })
          .finally(() => detailRequests.delete(key))
        detailRequests.set(key, request)
        return request
      },

      resetOnlineState: () => {
        posGeneration += 1
        posHydrationRequest = null
        mutationAttemptKeys.clear()
        detailRequests.clear()
        useConfigStore.getState().resetPaymentMethods()
        set({
          branchId: 'charm-dn',
          ...demoServerData(),
          apiContext: { hydrated: false, mode: 'demo', branchId: null, lastSyncedAt: null },
          hydrating: false,
          mutating: null,
          error: null,
        })
      },

      clearError: () => set({ error: null }),

      // ---- cart actions ----
      setBranch: (branchId) => {
        if (!branchId || branchId === get().branchId) return
        if (isOnlineMode()) {
          posGeneration += 1
          posHydrationRequest = null
          detailRequests.clear()
          set({
            branchId,
            ...emptyOnlineData(branchId),
            ...EMPTY_CART_PATCH,
            customer: DEFAULT_CUSTOMER,
            cartDrawerOpen: false,
            apiContext: { hydrated: false, mode: 'online', branchId, lastSyncedAt: null },
            hydrating: false,
            error: null,
          })
          return
        }
        set({
          branchId,
          ...EMPTY_CART_PATCH,
          customer: DEFAULT_CUSTOMER,
          cartDrawerOpen: false,
        })
      },
      setCustomer: (customer) => set({ customer }),
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
          const cat = isOnlineMode()
            ? state.posCatalog.find((p) => p.id === product.id)
            : useCatalogStore.getState().products.find((p) => p.id === product.id)
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
              {
                id: product.id,
                name: product.name,
                price,
                listPrice: price,
                sku: product.sku,
                qty: 1,
                taxPct: product.taxPct ?? state.taxPct,
                type: product.type,
              },
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
          const cat = isOnlineMode()
            ? state.posCatalog.find((p) => p.id === id)
            : useCatalogStore.getState().products.find((p) => p.id === id)
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
        if (isOnlineMode()) {
          const currentQuote = s.activeQuoteId
            ? s.heldCarts.find((item) => item.id === s.activeQuoteId)
              || s.openQuotes.find((item) => item.id === s.activeQuoteId)
            : null
          if (currentQuote?.apiSynced) {
            const payload = quotePatchToApiPayload(currentQuote, {
              kind: 'held',
              branchId: s.branchId,
              customer: s.customer,
              items: s.items,
              discountMode: s.discountMode,
              discountValue: s.discountValue,
              paymentMethod: s.paymentMethod,
              paymentReference: s.paymentReference,
              notes: currentQuote.notes,
              paymentMethods: useConfigStore.getState().paymentMethods,
            })
            return runOnlineMutation({
              set,
              get,
              operation: `quote:update:${currentQuote.id}:held`,
              payload,
              request: (idempotencyKey) => posApi.updateQuote(currentQuote.id, payload, { idempotencyKey }),
              apply: (response) => {
                const held = mapQuoteMutationResponse(response)
                set((state) => ({
                  ...(held ? {
                    heldCarts: replaceById(state.heldCarts, held),
                    openQuotes: state.openQuotes.filter((quote) => quote.id !== currentQuote.id),
                  } : {}),
                  ...EMPTY_CART_PATCH,
                  customer: DEFAULT_CUSTOMER,
                }))
              },
            }).then(() => true)
          }
          const payload = quoteToApiPayload({
            ...s,
            paymentMethods: useConfigStore.getState().paymentMethods,
          }, { kind: 'parked' })
          return runOnlineMutation({
            set,
            get,
            operation: 'quote:create:parked',
            payload,
            request: (idempotencyKey) => posApi.createQuote(payload, { idempotencyKey }),
            apply: (response) => {
              const held = mapQuoteMutationResponse(response)
              set((state) => ({
                ...(held ? { heldCarts: replaceById(state.heldCarts, held) } : {}),
                ...EMPTY_CART_PATCH,
                customer: DEFAULT_CUSTOMER,
              }))
            },
          }).then(() => true)
        }
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
          activeQuoteId: held.apiSynced ? held.id : null,
          heldCarts: held.apiSynced ? s.heldCarts : s.heldCarts.filter((h) => h.id !== id),
        })
        return true
      },

      removeHeldCart: (id) => {
        const current = get().heldCarts.find((held) => held.id === id)
        if (isOnlineMode() && current?.apiSynced) {
          const payload = voidToApiPayload(current, 'Borrador cancelado desde Terminal POS')
          return runOnlineMutation({
            set,
            get,
            operation: `quote:cancel:${id}`,
            payload,
            request: (idempotencyKey) => posApi.cancelQuote(id, payload, { idempotencyKey }),
            apply: () => set((state) => ({
              heldCarts: state.heldCarts.filter((held) => held.id !== id),
              openQuotes: state.openQuotes.filter((quote) => quote.id !== id),
              activeQuoteId: state.activeQuoteId === id ? null : state.activeQuoteId,
            })),
          }).then(() => true)
        }
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
        })
        return true
      },

      saveOpenQuote: () => {
        const s = get()
        if (!s.items.length || s.isFinalized) return false
        if (isOnlineMode()) {
          const currentQuote = s.activeQuoteId
            ? s.heldCarts.find((item) => item.id === s.activeQuoteId)
              || s.openQuotes.find((item) => item.id === s.activeQuoteId)
            : null
          if (currentQuote?.apiSynced) {
            const payload = quotePatchToApiPayload(currentQuote, {
              kind: 'quote',
              branchId: s.branchId,
              customer: s.customer,
              items: s.items,
              discountMode: s.discountMode,
              discountValue: s.discountValue,
              paymentMethod: s.paymentMethod,
              paymentReference: s.paymentReference,
              notes: currentQuote.notes,
              paymentMethods: useConfigStore.getState().paymentMethods,
            })
            return runOnlineMutation({
              set,
              get,
              operation: `quote:update:${currentQuote.id}:quote`,
              payload,
              request: (idempotencyKey) => posApi.updateQuote(currentQuote.id, payload, { idempotencyKey }),
              apply: (response) => {
                const quote = mapQuoteMutationResponse(response)
                set((state) => ({
                  ...(quote ? {
                    heldCarts: replaceById(state.heldCarts, quote),
                    openQuotes: replaceById(state.openQuotes, quote),
                  } : {}),
                  ...EMPTY_CART_PATCH,
                  customer: DEFAULT_CUSTOMER,
                }))
              },
            }).then(() => true)
          }
          const payload = quoteToApiPayload({
            ...s,
            paymentMethods: useConfigStore.getState().paymentMethods,
          }, { kind: 'quote' })
          return runOnlineMutation({
            set,
            get,
            operation: 'quote:create',
            payload,
            request: (idempotencyKey) => posApi.createQuote(payload, { idempotencyKey }),
            apply: (response) => {
              const quote = mapQuoteMutationResponse(response)
              set((state) => ({
                ...(quote ? {
                  heldCarts: replaceById(state.heldCarts, quote),
                  openQuotes: replaceById(state.openQuotes, quote),
                } : {}),
                ...EMPTY_CART_PATCH,
                customer: DEFAULT_CUSTOMER,
              }))
            },
          }).then(() => true)
        }
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

      updateQuote: (id, patch) => {
        const quote = get().heldCarts.find((item) => item.id === id)
        if (!quote) return false
        if (!isOnlineMode() || !quote.apiSynced) {
          set((state) => ({
            heldCarts: state.heldCarts.map((item) => item.id === id ? { ...item, ...patch } : item),
            openQuotes: state.openQuotes.map((item) => item.id === id ? { ...item, ...patch } : item),
          }))
          return true
        }
        const payload = quotePatchToApiPayload(quote, {
          ...patch,
          paymentMethods: useConfigStore.getState().paymentMethods,
        })
        return runOnlineMutation({
          set,
          get,
          operation: `quote:update:${id}`,
          payload,
          request: (idempotencyKey) => posApi.updateQuote(id, payload, { idempotencyKey }),
          apply: (response) => {
            const updated = mapQuoteMutationResponse(response)
            if (!updated) return
            set((state) => ({
              heldCarts: replaceById(state.heldCarts, updated),
              openQuotes: updated.heldKind === 'quote'
                ? replaceById(state.openQuotes, updated)
                : state.openQuotes.filter((item) => item.id !== id),
            }))
          },
        })
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
          activeQuoteId: quote.apiSynced ? quote.id : null,
        })
        return true
      },

      addOpenAccountToCart: (customerId) => {
        const s = get()
        const quote = s.openQuotes.find((q) => q.customer?.id === customerId)
        const receivables = s.receivables.filter(
          (r) => r.customer?.id === customerId
            && !['paid', 'voided', 'written_off'].includes(getReceivableStatus(r))
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
          (r) => r.customer?.id === customerId
            && !['paid', 'voided', 'written_off'].includes(getReceivableStatus(r))
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

      removeOpenQuote: (customerId) => {
        const quote = get().openQuotes.find((item) => (
          item.id === customerId || item.customer?.id === customerId
        ))
        if (isOnlineMode() && quote?.apiSynced) return get().removeHeldCart(quote.id)
        set((s) => ({
          openQuotes: s.openQuotes.filter((q) => q.customer?.id !== customerId && q.id !== customerId),
        }))
        return true
      },

      getCustomerDebtSummary: (customerId) => {
        if (!customerId || customerId === 'walk-in') return null
        const s = get()
        const receivables = s.receivables.filter(
          (r) => r.customer?.id === customerId
            && !['paid', 'voided', 'written_off'].includes(getReceivableStatus(r))
        )
        const receivableBalance = receivables.reduce((sum, r) => sum + getBalance(r), 0)
        const openQuote = s.openQuotes.find((q) => q.customer?.id === customerId)
        const quoteTotal = openQuote
          ? openQuote.total != null
            ? Number(openQuote.total) || 0
            : calcSnapshotTotal({ ...openQuote, taxPct: s.taxPct })
          : 0
        const quoteItemCount = openQuote ? countSnapshotItems(openQuote.items) : 0
        const receivableItemCount = receivables.reduce(
          (n, r) => n + (r.items?.reduce((sum, i) => sum + (Number(i.qty) || 1), 0) || 1),
          0
        )
        const total = receivableBalance
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
        if (get().quoteSummary?.openTotal != null) {
          return Number(get().quoteSummary.openTotal) || 0
        }
        const taxPct = get().taxPct
        return get().openQuotes.reduce(
          (sum, quote) => sum + (
            quote.total != null
              ? Number(quote.total) || 0
              : calcSnapshotTotal({ ...quote, taxPct })
          ),
          0
        )
      },

      // ---- caja actions ----
      openRegister: (openingCash) => {
        if (isOnlineMode()) {
          const payload = registerOpenToApiPayload({
            branchId: get().branchId,
            openingCash,
          })
          return runOnlineMutation({
            set,
            get,
            operation: `register:open:${get().branchId}`,
            payload,
            request: (idempotencyKey) => posApi.openRegister(payload, { idempotencyKey }),
            apply: (response) => {
              const register = mapRegisterMutationResponse(response, get().branchId)
              set({
                register,
                registerSummary: register.summary || null,
                cashSales: register.summary?.cashSales || 0,
                shiftSales: [],
                shiftIncomes: [],
                expenses: [],
                lastCloseSummary: null,
                pagination: emptyPagination(),
              })
            },
          })
        }
        set({
          register: { open: true, openedAt: now(), openingCash: Number(openingCash) || 0, closedAt: null },
          cashSales: 0,
          shiftSales: [],
          shiftIncomes: [],
          expenses: [],
          lastCloseSummary: null,
        })
        return get().register
      },
      closeRegister: (actualCash) => {
        const countedCash = Number(actualCash)
        if (
          actualCash === null
          || actualCash === undefined
          || actualCash === ''
          || !Number.isFinite(countedCash)
          || countedCash < 0
        ) {
          return Promise.reject(new Error('Ingresa el efectivo contado para cerrar la caja.'))
        }
        if (isOnlineMode()) {
          const register = get().register
          if (!register?.id) return Promise.reject(new Error('No hay una caja sincronizada para cerrar.'))
          const mapCloseSummary = (response) => mapRegisterHistoryMutationResponse(
            response,
            get().branchId
          )
          const payload = registerCloseToApiPayload(register, countedCash)
          return runOnlineMutation({
            set,
            get,
            operation: `register:close:${register.id}`,
            payload,
            request: (idempotencyKey) => posApi.closeRegister(register.id, payload, { idempotencyKey }),
            apply: (response) => {
              const closed = mapRegisterMutationResponse(response, get().branchId)
              const summary = mapCloseSummary(response)
              set({
                register: { ...closed, open: false },
                registerSummary: closed.summary || null,
                lastCloseSummary: summary,
              })
            },
          }).then((response) => {
            const summary = mapCloseSummary(response)
            set({ lastCloseSummary: summary })
            return response
          })
        }
        set((s) => {
          const activeSales = s.shiftSales.filter((sale) => sale.status !== 'voided')
          const cashExpenses = s.expenses.reduce((a, e) => a + e.amount, 0)
          const cashIncomes = s.shiftIncomes.reduce((a, i) => a + i.amount, 0)
          const expected = s.register.openingCash + s.cashSales + cashIncomes - cashExpenses
          const totalSales = activeSales.reduce((a, sale) => a + sale.total, 0)
          const summary = {
            openingCash: s.register.openingCash,
            branchId: s.branchId,
            cashSales: s.cashSales,
            cashIncomes,
            expenses: cashExpenses,
            totalSales,
            salesCount: activeSales.length,
            expected,
            actual: countedCash,
            difference: countedCash - expected,
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
        })
        return get().lastCloseSummary
      },
      addIncome: ({ concept, amount, method, reference }) => {
        if (isOnlineMode()) {
          const register = get().register
          if (!register?.id) return Promise.reject(new Error('Abre la caja antes de registrar movimientos.'))
          const data = { concept, amount, method, reference }
          const payload = movementToApiPayload(data, {
            ...get(),
            paymentMethods: useConfigStore.getState().paymentMethods,
          }, 'income')
          return runOnlineMutation({
            set,
            get,
            operation: `register:movement:income:${register.id}`,
            payload,
            request: (idempotencyKey) => posApi.createRegisterMovement(register.id, payload, { idempotencyKey }),
          })
        }
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
        })
        return true
      },
      addExpense: ({ concept, amount, items, method, reference }) => {
        if (isOnlineMode()) {
          const register = get().register
          if (!register?.id) return Promise.reject(new Error('Abre la caja antes de registrar movimientos.'))
          const data = { concept, amount, method, reference, items }
          const payload = movementToApiPayload(data, {
            ...get(),
            paymentMethods: useConfigStore.getState().paymentMethods,
          }, 'expense')
          return runOnlineMutation({
            set,
            get,
            operation: `register:movement:expense:${register.id}`,
            payload,
            request: (idempotencyKey) => posApi.createRegisterMovement(register.id, payload, { idempotencyKey }),
          })
        }
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
        }))
        return true
      },

      recordSale: ({ total, method, customer, reference, items, subtotal, discountAmt, discountPct, taxPct, taxAmt }) => {
        if (isOnlineMode()) {
          const data = { total, method, customer, reference, items, subtotal, discountAmt, discountPct, taxPct, taxAmt }
          const state = {
            ...get(),
            paymentMethods: useConfigStore.getState().paymentMethods,
          }
          const payload = checkoutToApiPayload(data, state)
          return runOnlineMutation({
            set,
            get,
            operation: 'checkout',
            payload,
            request: (idempotencyKey) => posApi.checkout(payload, { idempotencyKey }),
            apply: (response) => {
              const sale = mapSaleMutationResponse(response)
              if (!sale) return
              set((current) => ({
                sales: replaceById(current.sales, sale),
                shiftSales: current.register.open
                  ? replaceById(current.shiftSales, sale)
                  : current.shiftSales,
              }))
            },
          })
        }
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
          soldBy: currentSessionActor().name,
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

      voidSale: (id, reason) => {
        const sale = get().sales.find((item) => item.id === id)
          || get().shiftSales.find((item) => item.id === id)
        if (!sale) return false
        if (!isOnlineMode() || !sale.apiSynced) {
          set((state) => ({
            sales: state.sales.map((item) => item.id === id ? { ...item, status: 'voided' } : item),
            shiftSales: state.shiftSales.map((item) => item.id === id ? { ...item, status: 'voided' } : item),
            cashSales: sale.status !== 'voided' && sale.method === 'efectivo'
              ? Math.max(0, state.cashSales - sale.total)
              : state.cashSales,
          }))
          return true
        }
        const payload = voidToApiPayload(sale, reason || 'Venta anulada desde Terminal POS')
        return runOnlineMutation({
          set,
          get,
          operation: `sale:void:${id}`,
          payload,
          request: (idempotencyKey) => posApi.voidSale(id, payload, { idempotencyKey }),
          apply: () => set((state) => {
            const cashDelta = sale.status !== 'voided' && sale.method === 'efectivo' ? sale.total : 0
            return {
              sales: state.sales.map((item) => item.id === id ? { ...item, status: 'voided' } : item),
              shiftSales: state.shiftSales.map((item) => item.id === id ? { ...item, status: 'voided' } : item),
              cashSales: Math.max(0, state.cashSales - cashDelta),
              register: cashDelta && state.register.expectedCash != null
                ? { ...state.register, expectedCash: state.register.expectedCash - cashDelta }
                : state.register,
            }
          }),
        })
      },

      updateReceivable: (id, data) => {
        const current = get().receivables.find((receivable) => receivable.id === id)
        if (!current) return false
        if (isOnlineMode() && current.apiSynced) {
          const payload = receivablePatchToApiPayload(current, data)
          return runOnlineMutation({
            set,
            get,
            operation: `receivable:update:${id}`,
            payload,
            request: (idempotencyKey) => posApi.updateReceivable(id, payload, { idempotencyKey }),
            apply: (response) => set((state) => ({
              receivables: updateReceivableState(state.receivables, response),
            })),
          })
        }
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
        }))
        return true
      },

      syncAppointmentReceivable: (appointment) => {
        if (isOnlineMode()) return
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
        if (isOnlineMode()) return
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
        const receivable = get().receivables.find((item) => item.id === id)
        if (isOnlineMode() && receivable?.apiSynced) {
          const data = { amount: paymentAmount, method, reference, note, proof }
          const payload = receivablePaymentToApiPayload(receivable, data, {
            ...get(),
            paymentMethods: useConfigStore.getState().paymentMethods,
          })
          return runOnlineMutation({
            set,
            get,
            operation: `receivable:payment:${id}`,
            payload,
            request: (idempotencyKey) => posApi.createReceivablePayment(id, payload, { idempotencyKey }),
            apply: (response) => set((state) => ({
              receivables: updateReceivableState(state.receivables, response),
            })),
          })
        }
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
        return true
      },

      markReceivablePaid: (id, method = 'efectivo', extra = {}) => {
        const r = get().receivables.find((x) => x.id === id)
        if (!r || getReceivableStatus(r) === 'paid') return
        const balance = Math.max(0, r.amount - (r.payments || []).reduce((sum, p) => sum + p.amount, 0))
        const note = method === 'efectivo' ? 'Cobro completo (efectivo)' : 'Pago confirmado'
        const result = get().addReceivablePayment(id, {
          amount: balance,
          method,
          note,
          proof: extra.proof || null,
          reference: extra.reference || null,
        })
        if (extra.proof && !isOnlineMode()) {
          set((s) => ({
            receivables: s.receivables.map((x) =>
              x.id === id ? { ...x, proof: extra.proof, reference: extra.reference || x.reference } : x
            ),
          }))
        }
        return result
      },

      attachReceivableProof: (id, payload) => {
        if (isOnlineMode()) {
          const receivable = get().receivables.find((item) => item.id === id)
          const file = payload?.proof
          if (!receivable?.apiSynced) return Promise.reject(new Error('La cuenta no está sincronizada.'))
          if (!(typeof File !== 'undefined' && file instanceof File)) {
            return Promise.reject(new Error('Selecciona un comprobante para subir.'))
          }
          const apiPayload = {
            file,
          }
          return runOnlineMutation({
            set,
            get,
            operation: `receivable:proof:${id}`,
            payload: apiPayload,
            request: (idempotencyKey) => posApi.uploadReceivableProof(
              id,
              apiPayload,
              { idempotencyKey }
            ),
            apply: (response) => {
              const proof = mapPaymentProofMutationResponse(response)
              if (proof) {
                set((state) => ({
                  receivables: state.receivables.map((item) => (
                    item.id === id ? { ...item, proof } : item
                  )),
                }))
              }
            },
          })
        }
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
        }))
        return true
      },

      voidReceivable: (id, reason) => {
        const receivable = get().receivables.find((item) => item.id === id)
        if (!receivable) return false
        if (!isOnlineMode() || !receivable.apiSynced) {
          set((state) => ({ receivables: state.receivables.filter((item) => item.id !== id) }))
          return true
        }
        const payload = voidToApiPayload(receivable, reason || 'Cuenta anulada desde Terminal POS')
        return runOnlineMutation({
          set,
          get,
          operation: `receivable:void:${id}`,
          payload,
          request: (idempotencyKey) => posApi.voidReceivable(id, payload, { idempotencyKey }),
          apply: () => set((state) => ({
            receivables: state.receivables.map((item) => (
              item.id === id ? { ...item, status: 'voided', balance: 0 } : item
            )),
          })),
        })
      },

      deleteReceivable: (id) => get().voidReceivable(id),

      reversePayment: (paymentId, reason) => {
        let currentPayment = null
        for (const receivable of get().receivables) {
          currentPayment = receivable.payments?.find((payment) => payment.id === paymentId)
          if (currentPayment) break
        }
        if (!currentPayment) return false
        if (!isOnlineMode()) {
          set((state) => ({
            receivables: state.receivables.map((receivable) => normalizeReceivable({
              ...receivable,
              payments: (receivable.payments || []).filter((payment) => payment.id !== paymentId),
            })),
          }))
          return true
        }
        const payload = voidToApiPayload(currentPayment, reason || 'Pago reversado desde Terminal POS')
        return runOnlineMutation({
          set,
          get,
          operation: `payment:reverse:${paymentId}`,
          payload,
          request: (idempotencyKey) => posApi.reversePayment(paymentId, payload, { idempotencyKey }),
          apply: (response) => set((state) => ({
            receivables: updateReceivableState(state.receivables, response).map((receivable) => ({
              ...receivable,
              payments: (receivable.payments || []).map((payment) => (
                payment.id === paymentId
                  ? { ...payment, status: 'reversed', reversed: true }
                  : payment
              )),
            })),
          })),
        })
      },

      downloadPaymentProof: (proof) => posApi.downloadProof(proof),

      clearSensitive: () => {
        posGeneration += 1
        posHydrationRequest = null
        mutationAttemptKeys.clear()
        detailRequests.clear()
        useConfigStore.getState().resetPaymentMethods()
        set({
          branchId: 'charm-dn',
          customer: DEFAULT_CUSTOMER,
          ...EMPTY_CART_PATCH,
          cartDrawerOpen: false,
          ...emptyOnlineData('charm-dn'),
          apiContext: { hydrated: false, mode: 'cleared', branchId: null, lastSyncedAt: null },
          hydrating: false,
          mutating: null,
          error: null,
        })
      },

      // ---- selectors ----
      getSubtotal: () => calculatePosTotals(get()).subtotal,
      getDiscountAmount: () => calculatePosTotals(get()).discountAmount,
      getDiscountPct: () => {
        const sub = get().getSubtotal()
        if (get().discountMode === 'amount') return sub > 0 ? Math.min(100, (Math.min(sub, get().discountValue) / sub) * 100) : 0
        return Math.min(100, Math.max(0, get().discountValue))
      },
      getTaxAmount: () => calculatePosTotals(get()).taxAmount,
      getTotal: () => calculatePosTotals(get()).total,
      getItemCount: () => get().items.reduce((sum, i) => sum + i.qty, 0),
      getCashExpenses: () => get().registerSummary?.cashExpenses != null
        ? Number(get().registerSummary.cashExpenses) || 0
        : get().expenses.reduce((a, e) => a + e.amount, 0),
      getCashIncomes: () => get().registerSummary?.manualIncome != null
        ? Number(get().registerSummary.manualIncome) || 0
        : get().shiftIncomes.reduce((a, i) => a + i.amount, 0),
      getCashInDrawer: () => {
        const s = get()
        if (s.register?.apiSynced && s.register.expectedCash != null) {
          return Number(s.register.expectedCash) || 0
        }
        return s.register.openingCash + s.cashSales + s.getCashIncomes() - s.getCashExpenses()
      },
      getShiftSalesTotal: () => get().registerSummary?.totalSales != null
        ? Number(get().registerSummary.totalSales) || 0
        : get().shiftSales
          .filter((sale) => sale.status !== 'voided')
          .reduce((a, sale) => a + sale.total, 0),
      getShiftMovements: () => {
        const { shiftSales, shiftIncomes, expenses } = get()
        return buildShiftMovements({
          shiftSales: shiftSales.filter((sale) => sale.status !== 'voided'),
          shiftIncomes,
          expenses,
        })
      },
      getPendingReceivables: () => get().receivables.filter(
        (r) => !['paid', 'voided', 'written_off'].includes(getReceivableStatus(r))
      ),
      getPendingTotal: () =>
        get().receivableSummary?.pendingTotal != null
          ? Number(get().receivableSummary.pendingTotal) || 0
          : get()
          .receivables.filter((r) => !['paid', 'voided', 'written_off'].includes(getReceivableStatus(r)))
          .reduce((a, r) => {
            const paid = (r.payments || []).reduce((s, p) => s + p.amount, 0)
            return a + Math.max(0, r.amount - paid)
          }, 0),
    }),
    {
      name: 'diedo-pos',
      storage: ephemeralJsonStorage,
      version: 8,
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
        if (state.activeQuoteId == null) state.activeQuoteId = null
        state.apiContext = { hydrated: false, mode: 'demo', branchId: null, lastSyncedAt: null }
        state.hydrating = false
        state.mutating = null
        state.error = null
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
        documentKind: s.documentKind,
        isFinalized: s.isFinalized,
        discountMode: s.discountMode,
        discountValue: s.discountValue,
        paymentMethod: s.paymentMethod,
        paymentReference: s.paymentReference,
        isExpense: s.isExpense,
        activeQuoteId: s.activeQuoteId,
        apiContext: { hydrated: false, mode: 'demo', branchId: null, lastSyncedAt: null },
      }),
    }
  )
)

registerSensitiveStateCleaner(() => usePosStore.getState().clearSensitive())

useSessionStore.subscribe((state, previousState) => {
  if (state.status === previousState.status) return
  if (state.status === 'online') {
    usePosStore.getState().clearSensitive()
  } else if (state.status === 'demo') {
    usePosStore.getState().resetOnlineState()
  }
})
