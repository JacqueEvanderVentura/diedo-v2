import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'
import { registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { currentSessionActor } from '@/lib/sessionActor'
import { recordSerpUsage } from '@/modules/crm/lib/serpQuota'
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
  mapCrmSalesPageFromApi,
  mapCrmStateFromApi,
  mapLeadFromApi,
  mapLeadsPageFromApi,
  mapLeadsPaginatedFromApi,
  mapOpportunityFromApi,
  mapOpportunitiesPageFromApi,
  mapOpportunitiesPaginatedFromApi,
} from '@/services/adapters/crm'
import {
  CRM_INFINITE_PAGE_SIZE,
  DEFAULT_CRM_PAGE_SIZE,
  normalizeCrmPageSize,
} from '@/modules/crm/constants/paging'
import {
  emptyListMeta,
  fetchMissingLeadsForOpportunities,
  listMetaFromPaginated,
} from '@/modules/crm/lib/crmListLoading'
import {
  SIMPLIFIED_WORKSPACE_STAGES,
  buildSimplifiedOpportunityQuery,
} from '@/modules/crm/lib/simplifiedWorkspaceQuery'
import { paginateSlice } from '@/modules/reportes/lib/pagination'
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
import {
  buildOpportunityDraftFromLead,
  leadsMissingPipeline,
} from '@/modules/crm/lib/pipelineLeads'
import {
  effectiveOpportunityCustomerId,
  resolveCustomerForOpportunity,
} from '@/modules/crm/lib/opportunityCustomer'
import {
  mapCheckoutFromApi,
  mapReceivablesPageFromApi,
  mapSaleFromApi,
} from '@/services/adapters/pos'
import { useConfigStore } from '@/stores/configStore'
import { syncWorkspacePaymentMethods } from '@/lib/paymentMethodsSync'

const saleDetailRequests = new Map()
let crmGeneration = 0

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const isOnline = () => useSessionStore.getState().status === 'online'

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
      const [leadsRes, discoveryCapabilities, oppsRes] = await Promise.all([
        crmApi.leads({ page: 1, pageSize }),
        crmApi.discoveryCapabilities(),
        crmApi.opportunities({ page: 1, pageSize: 200 }),
      ])
      const leadsMapped = mapLeadsPaginatedFromApi(leadsRes)
      const oppsMapped = mapOpportunitiesPaginatedFromApi(oppsRes)
      return {
        leads: leadsMapped.items,
        leadsListMeta: listMetaFromPaginated(leadsMapped, { pageSize }),
        discoveryCapabilities,
        opportunities: oppsMapped.items,
        opportunitiesListMeta: listMetaFromPaginated(oppsMapped, { pageSize: 200 }),
      }
    }
    case 'pipeline': {
      const [oppsRes, quotes] = await Promise.all([
        crmApi.opportunities({ page: 1, pageSize: CRM_INFINITE_PAGE_SIZE }),
        readAllPages(crmApi.quotes),
        syncWorkspacePaymentMethods(),
      ])
      const oppsMapped = mapOpportunitiesPaginatedFromApi(oppsRes)
      const extraLeads = await fetchMissingLeadsForOpportunities([], oppsMapped.items)
      return {
        quotes: mapCrmQuotesPageFromApi(quotes),
        opportunities: oppsMapped.items,
        opportunitiesListMeta: listMetaFromPaginated(oppsMapped),
        leads: extraLeads,
      }
    }
    case 'activities': {
      const [activities, opportunities] = await Promise.all([
        readAllPages(crmApi.activities),
        readAllPages(crmApi.opportunities),
      ])
      return {
        activities: mapActivitiesPageFromApi(activities),
        opportunities: mapOpportunitiesPageFromApi(opportunities),
      }
    }
    case 'customers': {
      const pageSize = CRM_INFINITE_PAGE_SIZE
      const [salesRes, quotesRes, oppsRes, activitiesRes] = await Promise.all([
        crmApi.sales({ page: 1, pageSize }),
        crmApi.quotes({ page: 1, pageSize: 100 }),
        crmApi.opportunities({ page: 1, pageSize }),
        crmApi.activities({ page: 1, pageSize: 100 }),
      ])
      const oppsMapped = mapOpportunitiesPaginatedFromApi(oppsRes)
      return {
        sales: mapCrmSalesPageFromApi(salesRes),
        quotes: mapCrmQuotesPageFromApi(quotesRes),
        opportunities: oppsMapped.items,
        opportunitiesListMeta: listMetaFromPaginated(oppsMapped),
        activities: mapActivitiesPageFromApi(activitiesRes),
      }
    }
    case 'quotes': {
      const [quotes, opportunities, customers] = await Promise.all([
        readAllPages(crmApi.quotes),
        readAllPages(crmApi.opportunities),
        readAllPages(crmApi.customers),
        syncWorkspacePaymentMethods().catch(() => []),
      ])
      return {
        quotes: mapCrmQuotesPageFromApi(quotes),
        opportunities: mapOpportunitiesPageFromApi(opportunities),
        customers: mapCrmCustomersPageFromApi(customers),
      }
    }
    case 'purchases': {
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
    company: raw.company || raw.name || '',
    email: raw.email || null,
    phone: raw.phone || null,
    website: raw.website || null,
    location: raw.location || '',
    source: raw.source || 'manual',
    acquisitionSource: raw.acquisitionSource || null,
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
    opportunityId: raw.opportunityId || null,
    version: raw.version || 1,
  }
}

