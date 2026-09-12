import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'
import { registerSensitiveStateCleaner } from '@/services/storagePolicy'
import { currentSessionActor } from '@/lib/sessionActor'
import { computeAutoScore, effectiveScore } from '@/modules/crm/lib/scoring'
import { recordSerpUsage } from '@/modules/crm/lib/serpQuota'
import { DEFAULT_SCORING_WEIGHTS } from '@/data/crm'
import { useCustomersStore } from '@/stores/customersStore'
import { useSessionStore } from '@/stores/sessionStore'
import { crmApi } from '@/services/crmApi'
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
  mapOpportunityFromApi,
  mapOpportunitiesPageFromApi,
} from '@/services/adapters/crm'
import {
  buildDemoSaleFromPipeline,
  buildPipelineCheckoutPayload,
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
  mapSaleMutationResponse,
} from '@/services/adapters/pos'
import { posApi } from '@/services/posApi'
import { useConfigStore } from '@/stores/configStore'
import { syncWorkspacePaymentMethods } from '@/lib/paymentMethodsSync'

const saleDetailRequests = new Map()

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()
const isOnline = () => useSessionStore.getState().status === 'online'

function replaceById(items, entity) {
  return items.map((item) => (item.id === entity.id ? entity : item))
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
    scoreManual: data.scoreManual ?? null,
    scoreNotes: data.scoreNotes || null,
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
      const [page, settings, discoveryCapabilities] = await Promise.all([
        crmApi.leads({ page: 1, pageSize: 200 }),
        crmApi.scoring(),
        crmApi.discoveryCapabilities(),
      ])
      return {
        leads: mapLeadsPageFromApi(page),
        scoringWeights: settings.weights,
        scoringVersion: settings.version,
        discoveryCapabilities,
      }
    }
    case 'pipeline': {
      const [opportunities, leads] = await Promise.all([
        crmApi.opportunities({ page: 1, pageSize: 200 }),
        crmApi.leads({ page: 1, pageSize: 200 }),
      ])
      return {
        opportunities: mapOpportunitiesPageFromApi(opportunities),
        leads: mapLeadsPageFromApi(leads),
      }
    }
    case 'activities': {
      const [activities, opportunities] = await Promise.all([
        crmApi.activities({ page: 1, pageSize: 200 }),
        crmApi.opportunities({ page: 1, pageSize: 200 }),
      ])
      return {
        activities: mapActivitiesPageFromApi(activities),
        opportunities: mapOpportunitiesPageFromApi(opportunities),
      }
    }
    case 'customers': {
      const customers = await crmApi.customers({ page: 1, pageSize: 200 })
      return { customers: mapCrmCustomersPageFromApi(customers) }
    }
    case 'quotes': {
      const [quotes, opportunities, customers] = await Promise.all([
        crmApi.quotes({ page: 1, pageSize: 200 }),
        crmApi.opportunities({ page: 1, pageSize: 200 }),
        crmApi.customers({ page: 1, pageSize: 200 }),
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
        crmApi.sales({ page: 1, pageSize: 200 }),
        crmApi.customers({ page: 1, pageSize: 200 }),
      ])
      return {
        sales: mapCrmSalesPageFromApi(sales),
        customers: mapCrmCustomersPageFromApi(customers),
      }
    }
    case 'sales': {
      const sales = await crmApi.sales({ page: 1, pageSize: 200 })
      return { sales: mapCrmSalesPageFromApi(sales) }
    }
    default:
      throw new Error(`Sección CRM desconocida: ${section}`)
  }
}

