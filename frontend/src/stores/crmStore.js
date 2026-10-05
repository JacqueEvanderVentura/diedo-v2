import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'
import { registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { currentSessionActor } from '@/lib/sessionActor'
import { recordSerpUsage } from '@/modules/crm/lib/serpQuota'
import { isDiscoveryLeadSource } from '@/data/crm'
import { useCustomersStore } from '@/stores/customersStore'
import { useSessionStore } from '@/stores/sessionStore'
import { crmApi } from '@/services/crmApi'
import { readAllPages } from '@/services/pagination'
import {
  mapActivityFromApi,
  mapActivitiesPageFromApi,
  mapCrmCustomerFromApi,
  mapCrmCustomersPageFromApi,
  mapCrmOverviewFromApi,
  mapCrmQuoteFromApi,
  mapCrmQuotesPageFromApi,
  mapQuotesPaginatedFromApi,
  mapCrmSalesPageFromApi,
  mapCrmStateFromApi,
  mapLeadFromApi,
  mapLeadsPageFromApi,
  mapLeadsPaginatedFromApi,
} from '@/services/adapters/crm'
import {
  CRM_INFINITE_PAGE_SIZE,
  DEFAULT_CRM_PAGE_SIZE,
  normalizeCrmPageSize,
} from '@/modules/crm/constants/paging'
import {
  emptyListMeta,
  listMetaFromPaginated,
} from '@/modules/crm/lib/crmListLoading'
import {
  SIMPLIFIED_WORKSPACE_STAGES,
  buildSimplifiedLeadQuery,
  countSimplifiedWorkspaceStageCounts,
  filterLeadsForSimplifiedWorkspace,
  leadsMatchingSimplifiedWorkspaceFilters,
  needsSimplifiedWorkspaceClientFilter,
} from '@/modules/crm/lib/simplifiedWorkspaceQuery'
import { formatLeadStageMoveTitle } from '@/modules/crm/lib/leadStageLabels'
import { paginateSlice } from '@/modules/reportes/lib/pagination'
import { appendQuoteRevision } from '@/modules/crm/lib/quoteRevisions'
import { matchesBranches } from '@/lib/branches'
import { resolvePeriodRange } from '@/lib/datePeriod'
import {
  buildDemoSaleFromPipeline,
  findBillableQuote,
  sumQuoteLines,
  validatePipelineClose,
} from '@/modules/crm/lib/pipelineInvoice'
import {
  findQuoteReceivable,
  invoiceCollectionFromSalePolicy,
  invoiceCollectionStatusFromMethod,
  mergeInvoiceCollection,
  resolveQuoteInvoicePaymentMethod,
} from '@/modules/crm/lib/quoteInvoice'
import { buildLeadConvertRequest, buildLeadOfflineCustomer } from '@/modules/crm/lib/leadConversion'
import { PIPELINE_OPEN_STAGES } from '@/modules/crm/lib/pipelineLeads'
import {
  effectiveLeadCustomerId,
  resolveCustomerForLead,
} from '@/modules/crm/lib/leadCustomer'
import {
  mapCheckoutFromApi,
  mapReceivablesPageFromApi,
  mapSaleFromApi,
} from '@/services/adapters/pos'
import { useConfigStore } from '@/stores/configStore'
import { syncWorkspacePaymentMethods } from '@/lib/paymentMethodsSync'
import { canAccessCrmCommerce } from '@/services/moduleAvailability'

const saleDetailRequests = new Map()
const quoteDetailRequests = new Map()
let crmGeneration = 0

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const isOnline = () => useSessionStore.getState().status === 'online'
const crmCommerceEnabled = () => {
  const session = useSessionStore.getState()
  if (session.status === 'demo') return true
  return canAccessCrmCommerce(session.user?.enabledModules, session.user?.effectivePermissionCodes)
}
const emptyCrmPage = () => ({ items: [] })

function replaceById(items, entity) {
  return items.map((item) => (item.id === entity.id ? entity : item))
}

function upsertById(items, entities) {
  const map = new Map(items.map((item) => [item.id, item]))
  entities.forEach((entity) => {
    if (entity?.id) map.set(entity.id, entity)
  })
  return [...map.values()]
}

function leadPayload(data) {
  return {
    branchId: data.branchId,
    name: data.name || '',
    company: data.company || '',
    email: data.email || null,
    phone: data.phone || null,
    website: data.website || null,
    instagramUrl: data.instagramUrl || null,
    location: data.location || null,
    source: data.source || 'manual',
    acquisitionSource: data.acquisitionSource || null,
    sourceUrl: data.sourceUrl || null,
    scrapedAt: data.scrapedAt || null,
    rawSnippet: data.rawSnippet || null,
    status: data.status || 'nuevo',
    starRating: data.starRating ?? null,
  }
}

function reportMutationError(set, error) {
  set({ error })
  return null
}

async function loadOnlineSection(section) {
  switch (section) {
    case 'overview': {
      const response = await crmApi.overview()
      return { overview: mapCrmOverviewFromApi(response) }
    }
    case 'leads': {
      const pageSize = DEFAULT_CRM_PAGE_SIZE
      const [leadsRes, discoveryCapabilities] = await Promise.all([
        crmApi.leads({ page: 1, pageSize }),
        crmApi.discoveryCapabilities(),
      ])
      const leadsMapped = mapLeadsPaginatedFromApi(leadsRes)
      return {
        leads: leadsMapped.items,
        leadsListMeta: listMetaFromPaginated(leadsMapped, { pageSize }),
        discoveryCapabilities,
      }
    }
    case 'pipeline': {
      const [leadsRes, quotes] = await Promise.all([
        crmApi.leads({ page: 1, pageSize: CRM_INFINITE_PAGE_SIZE }),
        crmCommerceEnabled() ? readAllPages(crmApi.quotes) : emptyCrmPage(),
        syncWorkspacePaymentMethods(),
      ])
      const leadsMapped = mapLeadsPaginatedFromApi(leadsRes)
      return {
        quotes: mapCrmQuotesPageFromApi(quotes),
        leads: leadsMapped.items,
        leadsListMeta: listMetaFromPaginated(leadsMapped),
      }
    }
    case 'activities': {
      const activities = await readAllPages(crmApi.activities)
      return {
        activities: mapActivitiesPageFromApi(activities),
      }
    }
    case 'customers': {
      const pageSize = CRM_INFINITE_PAGE_SIZE
      const [salesRes, quotesRes, leadsRes, activitiesRes] = await Promise.all([
        crmCommerceEnabled() ? crmApi.sales({ page: 1, pageSize }) : emptyCrmPage(),
        crmCommerceEnabled() ? crmApi.quotes({ page: 1, pageSize: 100 }) : emptyCrmPage(),
        crmApi.leads({ page: 1, pageSize }),
        crmApi.activities({ page: 1, pageSize: 100 }),
      ])
      const leadsMapped = mapLeadsPaginatedFromApi(leadsRes)
      const result = {
        leads: leadsMapped.items,
        activities: mapActivitiesPageFromApi(activitiesRes),
      }
      if (crmCommerceEnabled()) {
        result.sales = mapCrmSalesPageFromApi(salesRes)
        result.quotes = mapCrmQuotesPageFromApi(quotesRes)
      }
      return result
    }
    case 'quotes': {
      if (!crmCommerceEnabled()) {
        return {}
      }
      await syncWorkspacePaymentMethods().catch(() => [])
      return {}
    }
    case 'purchases': {
      if (!crmCommerceEnabled()) {
        return {}
      }
      const [sales, customers] = await Promise.all([
        readAllPages(crmApi.sales),
        readAllPages(crmApi.customers),
      ])
      return {
        sales: mapCrmSalesPageFromApi(sales),
        customers: mapCrmCustomersPageFromApi(customers),
      }
    }
    case 'sales': {
      if (!crmCommerceEnabled()) {
        return {}
      }
      const sales = await readAllPages(crmApi.sales)
      return { sales: mapCrmSalesPageFromApi(sales) }
    }
    case 'workspace': {
      const workspace = await crmApi.workspaceSettings()
      return {
        uiMode: workspace.uiMode || 'standard',
        uiModeVersion: workspace.version || 1,
        workspaceSettingsLoaded: true,
        workspaceSettingsSynced: true,
      }
    }
    default:
      throw new Error(`Sección CRM desconocida: ${section}`)
  }
}

function mergeWorkspaceSettings(current, { uiMode, version }, { authoritative = false } = {}) {
  const incomingVersion = version || 1
  const incomingMode = uiMode || 'standard'
  if (authoritative) {
    return {
      uiMode: incomingMode,
      uiModeVersion: incomingVersion,
      workspaceSettingsLoaded: true,
      workspaceSettingsSynced: true,
    }
  }
  const currentVersion = current.uiModeVersion || 1
  if (incomingVersion < currentVersion) {
    return {
      uiMode: current.uiMode || 'standard',
      uiModeVersion: currentVersion,
      workspaceSettingsLoaded: true,
      workspaceSettingsSynced: current.workspaceSettingsSynced,
    }
  }
  return {
    uiMode: incomingMode,
    uiModeVersion: incomingVersion,
    workspaceSettingsLoaded: true,
    workspaceSettingsSynced: true,
  }
}

function workspaceFieldsFromSnapshot(current, snapshot, options) {
  if (!snapshot) return {}
  const version = snapshot.uiModeVersion ?? snapshot.version
  if (version == null && snapshot.uiMode == null) return {}
  return mergeWorkspaceSettings(
    current,
    { uiMode: snapshot.uiMode, version },
    options
  )
}

function isWorkspaceSettingsVersionConflict(error) {
  return error?.status === 409 || error?.parameter === 'version'
}

function normalizeLead(raw) {
  const starRating = raw.starRating ?? null
  return {
    id: raw.id || genId('lead'),
    name: raw.name || '',
    company: raw.company ?? raw.name ?? '',
    email: raw.email || null,
    phone: raw.phone || null,
    website: raw.website || null,
    instagramUrl: raw.instagramUrl || null,
    location: raw.location || '',
    source: raw.source || 'manual',
    acquisitionSource:
      raw.acquisitionSource || (isDiscoveryLeadSource(raw.source) ? 'ai' : null),
    sourceUrl: raw.sourceUrl || null,
    scrapedAt: raw.scrapedAt || null,
    rawSnippet: raw.rawSnippet || '',
    status: raw.status || 'nuevo',
    starRating: starRating == null || starRating === '' ? null : Number(starRating),
    branchId: raw.branchId || 'charm-dn',
    assignedUserId: raw.assignedUserId || currentSessionActor().id,
    createdAt: raw.createdAt || now(),
    updatedAt: raw.updatedAt || now(),
    customerId: raw.customerId || null,
    pipelineValue: Number(raw.pipelineValue) || 0,
    lostReason: raw.lostReason || null,
    pipelineClosedAt: raw.pipelineClosedAt || null,
    version: raw.version || 1,
  }
}

const RAW_SEED_LEADS = [
  { name: 'Glamour Studio RD', company: 'Glamour Studio', location: 'Santo Domingo', rawSnippet: 'Salón de belleza con citas y venta de productos', source: 'serp', acquisitionSource: 'instagram', status: 'propuesta', pipelineValue: 45000, phone: '809-555-1001', customerId: 'c2' },
  { name: 'Spa Zen Caribe', company: 'Spa Zen', location: 'Piantini, SD', rawSnippet: 'Spa wellness masajes faciales reservas online', source: 'serp', acquisitionSource: 'whatsapp', status: 'negociacion', pipelineValue: 78000, phone: '809-555-1002' },
  { name: 'Clínica Dental Sonrisa', company: 'Dental Sonrisa', location: 'Santiago', rawSnippet: 'Consultorio dental citas pacientes', source: 'referral', acquisitionSource: 'referral', status: 'nuevo', phone: '809-555-1003', branchId: 'charm-santiago' },
  { name: 'Café Colonial', company: 'Café Colonial', location: 'Zona Colonial', rawSnippet: 'Restaurante café comida rápida POS', source: 'manual', acquisitionSource: 'pos_walk_in', status: 'nuevo', branchId: 'charm-este' },
  { name: 'Boutique Estilo', company: 'Boutique Estilo', location: 'Las Terrenas', rawSnippet: 'Tienda retail ropa inventario', source: 'import', acquisitionSource: 'otros', status: 'contactado', branchId: 'charm-santiago' },
  { name: 'AutoShine Carwash', company: 'AutoShine', location: 'Los Alcarrizos', rawSnippet: 'Car wash lavado autos citas membresías', source: 'serp', acquisitionSource: 'whatsapp', status: 'contactado', pipelineValue: 32000, phone: '809-555-1006', branchId: 'charm-santiago' },
  { name: 'FitLife Gym', company: 'FitLife', location: 'Naco', rawSnippet: 'Gimnasio fitness clases membresías CRM', source: 'serp', acquisitionSource: 'instagram', status: 'nuevo', pipelineValue: 55000, phone: '809-555-1007' },
  { name: 'Ferretería El Martillo', company: 'El Martillo', location: 'San Cristóbal', rawSnippet: 'Ferretería retail inventario multi sucursal', source: 'manual', acquisitionSource: 'otros', status: 'perdido', lostReason: 'Sin presupuesto' },
  { name: 'Nails & More', company: 'Nails & More', location: 'Bávaro', rawSnippet: 'Nail salon belleza citas', source: 'serp', acquisitionSource: 'referral', status: 'propuesta', pipelineValue: 28000, phone: '809-555-1009' },
  { name: 'Restaurante Mar Azul', company: 'Mar Azul', location: 'Boca Chica', rawSnippet: 'Restaurante mariscos facturación caja', source: 'referral', acquisitionSource: 'whatsapp', status: 'contactado', phone: '809-555-1010' },
]

const hoursFromNow = (h) => new Date(Date.now() + h * 3600000).toISOString()

const SEED_ACTIVITIES = [
  { id: 'act-1', type: 'llamada', title: 'Llamada inicial Glamour Studio', description: 'Presentación de módulos Agenda y POS', leadId: 'lead-seed-1', customerName: 'Glamour Studio RD', assignedUserId: 'u1', dueAt: daysAgo(2), completedAt: daysAgo(2), createdAt: daysAgo(3) },
  { id: 'act-2', type: 'email', title: 'Propuesta enviada Spa Zen', description: 'Cotización suite completa', leadId: 'lead-seed-2', customerName: 'Spa Zen Caribe', assignedUserId: 'u2', dueAt: daysAgo(1), completedAt: daysAgo(1), createdAt: daysAgo(2) },
  { id: 'act-3', type: 'reunion', title: 'Demo AutoShine', description: 'Demostración POS en sitio', leadId: 'lead-seed-6', customerName: 'AutoShine Carwash', assignedUserId: 'u1', dueAt: hoursFromNow(3), completedAt: null, createdAt: daysAgo(1) },
  { id: 'act-4', type: 'tarea', title: 'Seguimiento FitLife', description: 'Enviar caso de éxito gym', leadId: 'lead-seed-7', customerName: 'FitLife Gym', assignedUserId: 'u2', dueAt: hoursFromNow(26), completedAt: null, createdAt: daysAgo(0) },
  { id: 'act-5', type: 'tarea', title: 'Llamar a Nicole Sosa', description: 'Confirmar próxima sesión de prueba', customerName: 'Nicole Sosa', assignedUserId: 'u1', dueAt: hoursFromNow(-2), completedAt: null, createdAt: daysAgo(0) },
]

const SEED_QUOTES = [
  { id: 'qt-1', number: 'COT-2026-001', leadId: 'lead-seed-1', customerId: 'c2', customerName: 'Glamour Studio RD', status: 'enviada', total: 45000, items: [{ name: 'Módulo Agenda', qty: 1, price: 25000 }, { name: 'Módulo POS', qty: 1, price: 20000 }], branchId: 'charm-dn', validUntil: daysAgo(-15), createdAt: daysAgo(5), updatedAt: daysAgo(5) },
  { id: 'qt-2', number: 'COT-2026-002', leadId: 'lead-seed-2', customerName: 'Spa Zen Caribe', status: 'borrador', total: 78000, items: [{ name: 'Suite Helios Completa', qty: 1, price: 78000 }], branchId: 'charm-dn', validUntil: daysAgo(-20), createdAt: daysAgo(2), updatedAt: daysAgo(2) },
]

function buildSeedLeads() {
  return RAW_SEED_LEADS.map((l, i) =>
    normalizeLead({ ...l, id: `lead-seed-${i + 1}`, createdAt: daysAgo(30 - i * 2), updatedAt: daysAgo(i) })
  )
}

export const useCrmStore = create(
  persist(
    (set, get) => ({
      leads: [],
      leadsListMeta: emptyListMeta(),
      activities: [],
      quotes: [],
      quotesListMeta: emptyListMeta(),
      customers: [],
      sales: [],
      overview: null,
      discoveryCapabilities: null,
      uiMode: 'standard',
      uiModeVersion: 1,
      workspaceSettingsLoaded: false,
      workspaceSettingsSynced: false,
      serpHourCount: 0,
      serpHourWindowStart: Date.now(),
      serpMonthCount: 0,
      serpMonthKey: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      dataState: { status: 'loading', source: null, error: null },
      hydrating: false,
      error: null,
      simplifiedWorkspace: {
        items: [],
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 1,
        stageCounts: {},
        loading: false,
        error: null,
        countsLoading: false,
        countsError: null,
        detailActivities: [],
        detailActivitiesLoading: false,
      },
      hydrate: async ({ force = false } = {}) => {
        const online = isOnline()
        const alreadyHydratedForSession = online
          ? get().dataState.status === 'ready' && get().dataState.source === 'api'
          : get().dataState.status === 'demo'
        if (get().hydrating || (!force && alreadyHydratedForSession)) {
          return get()
        }
        if (!online) {
          set({
            leads: buildSeedLeads(),
            activities: SEED_ACTIVITIES,
            quotes: SEED_QUOTES,
            sales: [],
            customers: [],
            dataState: { status: 'demo', source: 'demo', error: null },
            hydrating: false,
          })
          return get()
        }
        set({ hydrating: true, error: null, dataState: { status: 'loading', source: 'api', error: null } })
        try {
          const [stateResponse, customerResponse, salesResponse, overview] = await Promise.all([
            crmApi.state(),
            readAllPages(crmApi.customers),
            crmCommerceEnabled() ? readAllPages(crmApi.sales) : emptyCrmPage(),
            crmApi.overview(),
          ])
          const mapped = mapCrmStateFromApi(stateResponse)
          const customers = mapCrmCustomersPageFromApi(customerResponse)
          const sales = mapCrmSalesPageFromApi(salesResponse)
          const workspace = workspaceFieldsFromSnapshot(get(), mapped)
          set({
            ...mapped,
            ...workspace,
            customers,
            sales,
            overview: mapCrmOverviewFromApi(overview),
            hydrating: false,
            dataState: { status: 'ready', source: 'api', error: null },
          })
          useCustomersStore.getState().mergeCrmProfiles?.(customers)
          return get()
        } catch (error) {
          set({ hydrating: false, error, dataState: { status: 'error', source: null, error } })
          throw error
        }
      },

      hydrateSection: async (section) => {
        if (!isOnline()) return get().hydrate({ force: true })
        const generation = crmGeneration
        set({
          hydrating: true,
          error: null,
          dataState: { status: 'loading', source: 'api', error: null },
        })
        try {
          const updates = await loadOnlineSection(section)
          if (generation !== crmGeneration) return {}
          if (updates.quotes) {
            const previous = get().quotes
            updates.quotes = updates.quotes.map((quote) => {
              const prior = previous.find((item) => item.id === quote.id)
              if (
                prior?.invoiceCollection
                || prior?.receivableId
                || prior?.invoicePaymentMethod
                || quote.invoiceCollection
                || quote.receivableId
              ) {
                return {
                  ...quote,
                  invoiceCollection: mergeInvoiceCollection(
                    quote.invoiceCollection,
                    prior?.invoiceCollection
                  ),
                  receivableId: quote.receivableId || prior?.receivableId || null,
                  invoicePaymentMethod: quote.invoicePaymentMethod || prior?.invoicePaymentMethod || null,
                }
              }
              return quote
            })
          }
          const workspace = workspaceFieldsFromSnapshot(get(), updates)
          set({
            ...updates,
            ...workspace,
            hydrating: false,
            dataState: { status: 'ready', source: 'api', error: null },
          })
          if (updates.customers) {
            useCustomersStore.getState().mergeCrmProfiles?.(updates.customers)
          }

          return updates
        } catch (error) {
          if (generation !== crmGeneration) return {}
          set({ hydrating: false, error, dataState: { status: 'error', source: null, error } })
          throw error
        }
      },

      fetchLeadsPage: async ({ page = 1, pageSize, search, branchId } = {}) => {
        if (!isOnline()) return get().leads
        const meta = get().leadsListMeta
        const targetPage = Math.max(1, page)
        const targetSize = normalizeCrmPageSize(pageSize ?? meta.pageSize)
        const searchKey = search ?? meta.search ?? ''
        const branchKey = branchId ?? meta.branchId ?? null
        set({
          leadsListMeta: {
            ...meta,
            page: targetPage,
            pageSize: targetSize,
            search: searchKey,
            branchId: branchKey,
            loading: true,
            error: null,
            loadingMore: false,
          },
        })
        try {
          const response = await crmApi.leads({
            page: targetPage,
            pageSize: targetSize,
            search: searchKey.trim() || undefined,
            branchId: branchKey || undefined,
          })
          const mapped = mapLeadsPaginatedFromApi(response)
          set({
            leads: mapped.items,
            leadsListMeta: listMetaFromPaginated(mapped, {
              pageSize: targetSize,
              search: searchKey,
              branchId: branchKey,
            }),
          })
          return mapped.items
        } catch (error) {
          set({ leadsListMeta: { ...get().leadsListMeta, loading: false, loadingMore: false } })
          throw error
        }
      },

      setLeadsPage: (page) => {
        const meta = get().leadsListMeta
        return get().fetchLeadsPage({
          page,
          pageSize: meta.pageSize,
          search: meta.search,
          branchId: meta.branchId,
        })
      },

      setLeadsPageSize: (pageSize) => {
        const meta = get().leadsListMeta
        return get().fetchLeadsPage({
          page: 1,
          pageSize,
          search: meta.search,
          branchId: meta.branchId,
        })
      },

      /** @deprecated Usar paginación por página */
      loadMoreLeads: async () => get().setLeadsPage(get().leadsListMeta.page + 1),

      fetchQuotesPage: async ({
        page = 1,
        pageSize,
        branchId,
        updatedAfter,
        updatedBefore,
        append = false,
      } = {}) => {
        if (!isOnline() || !crmCommerceEnabled()) return get().quotes
        const meta = get().quotesListMeta
        const targetPage = Math.max(1, page)
        const targetSize = normalizeCrmPageSize(pageSize ?? meta.pageSize)
        const branchKey = branchId ?? meta.branchId ?? null
        const afterKey = updatedAfter ?? meta.updatedAfter ?? null
        const beforeKey = updatedBefore ?? meta.updatedBefore ?? null
        const loadingMore = append && targetPage > 1
        set({
          quotesListMeta: {
            ...meta,
            page: targetPage,
            pageSize: targetSize,
            branchId: branchKey,
            updatedAfter: afterKey,
            updatedBefore: beforeKey,
            loading: !loadingMore,
            loadingMore,
            error: null,
          },
        })
        try {
          const response = await crmApi.quotes({
            page: targetPage,
            pageSize: targetSize,
            branchId: branchKey || undefined,
            updatedAfter: afterKey || undefined,
            updatedBefore: beforeKey || undefined,
          })
          const mapped = mapQuotesPaginatedFromApi(response)
          const mergeQuoteList = (previous, incoming) => {
            const merged = append ? upsertById(previous, incoming) : incoming
            return merged.map((quote) => {
              const prior = previous.find((item) => item.id === quote.id)
              if (
                prior?.invoiceCollection
                || prior?.receivableId
                || prior?.invoicePaymentMethod
                || quote.invoiceCollection
                || quote.receivableId
              ) {
                return {
                  ...quote,
                  invoiceCollection: mergeInvoiceCollection(
                    quote.invoiceCollection,
                    prior?.invoiceCollection
                  ),
                  receivableId: quote.receivableId || prior?.receivableId || null,
                  invoicePaymentMethod: quote.invoicePaymentMethod || prior?.invoicePaymentMethod || null,
                }
              }
              return quote
            })
          }
          set((state) => ({
            quotes: mergeQuoteList(state.quotes, mapped.items),
            quotesListMeta: listMetaFromPaginated(mapped, {
              pageSize: targetSize,
              branchId: branchKey,
              updatedAfter: afterKey,
              updatedBefore: beforeKey,
            }),
          }))
          return mapped.items
        } catch (error) {
          set({
            quotesListMeta: {
              ...get().quotesListMeta,
              loading: false,
              loadingMore: false,
              error,
            },
          })
          throw error
        }
      },

      loadMoreQuotes: async () => {
        if (!isOnline()) return
        const meta = get().quotesListMeta
        if (meta.loadingMore || meta.loading || meta.page >= meta.totalPages) return
        return get().fetchQuotesPage({
          page: meta.page + 1,
          pageSize: meta.pageSize,
          branchId: meta.branchId,
          updatedAfter: meta.updatedAfter,
          updatedBefore: meta.updatedBefore,
          append: true,
        })
      },

      /** Full quote sync for simplified workspace timeline (not used by cotizaciones list). */
      syncWorkspaceQuotes: async () => {
        if (!isOnline() || !crmCommerceEnabled()) return get().quotes
        const quotes = await readAllPages(crmApi.quotes)
        const mapped = mapCrmQuotesPageFromApi(quotes)
        set((state) => ({
          quotes: mapped.map((quote) => {
            const prior = state.quotes.find((item) => item.id === quote.id)
            if (!prior) return quote
            return {
              ...quote,
              invoiceCollection: mergeInvoiceCollection(quote.invoiceCollection, prior.invoiceCollection),
              receivableId: quote.receivableId || prior.receivableId || null,
              invoicePaymentMethod: quote.invoicePaymentMethod || prior.invoicePaymentMethod || null,
            }
          }),
        }))
        return mapped
      },

      loadMorePipelineLeads: async () => {
        if (!isOnline()) return
        const meta = get().leadsListMeta
        if (meta.loadingMore || meta.page >= meta.totalPages) return
        set({ leadsListMeta: { ...meta, loadingMore: true } })
        try {
          const response = await crmApi.leads({
            page: meta.page + 1,
            pageSize: CRM_INFINITE_PAGE_SIZE,
          })
          const mapped = mapLeadsPaginatedFromApi(response)
          set((state) => ({
            leads: upsertById(state.leads, mapped.items),
            leadsListMeta: listMetaFromPaginated(mapped),
          }))
        } catch (error) {
          set({ leadsListMeta: { ...get().leadsListMeta, loadingMore: false } })
          throw error
        }
      },

      recordSerpSearch: () =>
        set((state) => recordSerpUsage(state)),

      ensureWorkspaceSettings: async ({ force = false } = {}) => {
        if (!force && get().workspaceSettingsSynced) return get()
        if (!isOnline()) {
          set({ workspaceSettingsLoaded: true, workspaceSettingsSynced: true })
          return get()
        }
        try {
          const workspace = await crmApi.workspaceSettings()
          set(mergeWorkspaceSettings(
            get(),
            { uiMode: workspace.uiMode, version: workspace.version },
            { authoritative: true }
          ))
        } catch (error) {
          set({ workspaceSettingsLoaded: true })
          throw error
        }
        return get()
      },

      updateUiMode: async (uiMode, retryAfterVersionConflict = false) => {
        if (!isOnline()) {
          set({
            uiMode,
            uiModeVersion: get().uiModeVersion + 1,
            workspaceSettingsLoaded: true,
          })
          return get()
        }
        try {
          const result = await crmApi.updateWorkspaceSettings({
            version: get().uiModeVersion,
            uiMode,
          })
          set(mergeWorkspaceSettings(
            get(),
            { uiMode: result.uiMode || uiMode, version: result.version },
            { authoritative: true }
          ))
          return get()
        } catch (error) {
          if (isWorkspaceSettingsVersionConflict(error) && !retryAfterVersionConflict) {
            await get().ensureWorkspaceSettings({ force: true })
            if (get().uiMode === uiMode) return get()
            return get().updateUiMode(uiMode, true)
          }
          throw error
        }
      },

      fetchSimplifiedWorkspaceQueue: async ({
        stage,
        page = 1,
        pageSize = 25,
        search = '',
        branchIds = [],
        dateFilter,
      }) => {
        set((state) => ({
          simplifiedWorkspace: {
            ...state.simplifiedWorkspace,
            loading: true,
            page,
            pageSize,
          },
        }))
        try {
          if (!isOnline()) {
            const q = search.trim().toLowerCase()
            const allLeads = get().leads.length ? get().leads : buildSeedLeads()
            const filtered = filterLeadsForSimplifiedWorkspace(
              allLeads.filter((item) => item.status === stage),
              { branchIds, dateFilter },
            ).filter((item) => {
              if (!q) return true
              const title = (item.company || item.name || '').toLowerCase()
              const phone = (item.phone || '').toLowerCase()
              return title.includes(q) || phone.includes(q)
            })
            const slice = paginateSlice(filtered, { page, pageSize })
            set((state) => ({
              simplifiedWorkspace: {
                ...state.simplifiedWorkspace,
                items: slice.items,
                page: slice.page,
                pageSize: slice.pageSize,
                totalItems: slice.total,
                totalPages: slice.totalPages,
                loading: false,
                error: null,
              },
              leads: upsertById(state.leads, slice.items),
            }))
            return get().simplifiedWorkspace
          }

          const { params } = buildSimplifiedLeadQuery({
            stage,
            page,
            pageSize,
            search,
            branchIds,
            dateFilter,
          })
          const response = await crmApi.leads(params)
          let mapped = mapLeadsPaginatedFromApi(response)
          if (branchIds?.length > 1) {
            const filtered = filterLeadsForSimplifiedWorkspace(mapped.items, { branchIds, dateFilter: { period: 'all' } })
            mapped = {
              ...mapped,
              items: filtered,
              totalItems: filtered.length,
              totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
            }
          }
          set((state) => ({
            simplifiedWorkspace: {
              ...state.simplifiedWorkspace,
              items: mapped.items,
              page: mapped.page,
              pageSize: mapped.pageSize,
              totalItems: mapped.totalItems,
              totalPages: mapped.totalPages,
              loading: false,
              error: null,
            },
            leads: upsertById(state.leads, mapped.items),
          }))
          return get().simplifiedWorkspace
        } catch (error) {
          set((state) => ({
            simplifiedWorkspace: { ...state.simplifiedWorkspace, loading: false, error },
            error,
          }))
          throw error
        }
      },

      fetchSimplifiedWorkspaceStageCounts: async ({ search = '', branchIds = [], dateFilter }) => {
        set((state) => ({
          simplifiedWorkspace: { ...state.simplifiedWorkspace, countsLoading: true, countsError: null },
        }))
        try {
          const countFromLeads = (leads) => countSimplifiedWorkspaceStageCounts(leads, { search, branchIds, dateFilter })

          if (!isOnline()) {
            const allLeads = get().leads.length ? get().leads : buildSeedLeads()
            const stageCounts = countFromLeads(allLeads)
            set((state) => ({
              simplifiedWorkspace: { ...state.simplifiedWorkspace, stageCounts, countsLoading: false, countsError: null },
            }))
            return stageCounts
          }

          const baseQuery = buildSimplifiedLeadQuery({
            stage: SIMPLIFIED_WORKSPACE_STAGES[0],
            page: 1,
            pageSize: 1,
            search,
            branchIds,
            dateFilter,
          })

          const readLeadPage = async (params) => {
            const response = await crmApi.leads(params)
            return mapLeadsPaginatedFromApi(response)
          }

          if (needsSimplifiedWorkspaceClientFilter({ branchIds, dateFilter })) {
            const stageCounts = Object.fromEntries(SIMPLIFIED_WORKSPACE_STAGES.map((id) => [id, 0]))
            await Promise.all(
              SIMPLIFIED_WORKSPACE_STAGES.map(async (stageId) => {
                const { items } = await readAllPages(readLeadPage, {
                  ...baseQuery.params,
                  status: stageId,
                  pageSize: 200,
                })
                stageCounts[stageId] = leadsMatchingSimplifiedWorkspaceFilters(items, {
                  search,
                  branchIds,
                  dateFilter,
                }).length
              }),
            )
            set((state) => ({
              simplifiedWorkspace: { ...state.simplifiedWorkspace, stageCounts, countsLoading: false, countsError: null },
            }))
            return stageCounts
          }

          const responses = await Promise.all(
            SIMPLIFIED_WORKSPACE_STAGES.map((stageId) => crmApi.leads({
              ...baseQuery.params,
              status: stageId,
            }))
          )
          const stageCounts = Object.fromEntries(
            SIMPLIFIED_WORKSPACE_STAGES.map((stageId, index) => {
              const mapped = mapLeadsPaginatedFromApi(responses[index])
              return [stageId, mapped.totalItems]
            })
          )
          set((state) => ({
            simplifiedWorkspace: { ...state.simplifiedWorkspace, stageCounts, countsLoading: false, countsError: null },
          }))
          return stageCounts
        } catch (error) {
          set((state) => ({
            simplifiedWorkspace: { ...state.simplifiedWorkspace, countsLoading: false, countsError: error },
          }))
          throw error
        }
      },

      fetchSimplifiedWorkspaceDetailActivities: async (leadId) => {
        if (!leadId) {
          set((state) => ({
            simplifiedWorkspace: {
              ...state.simplifiedWorkspace,
              detailActivities: [],
              detailActivitiesLoading: false,
            },
          }))
          return []
        }
        set((state) => ({
          simplifiedWorkspace: { ...state.simplifiedWorkspace, detailActivitiesLoading: true },
        }))
        try {
          if (!isOnline()) {
            const detailActivities = get()
              .activities
              .filter((item) => item.leadId === leadId)
              .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            set((state) => ({
              simplifiedWorkspace: {
                ...state.simplifiedWorkspace,
                detailActivities,
                detailActivitiesLoading: false,
              },
            }))
            return detailActivities
          }
          const response = await crmApi.activities({
            leadId,
            page: 1,
            pageSize: 50,
          })
          const detailActivities = mapActivitiesPageFromApi(response)
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
          set((state) => ({
            simplifiedWorkspace: {
              ...state.simplifiedWorkspace,
              detailActivities,
              detailActivitiesLoading: false,
            },
            activities: upsertById(state.activities, detailActivities),
          }))
          return detailActivities
        } catch (error) {
          set((state) => ({
            simplifiedWorkspace: { ...state.simplifiedWorkspace, detailActivitiesLoading: false },
          }))
          throw error
        }
      },

      applySimplifiedFollowUp: async (leadId, { dueAt, title, description }) => {
        const lead = get().leads.find((item) => item.id === leadId)
          || get().simplifiedWorkspace.items.find((item) => item.id === leadId)
        if (!lead) throw new Error('Lead no encontrado.')
        const dueIso = dueAt ? new Date(dueAt).toISOString() : null
        await get().addActivity({
          type: 'tarea',
          title: title || 'Seguimiento programado',
          description: description || null,
          leadId: lead.id,
          customerId: lead.customerId || null,
          customerName: lead.company || lead.name,
          branchId: lead.branchId,
          dueAt: dueIso,
        })
        if (lead.status !== 'negociacion') {
          await get().updateLead(leadId, { status: 'negociacion' })
        }
      },

      applySimplifiedLost: async (leadId, lostReason) => {
        const reason = String(lostReason || '').trim()
        if (!reason) throw new Error('Selecciona un motivo de pérdida.')
        await get().updateLead(leadId, { status: 'perdido', lostReason: reason })
      },

      addLead: async (data) => {
        const lead = normalizeLead(data)
        if (isOnline()) {
          try {
            const response = await crmApi.createLead(leadPayload(lead))
            const saved = mapLeadFromApi(response)
            set((s) => ({ leads: [saved, ...s.leads] }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({ leads: [lead, ...s.leads] }))
        return lead
      },

      addLeadsBatch: async (items, source = 'serp') => {
        const ts = now()
        const newLeads = items.map((item) =>
          normalizeLead({ ...item, source, scrapedAt: ts, status: 'nuevo' })
        )
        if (isOnline() && newLeads.length > 0) {
          try {
            const response = await crmApi.importLeads({
              branchId: newLeads[0].branchId,
              source,
              items: newLeads.map(leadPayload),
            })
            const saved = (response.items || []).map(mapLeadFromApi)
            set((s) => ({ leads: [...saved, ...s.leads] }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({ leads: [...newLeads, ...s.leads] }))
        return newLeads
      },

      updateLead: async (id, data, retryAfterVersionConflict = false) => {
        const current = get().leads.find((lead) => lead.id === id)
        if (!current) throw new Error('Lead no encontrado.')
        const statusChanged = data.status !== undefined && data.status !== current.status
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== id) return l
            return { ...l, ...data, updatedAt: now() }
          }),
        }))
        if (isOnline()) {
          const payload = { version: current.version }
          const fields = [
            'name', 'company', 'email', 'phone', 'website', 'instagramUrl', 'location', 'status',
            'starRating', 'rawSnippet', 'acquisitionSource', 'pipelineValue', 'lostReason', 'customerId',
          ]
          fields.forEach((field) => {
            if (data[field] !== undefined) payload[field] = data[field]
          })
          try {
            const response = await crmApi.updateLead(id, payload)
            const saved = mapLeadFromApi(response)
            set((s) => ({ leads: replaceById(s.leads, saved) }))
            if (statusChanged) {
              await get().fetchSimplifiedWorkspaceDetailActivities(id).catch(() => {})
            }
            return saved
          } catch (error) {
            const versionConflict =
              error?.parameter === 'version'
              || String(error?.message || '').includes('última lectura')
            if (versionConflict && !retryAfterVersionConflict) {
              try {
                const refreshed = await crmApi.getLead(id)
                const savedLead = mapLeadFromApi(refreshed)
                set((s) => ({ leads: replaceById(s.leads, savedLead) }))
                return get().updateLead(id, data, true)
              } catch {
                /* fall through to default error handling */
              }
            }
            set((state) => ({
              leads: state.leads.map((lead) => (lead.id === id ? current : lead)),
            }))
            reportMutationError(set, error)
            throw error
          }
        }
        if (statusChanged) {
          await get().addActivity({
            type: 'nota',
            title: formatLeadStageMoveTitle(current.status, data.status),
            leadId: id,
            customerId: current.customerId || null,
            customerName: current.company || current.name,
            branchId: current.branchId,
            completedAt: now(),
          }).catch(() => {})
        }
        return get().leads.find((lead) => lead.id === id)
      },

      deleteLeads: async (leadIds) => {
        const ids = [...new Set(leadIds)].filter(Boolean)
        if (!ids.length) return { items: [] }
        if (!isOnline()) {
          set((state) => ({
            leads: state.leads.filter((lead) => !ids.includes(lead.id)),
            activities: state.activities.filter((act) => !ids.includes(act.leadId)),
          }))
          return { items: ids.map((id) => ({ leadId: id, status: 'deleted' })) }
        }
        const response = await crmApi.deleteLeadsBatch({ leadIds: ids })
        const deleted = new Set(
          (response.items || []).filter((row) => row.status === 'deleted').map((row) => row.leadId),
        )
        if (deleted.size) {
          set((state) => ({
            leads: state.leads.filter((lead) => !deleted.has(lead.id)),
            activities: state.activities.filter((act) => !deleted.has(act.leadId)),
            leadsListMeta: {
              ...state.leadsListMeta,
              totalItems: Math.max(0, state.leadsListMeta.totalItems - deleted.size),
            },
          }))
        }
        return response
      },

      setLeadStarRating: (id, starRating) => get().updateLead(id, {
        starRating: starRating == null || starRating === '' ? null : Number(starRating),
      }),

      convertToCustomer: async (leadId) => {
        const lead = get().leads.find((l) => l.id === leadId)
        if (!lead) return null
        if (isOnline()) {
          const response = await crmApi.convertLead(leadId, buildLeadConvertRequest(lead))
          const customer = mapCrmCustomerFromApi(response)
          await Promise.all([
            get().hydrateSection('pipeline'),
            get().hydrateSection('customers'),
            get().hydrateSection('leads'),
            useCustomersStore.getState().hydrate({ force: true }),
          ])
          return customer
        }
        const customer = await useCustomersStore.getState().addCustomer(buildLeadOfflineCustomer(lead))
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId
              ? { ...l, status: 'cerrado', customerId: customer.id, updatedAt: now() }
              : l
          ),
        }))
        return customer
      },

      syncLeadsToPipeline: async () => 0,

      addToPipeline: async (leadId) => get().leads.find((lead) => lead.id === leadId) || null,

      updateLeadStage: (id, status) => get().updateLead(id, { status }),

      closeLeadWithInvoice: async (leadId, {
        paymentMethod = 'efectivo',
        customerId,
        reference = null,
        proof = null,
        collectionMode,
      } = {}) => {
        const customers = useCustomersStore.getState().customers
        let lead = get().leads.find((item) => item.id === leadId)
        const resolvedId = customerId || effectiveLeadCustomerId(lead, customers)
        let quote = findBillableQuote(get().quotes, leadId)
        if (resolvedId && quote && quote.customerId !== resolvedId) {
          quote = await get().updateQuote(quote.id, { customerId: resolvedId }) || quote
        }
        lead = get().leads.find((item) => item.id === leadId)
        const effectiveCustomerId = resolvedId || lead?.customerId || quote?.customerId || null
        const leadForClose = lead ? { ...lead, customerId: effectiveCustomerId } : null
        const validationError = validatePipelineClose({ lead: leadForClose, quotes: get().quotes })
        if (validationError) throw new Error(validationError)

        quote = findBillableQuote(get().quotes, leadId)
        if (!quote) throw new Error('No se encontró una cotización facturable.')

        const customer = useCustomersStore.getState().customers.find(
          (item) => item.id === effectiveCustomerId
        ) || { id: effectiveCustomerId, name: lead.company || lead.name, phone: lead.phone || null }

        let sale
        if (isOnline()) {
          let billableQuote = quote
          if (!billableQuote.convertedSaleId && billableQuote.status !== 'aceptada') {
            billableQuote = await get().updateQuote(billableQuote.id, { status: 'aceptada' }) || billableQuote
          }
          if (billableQuote.convertedSaleId) {
            sale = mapSaleFromApi(await crmApi.getSale(billableQuote.convertedSaleId))
          } else {
            sale = (await get().invoiceQuote(billableQuote.id, {
              paymentMethod,
              collectionMode,
              reference,
              proof,
            })).sale
          }
        } else {
          sale = buildDemoSaleFromPipeline({
            lead,
            quote,
            customer,
            paymentMethod,
          })
          set((state) => ({
            sales: [sale, ...state.sales.filter((item) => item.id !== sale.id)],
          }))
          const { usePosStore } = await import('@/stores/posStore')
          usePosStore.setState((state) => ({
            sales: [sale, ...state.sales.filter((item) => item.id !== sale.id)],
          }))
          await get().updateQuote(quote.id, { status: 'aceptada' })
        }

        if (isOnline()) {
          let closedLead = get().leads.find((item) => item.id === leadId)
          try {
            const refreshed = await crmApi.getLead(leadId)
            closedLead = mapLeadFromApi(refreshed)
            set((s) => ({ leads: replaceById(s.leads, closedLead) }))
          } catch {
            /* keep local state */
          }
          if (closedLead?.status !== 'cerrado') {
            closedLead = await get().updateLead(leadId, { status: 'cerrado' })
          }
        } else {
          await get().updateLead(leadId, { status: 'cerrado' })
        }
        return sale
      },

      closeOpportunityWithInvoice: (leadId, options) => get().closeLeadWithInvoice(leadId, options),

      addActivity: async (data) => {
        const relatedLead = get().leads.find((lead) => lead.id === data.leadId)
        const branchId = data.branchId
          || relatedLead?.branchId
          || useSessionStore.getState().user?.branchIds?.[0]
        const act = {
          id: genId('act'),
          createdAt: now(),
          completedAt: null,
          assignedUserId: useSessionStore.getState().user?.membershipId || currentSessionActor().id,
          branchId,
          ...data,
        }
        if (isOnline()) {
          try {
            const response = await crmApi.createActivity({
              branchId,
              leadId: act.leadId || null,
              customerId: act.customerId || null,
              assignedMembershipId: act.assignedUserId || null,
              type: act.type,
              title: act.title,
              description: act.description || null,
              customerName: act.customerName || null,
              dueAt: act.dueAt || null,
            })
            const saved = mapActivityFromApi(response)
            set((s) => ({ activities: [saved, ...s.activities.filter((item) => item.id !== saved.id)] }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({ activities: [act, ...s.activities] }))
        return act
      },

      updateActivity: async (id, data) => {
        const current = get().activities.find((activity) => activity.id === id)
        if (isOnline() && current) {
          const payload = { version: current.version }
          const fields = ['type', 'title', 'description', 'customerName', 'dueAt']
          fields.forEach((field) => {
            if (data[field] !== undefined) payload[field] = data[field]
          })
          if (data.assignedUserId !== undefined) payload.assignedMembershipId = data.assignedUserId
          try {
            const response = await crmApi.updateActivity(id, payload)
            const saved = mapActivityFromApi(response)
            set((s) => ({ activities: replaceById(s.activities, saved) }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        if (!current) return null
        const updated = { ...current, ...data }
        set((s) => ({ activities: replaceById(s.activities, updated) }))
        return updated
      },

      toggleActivityComplete: async (id) => {
        const current = get().activities.find((activity) => activity.id === id)
        if (isOnline() && current) {
          const request = current.completedAt ? crmApi.reopenActivity : crmApi.completeActivity
          try {
            const response = await request(id, current.version)
            const saved = mapActivityFromApi(response)
            set((s) => ({ activities: replaceById(s.activities, saved) }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        if (!current) return null
        const updated = { ...current, completedAt: current.completedAt ? null : now() }
        set((s) => ({ activities: replaceById(s.activities, updated) }))
        return updated
      },

      addQuote: async (data) => {
        const count = get().quotes.length + 1
        const quote = {
          id: genId('qt'),
          number: `COT-2026-${String(count).padStart(3, '0')}`,
          status: 'borrador',
          items: [],
          total: 0,
          createdAt: now(),
          updatedAt: now(),
          ...data,
        }
        if (isOnline()) {
          try {
            const response = await crmApi.createQuote({
              leadId: quote.leadId || null,
              customerId: quote.customerId,
              branchId: quote.branchId,
              lines: quote.items.map((item) => ({
                itemId: item.itemId || item.id,
                quantity: item.qty || 1,
                unitPrice: item.price,
              })),
              notes: quote.notes || null,
              validUntil: quote.validUntil || null,
              status: quote.status,
            })
            const saved = mapCrmQuoteFromApi(response)
            set((s) => ({ quotes: [saved, ...s.quotes.filter((item) => item.id !== saved.id)] }))
            if (saved.leadId) {
              try {
                const leadResponse = await crmApi.getLead(saved.leadId)
                const lead = mapLeadFromApi(leadResponse)
                set((s) => ({ leads: replaceById(s.leads, lead) }))
              } catch {
                /* pipeline sync may still retry via updateLead version handling */
              }
            }
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        const withHistory = {
          ...quote,
          revisions: appendQuoteRevision(quote, 'created'),
        }
        set((s) => ({ quotes: [withHistory, ...s.quotes] }))
        return withHistory
      },

      updateQuote: async (id, data, retryAfterVersionConflict = false) => {
        const current = get().quotes.find((quote) => quote.id === id)
        if (isOnline() && current) {
          const payload = { version: current.version }
          if (data.status !== undefined) payload.status = data.status
          if (data.validUntil !== undefined) payload.validUntil = data.validUntil
          if (data.notes !== undefined) payload.notes = data.notes
          if (data.leadId !== undefined) payload.leadId = data.leadId
          if (data.customerId !== undefined) payload.customerId = data.customerId
          if (data.branchId !== undefined) payload.branchId = data.branchId
          const lineSource = data.lines ?? data.items
          if (lineSource !== undefined) {
            payload.lines = lineSource.map((item) => ({
              itemId: item.itemId || item.id,
              quantity: item.qty || 1,
              unitPrice: Number(item.price) || 0,
            }))
          }
          const statusOnlyUpdate = Object.keys(data).length === 1 && data.status !== undefined
          try {
            const response = await crmApi.updateQuote(id, payload)
            const saved = mapCrmQuoteFromApi(response)
            set((s) => ({ quotes: replaceById(s.quotes, saved) }))
            return saved
          } catch (error) {
            const versionConflict =
              error?.parameter === 'version'
              || String(error?.message || '').includes('vuelve a cargarlo')
            if (versionConflict && statusOnlyUpdate && !retryAfterVersionConflict) {
              await get().hydrateSection('quotes')
              return get().updateQuote(id, data, true)
            }
            reportMutationError(set, error)
            throw error
          }
        }
        if (!current) return null
        const lineSource = data.lines ?? data.items
        let items = current.items
        if (lineSource !== undefined) {
          items = lineSource.map((item) => ({
            id: item.itemId || item.id,
            itemId: item.itemId || item.id,
            name: item.name || 'Ítem',
            qty: item.qty || 1,
            price: Number(item.price) || 0,
          }))
        }
        const updated = {
          ...current,
          ...data,
          items,
          total: lineSource !== undefined ? sumQuoteLines(items) : (data.total ?? current.total),
          updatedAt: now(),
          revisions: appendQuoteRevision({
            ...current,
            ...data,
            items,
            total: lineSource !== undefined ? sumQuoteLines(items) : (data.total ?? current.total),
          }, 'updated'),
        }
        set((s) => ({ quotes: replaceById(s.quotes, updated) }))
        return updated
      },

      ensureQuoteDetail: async (quoteId) => {
        const cached = get().quotes.find((quote) => quote.id === quoteId)
        if (!isOnline()) return cached || null
        const key = String(quoteId)
        if (quoteDetailRequests.has(key)) return quoteDetailRequests.get(key)
        const request = crmApi.getQuote(quoteId)
          .then((response) => {
            const detail = mapCrmQuoteFromApi(response)
            set((state) => ({ quotes: replaceById(state.quotes, detail) }))
            return detail
          })
          .catch((error) => {
            if (error?.status === 404) {
              set((state) => ({
                quotes: state.quotes.filter((quote) => quote.id !== quoteId),
              }))
            }
            throw error
          })
          .finally(() => quoteDetailRequests.delete(key))
        quoteDetailRequests.set(key, request)
        return request
      },

      ensureSaleDetail: async (saleId) => {
        const current = get().sales.find((sale) => sale.id === saleId)
        if (!isOnline() || current?.detailLoaded) return current || null
        const key = String(saleId)
        if (saleDetailRequests.has(key)) return saleDetailRequests.get(key)
        const request = crmApi.getSale(saleId)
          .then((response) => {
            const detail = mapSaleFromApi(response)
            set((state) => ({ sales: replaceById(state.sales, detail) }))
            return detail
          })
          .finally(() => saleDetailRequests.delete(key))
        saleDetailRequests.set(key, request)
        return request
      },

      invoiceQuote: async (quoteId, {
        collectionMode = 'now',
        paymentMethod = 'efectivo',
        reference = null,
        proof = null,
      } = {}) => {
        const quote = get().quotes.find((item) => item.id === quoteId)
        if (!quote) throw new Error('Cotización no encontrada.')
        const customer = useCustomersStore.getState().customers.find(
          (item) => item.id === quote.customerId
        )
        if (isOnline()) {
          try {
            const payment = resolveQuoteInvoicePaymentMethod(
              useConfigStore.getState().paymentMethods,
              { paymentMethodId: paymentMethod, semantic: paymentMethod }
            )
            const response = await crmApi.invoiceQuote(
              quoteId,
              {
                version: quote.version,
                paymentMethodId: payment.methodId,
                collectionMode: collectionMode === 'receivable' ? 'receivable' : 'now',
                reference,
              },
              `crm-quote-invoice-${quoteId}`
            )
            const checkout = mapCheckoutFromApi(response)
            const sale = checkout.sale
              ? {
                ...checkout.sale,
                origin: checkout.sale.origin || 'pipeline',
                channel: checkout.sale.channel || 'crm',
              }
              : null
            const { receivableId, parkedForNextShift } = checkout
            if (!sale) throw new Error('No se pudo registrar la factura.')
            if (receivableId && proof) {
              const { usePosStore } = await import('@/stores/posStore')
              try {
                await usePosStore.getState().attachReceivableProof(receivableId, {
                  proof,
                  reference,
                })
              } catch (proofError) {
                throw new Error(
                  `La factura se emitió, pero el comprobante no se pudo adjuntar: ${proofError.message}`
                )
              }
            }
            let resolvedReceivableId = receivableId || null
            const { usePosStore } = await import('@/stores/posStore')
            if (!resolvedReceivableId && sale.id) {
              const { posApi } = await import('@/services/posApi')
              const { mapReceivableFromApi } = await import('@/services/adapters/pos')
              try {
                const recvResponse = await posApi.getReceivableForSale(sale.id)
                const linked = mapReceivableFromApi(recvResponse)
                if (linked?.id) {
                  resolvedReceivableId = linked.id
                  usePosStore.setState((state) => ({
                    receivables: [
                      linked,
                      ...state.receivables.filter((item) => item.id !== linked.id),
                    ],
                  }))
                }
              } catch {
                /* no receivable for this sale */
              }
            }
            const collectionStatus = invoiceCollectionStatusFromMethod(payment.method)
              || invoiceCollectionFromSalePolicy(sale)
              || 'collected'
            const needsReceivableTracking = collectionStatus !== 'collected'
            const updatedQuote = {
              ...quote,
              convertedSaleId: sale.id,
              invoiceNumber: sale.number,
              receivableId: resolvedReceivableId,
              invoicePaymentMethod: payment.semantic,
              structuralStatus: 'converted',
              invoiceCollection: collectionStatus,
              version: (quote.version || 1) + 1,
            }
            set((s) => ({
              quotes: replaceById(s.quotes, updatedQuote),
              sales: [sale, ...s.sales.filter((item) => item.id !== sale.id)],
            }))
            usePosStore.setState((state) => ({
              sales: [sale, ...state.sales.filter((item) => item.id !== sale.id)],
            }))
            if (needsReceivableTracking) {
              const total = Number(sale.total) || Number(updatedQuote.total) || 0
              if (resolvedReceivableId) {
                const receivableEntry = {
                  id: resolvedReceivableId,
                  saleId: sale.id,
                  branchId: quote.branchId,
                  customer: {
                    id: quote.customerId,
                    name: customer?.name || customer?.displayName || quote.customerName,
                  },
                  amount: total,
                  paidAmount: 0,
                  balance: total,
                  status: 'pending',
                  reference: sale.number || null,
                  apiSynced: true,
                  payments: [],
                }
                usePosStore.setState((state) => ({
                  receivables: [
                    receivableEntry,
                    ...state.receivables.filter((item) => item.id !== resolvedReceivableId),
                  ],
                }))
              }
              await usePosStore.getState().hydrateCxcWorkspace({ force: true }).catch(() => {})
              if (!resolvedReceivableId) {
                const { posApi } = await import('@/services/posApi')
                try {
                  const list = await posApi.listReceivables({ page: 1, pageSize: 50 })
                  const items = mapReceivablesPageFromApi(list || { items: [] }).items
                  const linked = findQuoteReceivable(
                    { convertedSaleId: sale.id },
                    items
                  )
                  if (linked) {
                    usePosStore.setState((state) => ({
                      receivables: [
                        linked,
                        ...state.receivables.filter((item) => item.id !== linked.id),
                      ],
                    }))
                  }
                } catch {
                  /* hydrate fallback already attempted */
                }
              }
            }
            return {
              sale,
              quote: updatedQuote,
              collectionMode: needsReceivableTracking ? 'receivable' : 'now',
              parkedForNextShift: Boolean(parkedForNextShift),
            }
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        const lead = quote.leadId
          ? get().leads.find((item) => item.id === quote.leadId)
          : null
        const sale = buildDemoSaleFromPipeline({
          lead: lead || {
            id: null,
            branchId: quote.branchId,
            name: quote.customerName,
            company: quote.customerName,
          },
          quote,
          customer: customer || { id: quote.customerId, name: quote.customerName },
          paymentMethod,
        })
        const updatedQuote = {
          ...quote,
          convertedSaleId: sale.id,
          invoiceNumber: sale.number,
          structuralStatus: 'converted',
        }
        set((s) => ({
          quotes: replaceById(s.quotes, updatedQuote),
          sales: [sale, ...s.sales.filter((item) => item.id !== sale.id)],
        }))
        const { usePosStore } = await import('@/stores/posStore')
        usePosStore.setState((state) => ({
          sales: [sale, ...state.sales.filter((item) => item.id !== sale.id)],
        }))
        return { sale, quote: updatedQuote }
      },

      deleteQuote: async (id) => {
        let current = get().quotes.find((quote) => quote.id === id)
        if (isOnline()) {
          try {
            if (!current) {
              current = await get().ensureQuoteDetail(id).catch(() => null)
            }
            if (!current) {
              throw new Error('La cotización no existe.')
            }
            const response = await crmApi.cancelQuote(id, current.version, 'Descartada desde CRM')
            const saved = mapCrmQuoteFromApi(response)
            set((s) => ({ quotes: replaceById(s.quotes, saved) }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        const discarded = current
          ? {
            ...current,
            structuralStatus: 'cancelled',
            status: 'rechazada',
            updatedAt: now(),
          }
          : null
        if (discarded) {
          set((s) => ({ quotes: replaceById(s.quotes, discarded) }))
        }
        return discarded
      },

      clearSensitive: () => {
        crmGeneration += 1
        saleDetailRequests.clear()
        quoteDetailRequests.clear()
        set({
        leads: [],
        leadsListMeta: emptyListMeta(),
        activities: [],
        quotes: [],
        customers: [],
        sales: [],
        overview: null,
        discoveryCapabilities: null,
        hydrating: false,
        error: null,
        dataState: { status: 'loading', source: null, error: null },
        simplifiedWorkspace: {
          items: [],
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 1,
          stageCounts: {},
          loading: false,
          error: null,
          countsLoading: false,
          countsError: null,
          detailActivities: [],
          detailActivitiesLoading: false,
        },
        uiMode: 'standard',
        uiModeVersion: 1,
        workspaceSettingsLoaded: false,
        workspaceSettingsSynced: false,
        })
      },

      getOverviewStats: () => {
        const { leads } = get()
        const qualified = leads.filter((l) => ['propuesta', 'negociacion'].includes(l.status)).length
        const convertedMonth = leads.filter((l) => {
          if (l.status !== 'cerrado') return false
          const d = new Date(l.pipelineClosedAt || l.updatedAt)
          const n = new Date()
          return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
        }).length
        const openLeads = leads.filter((l) => PIPELINE_OPEN_STAGES.includes(l.status))
        const pipelineValue = openLeads.reduce((a, l) => a + (l.pipelineValue || 0), 0)
        return {
          totalLeads: leads.length,
          qualifiedLeads: qualified,
          convertedMonth,
          pipelineValue,
          openOpportunities: openLeads.length,
        }
      },
    }),
    {
      name: 'diedo-crm',
      storage: ephemeralJsonStorage,
      version: 4,
      partialize: (state) => ({
        serpHourCount: state.serpHourCount,
        serpHourWindowStart: state.serpHourWindowStart,
        serpMonthCount: state.serpMonthCount,
        serpMonthKey: state.serpMonthKey,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted || {}),
        workspaceSettingsLoaded: false,
        workspaceSettingsSynced: false,
      }),
    }
  )
)

registerSensitiveStateCleaner(() => useCrmStore.getState().clearSensitive())