const RAW_SEED_LEADS = [
  { name: 'Glamour Studio RD', company: 'Glamour Studio', location: 'Santo Domingo', rawSnippet: 'Salón de belleza con citas y venta de productos', source: 'serp', acquisitionSource: 'instagram', status: 'calificado', phone: '809-555-1001' },
  { name: 'Spa Zen Caribe', company: 'Spa Zen', location: 'Piantini, SD', rawSnippet: 'Spa wellness masajes faciales reservas online', source: 'serp', acquisitionSource: 'whatsapp', status: 'contactado', phone: '809-555-1002' },
  { name: 'Clínica Dental Sonrisa', company: 'Dental Sonrisa', location: 'Santiago', rawSnippet: 'Consultorio dental citas pacientes', source: 'referral', acquisitionSource: 'referral', status: 'nuevo', phone: '809-555-1003', branchId: 'charm-santiago' },
  { name: 'Café Colonial', company: 'Café Colonial', location: 'Zona Colonial', rawSnippet: 'Restaurante café comida rápida POS', source: 'manual', acquisitionSource: 'pos_walk_in', status: 'nuevo', branchId: 'charm-este' },
  { name: 'Boutique Estilo', company: 'Boutique Estilo', location: 'Las Terrenas', rawSnippet: 'Tienda retail ropa inventario', source: 'import', acquisitionSource: 'otros', status: 'contactado', branchId: 'charm-santiago' },
  { name: 'AutoShine Carwash', company: 'AutoShine', location: 'Los Alcarrizos', rawSnippet: 'Car wash lavado autos citas membresías', source: 'serp', acquisitionSource: 'whatsapp', status: 'calificado', phone: '809-555-1006' },
  { name: 'FitLife Gym', company: 'FitLife', location: 'Naco', rawSnippet: 'Gimnasio fitness clases membresías CRM', source: 'serp', acquisitionSource: 'instagram', status: 'nuevo', phone: '809-555-1007' },
  { name: 'Ferretería El Martillo', company: 'El Martillo', location: 'San Cristóbal', rawSnippet: 'Ferretería retail inventario multi sucursal', source: 'manual', acquisitionSource: 'otros', status: 'descartado' },
  { name: 'Nails & More', company: 'Nails & More', location: 'Bávaro', rawSnippet: 'Nail salon belleza citas', source: 'serp', acquisitionSource: 'referral', status: 'calificado', phone: '809-555-1009' },
  { name: 'Restaurante Mar Azul', company: 'Mar Azul', location: 'Boca Chica', rawSnippet: 'Restaurante mariscos facturación caja', source: 'referral', acquisitionSource: 'whatsapp', status: 'contactado', phone: '809-555-1010' },
]