function normalizeLead(raw, weights) {
  const { score, moduleFits, reasons } = computeAutoScore(raw, weights)
  const scoreManual = raw.scoreManual ?? null
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
    scoreManual,
    scoreAuto: score,
    score: effectiveScore({ scoreManual, scoreAuto: score }),
    moduleFits,
    scoreReasons: reasons,
    scoreNotes: raw.scoreNotes || '',
    branchId: raw.branchId || 'charm-dn',
    assignedUserId: raw.assignedUserId || currentSessionActor().id,
    createdAt: raw.createdAt || now(),
    updatedAt: raw.updatedAt || now(),
    customerId: raw.customerId || null,
    opportunityId: raw.opportunityId || null,
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

function recomputeLeads(leads, weights) {
  return leads.map((l) => {
    const scored = computeAutoScore(l, weights)
    const score = l.scoreManual != null ? l.scoreManual : scored.score
    return { ...l, scoreAuto: scored.score, moduleFits: scored.moduleFits, scoreReasons: scored.reasons, score }
  })
}

function buildSeedLeads() {
  return RAW_SEED_LEADS.map((l, i) =>
    normalizeLead({ ...l, id: `lead-seed-${i + 1}`, createdAt: daysAgo(30 - i * 2), updatedAt: daysAgo(i) }, DEFAULT_SCORING_WEIGHTS)
  )
}

export const useCrmStore = create(
  persist(
    (set, get) => ({
      leads: [],
      opportunities: [],
      activities: [],
      quotes: [],
      customers: [],
      sales: [],
      overview: null,
      discoveryCapabilities: null,
      scoringWeights: { ...DEFAULT_SCORING_WEIGHTS },
      scoringVersion: 1,
      serpHourCount: 0,
      serpHourWindowStart: Date.now(),
      serpMonthCount: 0,
      serpMonthKey: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      dataState: { status: 'loading', source: null, error: null },
      hydrating: false,
      error: null,
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
            crmApi.customers({ page: 1, pageSize: 200 }),
            crmApi.sales({ page: 1, pageSize: 200 }),
            crmApi.overview(),
          ])
          const mapped = mapCrmStateFromApi(stateResponse)
          const customers = mapCrmCustomersPageFromApi(customerResponse)
          const sales = mapCrmSalesPageFromApi(salesResponse)
          set({
            ...mapped,
            customers,
            sales,
            overview: mapCrmOverviewFromApi(overview),
            hydrating: false,
            dataState: { status: 'ready', source: 'api', error: null },
          })
          useCustomersStore.getState().mergeCrmProfiles?.(customers)
          await get().syncLeadsToPipeline()
          return get()
        } catch (error) {
          set({ hydrating: false, error, dataState: { status: 'error', source: null, error } })
          throw error
        }
      },

      hydrateSection: async (section) => {
        if (!isOnline()) return get().hydrate({ force: true })
        set({
          hydrating: true,
          error: null,
          dataState: { status: 'loading', source: 'api', error: null },
        })
        try {
          const updates = await loadOnlineSection(section)
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
          set({
            ...updates,
            hydrating: false,
            dataState: { status: 'ready', source: 'api', error: null },
          })
          if (updates.customers) {
            useCustomersStore.getState().mergeCrmProfiles?.(updates.customers)
          }
          if (section === 'pipeline' || section === 'leads') {
            await get().syncLeadsToPipeline()
          }
          return updates
        } catch (error) {
          set({ hydrating: false, error, dataState: { status: 'error', source: null, error } })
          throw error
        }
      },

      recordSerpSearch: () =>
        set((state) => recordSerpUsage(state)),

      updateScoringWeights: (weights) => {
        set((s) => {
          const merged = { ...s.scoringWeights, ...weights }
          return { scoringWeights: merged, leads: recomputeLeads(s.leads, merged) }
        })
        if (isOnline()) {
          crmApi.updateScoring({ version: get().scoringVersion, weights })
            .then((result) => {
              set({ scoringWeights: result.weights, scoringVersion: result.version })
              return get().hydrateSection('leads')
            })
            .catch((error) => reportMutationError(set, error))
        }
      },

      addLead: async (data) => {
        const lead = normalizeLead(data, get().scoringWeights)
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
        const weights = get().scoringWeights
        const ts = now()
        const newLeads = items.map((item) =>
          normalizeLead({ ...item, source, scrapedAt: ts, status: 'nuevo' }, weights)
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

      updateLead: (id, data) => {
        const current = get().leads.find((lead) => lead.id === id)
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== id) return l
            const merged = { ...l, ...data, updatedAt: now() }
            if (data.scoreManual !== undefined) {
              merged.score = effectiveScore(merged)
            }
            return merged
          }),
        }))
        if (isOnline() && current) {
          const payload = { version: current.version }
          const fields = [
            'name', 'company', 'email', 'phone', 'website', 'location', 'status',
            'scoreManual', 'scoreNotes', 'rawSnippet',
          ]
          fields.forEach((field) => {
            if (data[field] !== undefined) payload[field] = data[field]
          })
          crmApi.updateLead(id, payload)
            .then((response) => {
              const saved = mapLeadFromApi(response)
              set((s) => ({ leads: replaceById(s.leads, saved) }))
            })
            .catch((error) => reportMutationError(set, error))
        }
      },

      setManualScore: (id, scoreManual, scoreNotes = '') => get().updateLead(id, {
        scoreManual: scoreManual != null && scoreManual !== '' ? Number(scoreManual) : null,
        scoreNotes,
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
            set((s) => ({
              opportunities: [saved, ...s.opportunities.filter((item) => item.id !== saved.id)],
              leads: s.leads.map((item) => (
                item.id === leadId
                  ? { ...item, opportunityId: saved.id, updatedAt: saved.updatedAt }
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
          if (billableQuote.status !== 'aceptada') {
            billableQuote = await get().updateQuote(billableQuote.id, { status: 'aceptada' }) || billableQuote
          }
          const registerResponse = await posApi.listRegisters({
            branchId: opportunity.branchId,
            status: 'open',
            pageSize: 1,
          })
          const register = registerResponse?.items?.[0]
          const payload = buildPipelineCheckoutPayload({
            quote: billableQuote,
            opportunity,
            customer,
            branchId: opportunity.branchId,
            registerId: register?.id,
            paymentMethods: useConfigStore.getState().paymentMethods,
            method: paymentMethod,
          })
          const response = await posApi.checkout(payload, {
            idempotencyKey: `crm-pipeline-${opportunityId}`,
          })
          sale = mapSaleMutationResponse(response)
          if (sale?.id) {
            const detail = await crmApi.getSale(sale.id)
            sale = mapSaleFromApi(detail)
          }
          if (sale) {
            const { usePosStore } = await import('@/stores/posStore')
            usePosStore.setState((state) => ({
              sales: [sale, ...state.sales.filter((item) => item.id !== sale.id)],
            }))
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
            const { sale, receivableId } = mapCheckoutFromApi(response)
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
            return { sale, quote: updatedQuote, collectionMode: needsReceivableTracking ? 'receivable' : 'now' }
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

      clearSensitive: () => set({
        leads: [],
        opportunities: [],
        activities: [],
        quotes: [],
        customers: [],
        sales: [],
        overview: null,
        discoveryCapabilities: null,
        hydrating: false,
        error: null,
        dataState: { status: 'loading', source: null, error: null },
      }),

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
      version: 2,
      partialize: (state) => ({
        scoringWeights: state.scoringWeights,
        serpHourCount: state.serpHourCount,
        serpHourWindowStart: state.serpHourWindowStart,
        serpMonthCount: state.serpMonthCount,
        serpMonthKey: state.serpMonthKey,
      }),
    }
  )
)

registerSensitiveStateCleaner(() => useCrmStore.getState().clearSensitive())