const SEED_OPPORTUNITIES = [
  { id: 'opp-1', title: 'Glamour Studio — Suite Agenda+POS', leadId: 'lead-seed-1', customerId: 'c2', customerName: 'Glamour Studio RD', stage: 'propuesta', value: 45000, branchId: 'charm-dn', assignedUserId: 'u1', notes: 'Interesados en agenda y POS', createdAt: daysAgo(12), updatedAt: daysAgo(2) },
  { id: 'opp-2', title: 'Spa Zen — Implementación completa', leadId: 'lead-seed-2', customerName: 'Spa Zen Caribe', stage: 'negociacion', value: 78000, branchId: 'charm-dn', assignedUserId: 'u2', notes: '', createdAt: daysAgo(20), updatedAt: daysAgo(1) },
  { id: 'opp-3', title: 'AutoShine — POS + membresías', leadId: 'lead-seed-6', customerName: 'AutoShine Carwash', stage: 'contactado', value: 32000, branchId: 'charm-santiago', assignedUserId: 'u1', notes: '', createdAt: daysAgo(5), updatedAt: daysAgo(3) },
  { id: 'opp-4', title: 'FitLife — CRM y agenda', leadId: 'lead-seed-7', customerName: 'FitLife Gym', stage: 'nuevo', value: 55000, branchId: 'charm-dn', assignedUserId: 'u2', notes: '', createdAt: daysAgo(3), updatedAt: daysAgo(3) },
  { id: 'opp-5', title: 'Dental Sonrisa — Agenda clínica', leadId: 'lead-seed-3', customerName: 'Clínica Dental Sonrisa', stage: 'cerrado', value: 62000, branchId: 'charm-santiago', assignedUserId: 'u1', notes: 'Ganada', createdAt: daysAgo(45), updatedAt: daysAgo(10) },
]

const hoursFromNow = (h) => new Date(Date.now() + h * 3600000).toISOString()

const SEED_ACTIVITIES = [
  { id: 'act-1', type: 'llamada', title: 'Llamada inicial Glamour Studio', description: 'Presentación de módulos Agenda y POS', opportunityId: 'opp-1', leadId: 'lead-seed-1', customerName: 'Glamour Studio RD', assignedUserId: 'u1', dueAt: daysAgo(2), completedAt: daysAgo(2), createdAt: daysAgo(3) },
  { id: 'act-2', type: 'email', title: 'Propuesta enviada Spa Zen', description: 'Cotización suite completa', opportunityId: 'opp-2', leadId: 'lead-seed-2', customerName: 'Spa Zen Caribe', assignedUserId: 'u2', dueAt: daysAgo(1), completedAt: daysAgo(1), createdAt: daysAgo(2) },
  { id: 'act-3', type: 'reunion', title: 'Demo AutoShine', description: 'Demostración POS en sitio', opportunityId: 'opp-3', leadId: 'lead-seed-6', customerName: 'AutoShine Carwash', assignedUserId: 'u1', dueAt: hoursFromNow(3), completedAt: null, createdAt: daysAgo(1) },
  { id: 'act-4', type: 'tarea', title: 'Seguimiento FitLife', description: 'Enviar caso de éxito gym', opportunityId: 'opp-4', leadId: 'lead-seed-7', customerName: 'FitLife Gym', assignedUserId: 'u2', dueAt: hoursFromNow(26), completedAt: null, createdAt: daysAgo(0) },
  { id: 'act-5', type: 'tarea', title: 'Llamar a Nicole Sosa', description: 'Confirmar próxima sesión de prueba', customerName: 'Nicole Sosa', assignedUserId: 'u1', dueAt: hoursFromNow(-2), completedAt: null, createdAt: daysAgo(0) },
]

const SEED_QUOTES = [
  { id: 'qt-1', number: 'COT-2026-001', opportunityId: 'opp-1', customerId: 'c2', customerName: 'Glamour Studio RD', status: 'enviada', total: 45000, items: [{ name: 'Módulo Agenda', qty: 1, price: 25000 }, { name: 'Módulo POS', qty: 1, price: 20000 }], branchId: 'charm-dn', validUntil: daysAgo(-15), createdAt: daysAgo(5), updatedAt: daysAgo(5) },
  { id: 'qt-2', number: 'COT-2026-002', opportunityId: 'opp-2', customerName: 'Spa Zen Caribe', status: 'borrador', total: 78000, items: [{ name: 'Suite Helios Completa', qty: 1, price: 78000 }], branchId: 'charm-dn', validUntil: daysAgo(-20), createdAt: daysAgo(2), updatedAt: daysAgo(2) },
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
      opportunities: [],
      opportunitiesListMeta: emptyListMeta(),
      activities: [],
      quotes: [],
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
        countsLoading: false,
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
            opportunities: SEED_OPPORTUNITIES,
            activities: SEED_ACTIVITIES,
            quotes: SEED_QUOTES,
            sales: [],
            customers: [],
            dataState: { status: 'demo', source: 'demo', error: null },
            hydrating: false,
          })
          await get().syncLeadsToPipeline()
          return get()
        }
        set({ hydrating: true, error: null, dataState: { status: 'loading', source: 'api', error: null } })
        try {
          const [stateResponse, customerResponse, salesResponse, overview] = await Promise.all([
            crmApi.state(),
            readAllPages(crmApi.customers),
            readAllPages(crmApi.sales),
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

      loadMoreOpportunities: async () => {
        if (!isOnline()) return
        const meta = get().opportunitiesListMeta
        if (meta.loadingMore || meta.page >= meta.totalPages) return
        set({ opportunitiesListMeta: { ...meta, loadingMore: true } })
        try {
          const response = await crmApi.opportunities({
            page: meta.page + 1,
            pageSize: CRM_INFINITE_PAGE_SIZE,
          })
          const mapped = mapOpportunitiesPaginatedFromApi(response)
          const extraLeads = await fetchMissingLeadsForOpportunities(get().leads, mapped.items)
          set((state) => ({
            opportunities: upsertById(state.opportunities, mapped.items),
            opportunitiesListMeta: listMetaFromPaginated(mapped),
            leads: extraLeads.length ? upsertById(state.leads, extraLeads) : state.leads,
          }))
        } catch (error) {
          set({ opportunitiesListMeta: { ...get().opportunitiesListMeta, loadingMore: false } })
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
            const { start, end } = resolvePeriodRange(dateFilter)
            const q = search.trim().toLowerCase()
            const leads = get().leads.length ? get().leads : buildSeedLeads()
            const opportunities = get().opportunities.length ? get().opportunities : SEED_OPPORTUNITIES
            const filtered = opportunities
              .filter((item) => !['perdido'].includes(item.stage))
              .filter((item) => item.stage === stage)
              .filter((item) => matchesBranches(item.branchId, branchIds))
              .filter((item) => {
                const updated = new Date(item.updatedAt || item.createdAt || 0)
                return updated >= start && updated <= end
              })
              .filter((item) => {
                if (!q) return true
                const lead = leads.find((l) => l.id === item.leadId)
                const title = (item.customerName || lead?.name || '').toLowerCase()
                const phone = (lead?.phone || '').toLowerCase()
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
              },
              opportunities: upsertById(state.opportunities, slice.items),
            }))
            return get().simplifiedWorkspace
          }

          const params = buildSimplifiedOpportunityQuery({
            stage,
            page,
            pageSize,
            search,
            branchIds,
            dateFilter,
          })
          const response = await crmApi.opportunities(params)
          const mapped = mapOpportunitiesPaginatedFromApi(response)
          const leadIds = [...new Set(mapped.items.map((item) => item.leadId).filter(Boolean))]
          const leadRecords = await Promise.all(
            leadIds.map((leadId) => crmApi.getLead(leadId).then(mapLeadFromApi).catch(() => null))
          )
          const leadsFetched = leadRecords.filter(Boolean)
          set((state) => ({
            simplifiedWorkspace: {
              ...state.simplifiedWorkspace,
              items: mapped.items,
              page: mapped.page,
              pageSize: mapped.pageSize,
              totalItems: mapped.totalItems,
              totalPages: mapped.totalPages,
              loading: false,
            },
            opportunities: upsertById(state.opportunities, mapped.items),
            leads: upsertById(state.leads, leadsFetched),
          }))
          return get().simplifiedWorkspace
        } catch (error) {
          set((state) => ({
            simplifiedWorkspace: { ...state.simplifiedWorkspace, loading: false },
            error,
          }))
          throw error
        }
      },

      fetchSimplifiedWorkspaceStageCounts: async ({ search = '', branchIds = [], dateFilter }) => {
        set((state) => ({
          simplifiedWorkspace: { ...state.simplifiedWorkspace, countsLoading: true },
        }))
        try {
          if (!isOnline()) {
            const { start, end } = resolvePeriodRange(dateFilter)
            const q = search.trim().toLowerCase()
            const leads = get().leads.length ? get().leads : buildSeedLeads()
            const opportunities = get().opportunities.length ? get().opportunities : SEED_OPPORTUNITIES
            const stageCounts = Object.fromEntries(SIMPLIFIED_WORKSPACE_STAGES.map((id) => [id, 0]))
            opportunities
              .filter((item) => !['perdido'].includes(item.stage))
              .filter((item) => matchesBranches(item.branchId, branchIds))
              .filter((item) => {
                const updated = new Date(item.updatedAt || item.createdAt || 0)
                return updated >= start && updated <= end
              })
              .filter((item) => {
                if (!q) return true
                const lead = leads.find((l) => l.id === item.leadId)
                const title = (item.customerName || lead?.name || '').toLowerCase()
                const phone = (lead?.phone || '').toLowerCase()
                return title.includes(q) || phone.includes(q)
              })
              .forEach((item) => {
                if (stageCounts[item.stage] !== undefined) stageCounts[item.stage] += 1
              })
            set((state) => ({
              simplifiedWorkspace: { ...state.simplifiedWorkspace, stageCounts, countsLoading: false },
            }))
            return stageCounts
          }

          const base = buildSimplifiedOpportunityQuery({
            stage: SIMPLIFIED_WORKSPACE_STAGES[0],
            page: 1,
            pageSize: 1,
            search,
            branchIds,
            dateFilter,
          })
          const responses = await Promise.all(
            SIMPLIFIED_WORKSPACE_STAGES.map((stageId) => crmApi.opportunities({ ...base, stage: stageId }))
          )
          const stageCounts = Object.fromEntries(
            SIMPLIFIED_WORKSPACE_STAGES.map((stageId, index) => {
              const mapped = mapOpportunitiesPaginatedFromApi(responses[index])
              return [stageId, mapped.totalItems]
            })
          )
          set((state) => ({
            simplifiedWorkspace: { ...state.simplifiedWorkspace, stageCounts, countsLoading: false },
          }))
          return stageCounts
        } catch (error) {
          set((state) => ({
            simplifiedWorkspace: { ...state.simplifiedWorkspace, countsLoading: false },
          }))
          throw error
        }
      },

      fetchSimplifiedWorkspaceDetailActivities: async (opportunityId) => {
        if (!opportunityId) {
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
              .filter((item) => item.opportunityId === opportunityId)
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
            opportunityId,
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

      applySimplifiedFollowUp: async (opportunityId, { dueAt, title, description }) => {
        const opportunity = get().opportunities.find((item) => item.id === opportunityId)
          || get().simplifiedWorkspace.items.find((item) => item.id === opportunityId)
        if (!opportunity) throw new Error('Oportunidad no encontrada.')
        const dueIso = dueAt ? new Date(dueAt).toISOString() : null
        await get().addActivity({
          type: 'tarea',
          title: title || 'Seguimiento programado',
          description: description || null,
          opportunityId: opportunity.id,
          leadId: opportunity.leadId || null,
          customerId: opportunity.customerId || null,
          customerName: opportunity.customerName,
          branchId: opportunity.branchId,
          dueAt: dueIso,
        })
        if (opportunity.stage !== 'negociacion') {
          await get().updateOpportunity(opportunityId, { stage: 'negociacion' })
        }
      },

      applySimplifiedLost: async (opportunityId, lostReason) => {
        const reason = String(lostReason || '').trim()
        if (!reason) throw new Error('Selecciona un motivo de pérdida.')
        await get().updateOpportunity(opportunityId, { stage: 'perdido', lostReason: reason })
      },

      addLead: async (data) => {
        const lead = normalizeLead(data)
        if (isOnline()) {
          try {
            const response = await crmApi.createLead(leadPayload(lead))
            const saved = mapLeadFromApi(response)
            set((s) => ({ leads: [saved, ...s.leads] }))
            await get().syncLeadsToPipeline([saved.id])
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({ leads: [lead, ...s.leads] }))
        await get().syncLeadsToPipeline([lead.id])
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
            await get().syncLeadsToPipeline(saved.map((item) => item.id))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({ leads: [...newLeads, ...s.leads] }))
        await get().syncLeadsToPipeline(newLeads.map((item) => item.id))
        return newLeads
      },

      updateLead: async (id, data) => {
        const current = get().leads.find((lead) => lead.id === id)
        if (!current) throw new Error('Lead no encontrado.')
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== id) return l
            return { ...l, ...data, updatedAt: now() }
          }),
        }))
        if (isOnline()) {
          const payload = { version: current.version }
          const fields = [
            'name', 'company', 'email', 'phone', 'website', 'location', 'status',
            'starRating', 'rawSnippet', 'acquisitionSource',
          ]
          fields.forEach((field) => {
            if (data[field] !== undefined) payload[field] = data[field]
          })
          try {
            const response = await crmApi.updateLead(id, payload)
            const saved = mapLeadFromApi(response)
            set((s) => ({ leads: replaceById(s.leads, saved) }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        return get().leads.find((lead) => lead.id === id)
      },

      deleteLeads: async (leadIds) => {
        const ids = [...new Set(leadIds)].filter(Boolean)
        if (!ids.length) return { items: [] }
        if (!isOnline()) {
          set((state) => ({
            leads: state.leads.filter((lead) => !ids.includes(lead.id)),
            opportunities: state.opportunities.filter((opp) => !ids.includes(opp.leadId)),
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
            opportunities: state.opportunities.filter((opp) => !deleted.has(opp.leadId)),
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
            l.id === leadId ? { ...l, status: 'convertido', customerId: customer.id, updatedAt: now() } : l
          ),
          opportunities: s.opportunities.map((opportunity) => (
            opportunity.leadId === leadId
              ? { ...opportunity, customerId: customer.id, customerName: customer.name, updatedAt: now() }
              : opportunity
          )),
        }))
        return customer
      },

      syncLeadsToPipeline: async (leadIds = null) => {
        const pending = leadIds
          ? leadsMissingPipeline(get().leads.filter((lead) => leadIds.includes(lead.id)))
          : leadsMissingPipeline(get().leads)
        for (const lead of pending) {
          try {
            await get().addToPipeline(lead.id)
          } catch {
            // Best-effort: un lead fallido no debe bloquear el resto.
          }
        }
        return pending.length
      },

      addToPipeline: async (leadId) => {
        const lead = get().leads.find((l) => l.id === leadId)
        if (!lead) return null
        if (lead.opportunityId) {
          return get().opportunities.find((opportunity) => opportunity.id === lead.opportunityId) || null
        }
        const ts = now()
        const opp = buildOpportunityDraftFromLead(lead, {
          id: genId('opp'),
          timestamps: { createdAt: ts, updatedAt: ts },
        })
        if (isOnline()) {
          try {
            const response = await crmApi.createLeadOpportunity(leadId, {
              title: opp.title,
              stage: opp.stage,
              value: opp.value,
              notes: opp.notes || null,
            })
            const saved = mapOpportunityFromApi(response)
            const updatedLead = mapLeadFromApi(await crmApi.getLead(leadId))
            set((s) => ({
              opportunities: [saved, ...s.opportunities.filter((item) => item.id !== saved.id)],
              leads: s.leads.map((item) => (
                item.id === leadId
                  ? updatedLead
                  : item
              )),
            }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({
          opportunities: [opp, ...s.opportunities],
          leads: s.leads.map((l) => (
            l.id === leadId ? { ...l, opportunityId: opp.id, updatedAt: ts } : l
          )),
        }))
        return opp
      },

      addOpportunity: async (data) => {
        const opp = { id: genId('opp'), createdAt: now(), updatedAt: now(), stage: 'nuevo', value: 0, ...data }
        if (isOnline()) {
          try {
            const response = await crmApi.createOpportunity({
              branchId: opp.branchId,
              leadId: opp.leadId || null,
              customerId: opp.customerId || null,
              assignedMembershipId: opp.assignedUserId || null,
              title: opp.title,
              customerName: opp.customerName,
              stage: opp.stage,
              value: opp.value,
              notes: opp.notes || null,
            })
            const saved = mapOpportunityFromApi(response)
            set((s) => ({
              opportunities: [saved, ...s.opportunities.filter((item) => item.id !== saved.id)],
              leads: saved.leadId
                ? s.leads.map((lead) => (
                    lead.id === saved.leadId
                      ? { ...lead, opportunityId: saved.id }
                      : lead
                  ))
                : s.leads,
            }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({
          opportunities: [opp, ...s.opportunities],
          leads: opp.leadId
            ? s.leads.map((lead) => (
                lead.id === opp.leadId
                  ? { ...lead, opportunityId: opp.id }
                  : lead
              ))
            : s.leads,
        }))
        return opp
      },

      updateOpportunityStage: (id, stage) => get().updateOpportunity(id, { stage }),

      closeOpportunityWithInvoice: async (opportunityId, { paymentMethod = 'efectivo', customerId } = {}) => {
        const customers = useCustomersStore.getState().customers
        let opportunity = get().opportunities.find((item) => item.id === opportunityId)
        const resolvedId = customerId || effectiveOpportunityCustomerId(opportunity, customers)
        if (resolvedId && !opportunity?.customerId) {
          const linked = customers.find((item) => item.id === resolvedId)
            || resolveCustomerForOpportunity(opportunity, customers)
          await get().updateOpportunity(opportunityId, {
            customerId: resolvedId,
            customerName: linked?.name || opportunity?.customerName,
          })
        } else if (customerId && customerId !== opportunity?.customerId) {
          const linked = customers.find((item) => item.id === customerId)
          await get().updateOpportunity(opportunityId, {
            customerId,
            customerName: linked?.name || opportunity?.customerName,
          })
        }
        opportunity = get().opportunities.find((item) => item.id === opportunityId)
        const validationError = validatePipelineClose({ opportunity, quotes: get().quotes })
        if (validationError) throw new Error(validationError)

        const quote = findBillableQuote(get().quotes, opportunityId)
        if (!quote) throw new Error('No se encontró una cotización facturable.')

        const customer = useCustomersStore.getState().customers.find(
          (item) => item.id === opportunity.customerId
        ) || { id: opportunity.customerId, name: opportunity.customerName, phone: null }

        let sale
        if (isOnline()) {
          let billableQuote = quote
          if (!billableQuote.convertedSaleId && billableQuote.status !== 'aceptada') {
            billableQuote = await get().updateQuote(billableQuote.id, { status: 'aceptada' }) || billableQuote
          }
          if (billableQuote.convertedSaleId) {
            sale = mapSaleFromApi(await crmApi.getSale(billableQuote.convertedSaleId))
          } else {
            sale = (await get().invoiceQuote(billableQuote.id, { paymentMethod })).sale
          }

        } else {
          sale = buildDemoSaleFromPipeline({
            opportunity,
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

        await get().updateOpportunity(opportunityId, { stage: 'cerrado' })
        return sale
      },

      updateOpportunity: async (id, data) => {
        const current = get().opportunities.find((opportunity) => opportunity.id === id)
        if (isOnline() && current) {
          const payload = { version: current.version }
          const fields = ['customerId', 'title', 'customerName', 'stage', 'value', 'notes', 'lostReason']
          fields.forEach((field) => {
            if (data[field] !== undefined) payload[field] = data[field]
          })
          if (payload.stage === 'perdido' && !payload.lostReason) {
            payload.lostReason = 'Marcada como perdida desde el pipeline.'
          }
          try {
            const response = await crmApi.updateOpportunity(id, payload)
            const saved = mapOpportunityFromApi(response)
            set((s) => ({ opportunities: replaceById(s.opportunities, saved) }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        if (!current) return null
        const updated = { ...current, ...data, updatedAt: now() }
        set((s) => ({ opportunities: replaceById(s.opportunities, updated) }))
        return updated
      },

      addActivity: async (data) => {
        const relatedOpportunity = get().opportunities.find(
          (opportunity) => opportunity.id === data.opportunityId
        )
        const branchId = data.branchId
          || relatedOpportunity?.branchId
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
              opportunityId: act.opportunityId || null,
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
              opportunityId: quote.opportunityId || null,
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
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({ quotes: [quote, ...s.quotes] }))
        return quote
      },

      updateQuote: async (id, data, retryAfterVersionConflict = false) => {
        const current = get().quotes.find((quote) => quote.id === id)
        if (isOnline() && current) {
          const payload = { version: current.version }
          if (data.status !== undefined) payload.status = data.status
          if (data.validUntil !== undefined) payload.validUntil = data.validUntil
          if (data.notes !== undefined) payload.notes = data.notes
          if (data.opportunityId !== undefined) payload.opportunityId = data.opportunityId
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
        }
        set((s) => ({ quotes: replaceById(s.quotes, updated) }))
        return updated
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
            const { sale, receivableId, parkedForNextShift } = mapCheckoutFromApi(response)
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
        const opportunity = quote.opportunityId
          ? get().opportunities.find((item) => item.id === quote.opportunityId)
          : null
        const sale = buildDemoSaleFromPipeline({
          opportunity: opportunity || {
            id: null,
            branchId: quote.branchId,
            customerName: quote.customerName,
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
        const current = get().quotes.find((quote) => quote.id === id)
        if (isOnline() && current) {
          try {
            const response = await crmApi.cancelQuote(id, current.version)
            const saved = mapCrmQuoteFromApi(response)
            set((s) => ({ quotes: replaceById(s.quotes, saved) }))
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({ quotes: s.quotes.filter((q) => q.id !== id) }))
        return current || null
      },

      clearSensitive: () => {
        crmGeneration += 1
        saleDetailRequests.clear()
        set({
        leads: [],
        leadsListMeta: emptyListMeta(),
        opportunities: [],
        opportunitiesListMeta: emptyListMeta(),
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
          countsLoading: false,
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
        const { leads, opportunities } = get()
        const qualified = leads.filter((l) => l.status === 'calificado').length
        const convertedMonth = leads.filter((l) => {
          if (l.status !== 'convertido') return false
          const d = new Date(l.updatedAt)
          const n = new Date()
          return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
        }).length
        const pipelineValue = opportunities
          .filter((o) => !['cerrado', 'perdido'].includes(o.stage))
          .reduce((a, o) => a + (o.value || 0), 0)
        return {
          totalLeads: leads.length,
          qualifiedLeads: qualified,
          convertedMonth,
          pipelineValue,
          openOpportunities: opportunities.filter((o) => !['cerrado', 'perdido'].includes(o.stage)).length,
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
