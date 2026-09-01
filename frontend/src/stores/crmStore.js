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
  { name: 'Glamour Studio RD', company: 'Glamour Studio', location: 'Santo Domingo', rawSnippet: 'Salón de belleza con citas y venta de productos', source: 'serp', status: 'calificado', phone: '809-555-1001' },
  { name: 'Spa Zen Caribe', company: 'Spa Zen', location: 'Piantini, SD', rawSnippet: 'Spa wellness masajes faciales reservas online', source: 'serp', status: 'contactado', phone: '809-555-1002' },
  { name: 'Clínica Dental Sonrisa', company: 'Dental Sonrisa', location: 'Santiago', rawSnippet: 'Consultorio dental citas pacientes', source: 'referral', status: 'nuevo', phone: '809-555-1003', branchId: 'charm-santiago' },
  { name: 'Café Colonial', company: 'Café Colonial', location: 'Zona Colonial', rawSnippet: 'Restaurante café comida rápida POS', source: 'manual', status: 'nuevo', branchId: 'charm-este' },
  { name: 'Boutique Estilo', company: 'Boutique Estilo', location: 'Las Terrenas', rawSnippet: 'Tienda retail ropa inventario', source: 'import', status: 'contactado', branchId: 'charm-santiago' },
  { name: 'AutoShine Carwash', company: 'AutoShine', location: 'Los Alcarrizos', rawSnippet: 'Car wash lavado autos citas membresías', source: 'serp', status: 'calificado', phone: '809-555-1006' },
  { name: 'FitLife Gym', company: 'FitLife', location: 'Naco', rawSnippet: 'Gimnasio fitness clases membresías CRM', source: 'serp', status: 'nuevo', phone: '809-555-1007' },
  { name: 'Ferretería El Martillo', company: 'El Martillo', location: 'San Cristóbal', rawSnippet: 'Ferretería retail inventario multi sucursal', source: 'manual', status: 'descartado' },
  { name: 'Nails & More', company: 'Nails & More', location: 'Bávaro', rawSnippet: 'Nail salon belleza citas', source: 'serp', status: 'calificado', phone: '809-555-1009' },
  { name: 'Restaurante Mar Azul', company: 'Mar Azul', location: 'Boca Chica', rawSnippet: 'Restaurante mariscos facturación caja', source: 'referral', status: 'contactado', phone: '809-555-1010' },
]

const SEED_OPPORTUNITIES = [
  { id: 'opp-1', title: 'Glamour Studio — Suite Agenda+POS', leadId: 'lead-seed-1', customerName: 'Glamour Studio RD', stage: 'propuesta', value: 45000, branchId: 'charm-dn', assignedUserId: 'u1', notes: 'Interesados en agenda y POS', createdAt: daysAgo(12), updatedAt: daysAgo(2) },
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
  { id: 'qt-1', number: 'COT-2026-001', opportunityId: 'opp-1', customerName: 'Glamour Studio RD', status: 'enviada', total: 45000, items: [{ name: 'Módulo Agenda', qty: 1, price: 25000 }, { name: 'Módulo POS', qty: 1, price: 20000 }], branchId: 'charm-dn', validUntil: daysAgo(-15), createdAt: daysAgo(5), updatedAt: daysAgo(5) },
  { id: 'qt-2', number: 'COT-2026-002', opportunityId: 'opp-2', customerName: 'Spa Zen Caribe', status: 'borrador', total: 78000, items: [{ name: 'Suite Diedo Completa', qty: 1, price: 78000 }], branchId: 'charm-dn', validUntil: daysAgo(-20), createdAt: daysAgo(2), updatedAt: daysAgo(2) },
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
          set({
            ...updates,
            hydrating: false,
            dataState: { status: 'ready', source: 'api', error: null },
          })
          if (updates.customers) {
            useCustomersStore.getState().mergeCrmProfiles?.(updates.customers)
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
            return saved
          } catch (error) {
            reportMutationError(set, error)
            throw error
          }
        }
        set((s) => ({ leads: [...newLeads, ...s.leads] }))
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
          const response = await crmApi.convertLead(leadId, {
            version: lead.version,
            customerType: lead.company ? 'business' : 'person',
            displayName: lead.company || lead.name,
            businessName: lead.company || null,
            email: lead.email,
            phone: lead.phone,
            branchIds: lead.branchId ? [lead.branchId] : undefined,
            lifecycleStatus: 'prospecto',
            notes: lead.scoreNotes || null,
          })
          await Promise.all([
            get().hydrateSection('leads'),
            get().hydrateSection('customers'),
            useCustomersStore.getState().hydrate({ force: true }),
          ])
          return mapCrmCustomersPageFromApi({ items: [response] })[0]
        }
        const customer = await useCustomersStore.getState().addCustomer({
          name: lead.company || lead.name,
          phone: lead.phone,
          email: lead.email,
          points: 0,
          notes: lead.scoreNotes || '',
          customerType: 'b2b',
          customerStatus: 'prospecto',
          branchId: lead.branchId,
          branchIds: lead.branchId ? [lead.branchId] : undefined,
          leadId: lead.id,
        })
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId ? { ...l, status: 'convertido', customerId: customer.id, updatedAt: now() } : l
          ),
        }))
        return customer
      },

      addToPipeline: (leadId) => {
        const lead = get().leads.find((l) => l.id === leadId)
        if (!lead) return null
        const opp = {
          id: genId('opp'),
          title: `${lead.company || lead.name} — Oportunidad`,
          leadId: lead.id,
          customerName: lead.company || lead.name,
          stage: lead.status === 'calificado' ? 'propuesta' : 'contactado',
          value: Math.round((lead.score || 50) * 500),
          branchId: lead.branchId,
          assignedUserId: lead.assignedUserId,
          notes: lead.scoreNotes || '',
          createdAt: now(),
          updatedAt: now(),
        }
        set((s) => ({
          opportunities: [opp, ...s.opportunities],
          leads: s.leads.map((l) =>
            l.id === leadId
              ? { ...l, opportunityId: opp.id, status: l.status === 'nuevo' ? 'contactado' : l.status, updatedAt: now() }
              : l
          ),
        }))
        if (isOnline()) {
          crmApi.createLeadOpportunity(leadId, {
            title: opp.title,
            stage: opp.stage,
            value: opp.value,
            notes: opp.notes || null,
          })
            .then((response) => {
              const saved = mapOpportunityFromApi(response)
              set((s) => ({
                opportunities: [
                  saved,
                  ...s.opportunities.filter((item) => item.id !== opp.id),
                ],
                leads: s.leads.map((item) => (
                  item.id === leadId
                    ? { ...item, opportunityId: saved.id, status: item.status === 'nuevo' ? 'contactado' : item.status }
                    : item
                )),
              }))
            })
            .catch((error) => reportMutationError(set, error))
        }
        return opp
      },

      addOpportunity: (data) => {
        const opp = { id: genId('opp'), createdAt: now(), updatedAt: now(), stage: 'nuevo', value: 0, ...data }
        set((s) => ({ opportunities: [opp, ...s.opportunities] }))
        if (isOnline()) {
          crmApi.createOpportunity({
            branchId: opp.branchId,
            leadId: opp.leadId || null,
            customerId: opp.customerId || null,
            title: opp.title,
            customerName: opp.customerName,
            stage: opp.stage,
            value: opp.value,
            notes: opp.notes || null,
          })
            .then((response) => {
              const saved = mapOpportunityFromApi(response)
              set((s) => ({
                opportunities: [
                  saved,
                  ...s.opportunities.filter((item) => item.id !== opp.id),
                ],
              }))
            })
            .catch((error) => reportMutationError(set, error))
        }
        return opp
      },

      updateOpportunityStage: (id, stage) => get().updateOpportunity(id, { stage }),

      updateOpportunity: (id, data) => {
        const current = get().opportunities.find((opportunity) => opportunity.id === id)
        set((s) => ({
          opportunities: s.opportunities.map((o) => (o.id === id ? { ...o, ...data, updatedAt: now() } : o)),
        }))
        if (isOnline() && current) {
          const payload = { version: current.version }
          const fields = ['customerId', 'title', 'customerName', 'stage', 'value', 'notes', 'lostReason']
          fields.forEach((field) => {
            if (data[field] !== undefined) payload[field] = data[field]
          })
          if (payload.stage === 'perdido' && !payload.lostReason) {
            payload.lostReason = 'Marcada como perdida desde el pipeline.'
          }
          crmApi.updateOpportunity(id, payload)
            .then((response) => {
              const saved = mapOpportunityFromApi(response)
              set((s) => ({ opportunities: replaceById(s.opportunities, saved) }))
            })
            .catch((error) => reportMutationError(set, error))
        }
      },

      addActivity: (data) => {
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
          assignedUserId: currentSessionActor().id,
          branchId,
          ...data,
        }
        set((s) => ({ activities: [act, ...s.activities] }))
        if (isOnline()) {
          crmApi.createActivity({
            branchId,
            leadId: act.leadId || null,
            opportunityId: act.opportunityId || null,
            customerId: act.customerId || null,
            type: act.type,
            title: act.title,
            description: act.description || null,
            customerName: act.customerName || null,
            dueAt: act.dueAt || null,
          })
            .then((response) => {
              const saved = mapActivityFromApi(response)
              set((s) => ({
                activities: [saved, ...s.activities.filter((item) => item.id !== act.id)],
              }))
            })
            .catch((error) => reportMutationError(set, error))
        }
        return act
      },

      updateActivity: (id, data) => {
        const current = get().activities.find((activity) => activity.id === id)
        set((s) => ({
          activities: s.activities.map((a) => (a.id === id ? { ...a, ...data } : a)),
        }))
        if (isOnline() && current) {
          const payload = { version: current.version }
          const fields = ['type', 'title', 'description', 'customerName', 'dueAt']
          fields.forEach((field) => {
            if (data[field] !== undefined) payload[field] = data[field]
          })
          crmApi.updateActivity(id, payload)
            .then((response) => {
              const saved = mapActivityFromApi(response)
              set((s) => ({ activities: replaceById(s.activities, saved) }))
            })
            .catch((error) => reportMutationError(set, error))
        }
      },

      toggleActivityComplete: (id) => {
        const current = get().activities.find((activity) => activity.id === id)
        set((s) => ({
          activities: s.activities.map((a) =>
            a.id === id ? { ...a, completedAt: a.completedAt ? null : now() } : a
          ),
        }))
        if (isOnline() && current) {
          const request = current.completedAt ? crmApi.reopenActivity : crmApi.completeActivity
          request(id, current.version)
            .then((response) => {
              const saved = mapActivityFromApi(response)
              set((s) => ({ activities: replaceById(s.activities, saved) }))
            })
            .catch((error) => reportMutationError(set, error))
        }
      },

      addQuote: (data) => {
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
        set((s) => ({ quotes: [quote, ...s.quotes] }))
        if (isOnline()) {
          crmApi.createQuote({
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
            .then((response) => {
              const saved = mapCrmQuoteFromApi(response)
              set((s) => ({
                quotes: [saved, ...s.quotes.filter((item) => item.id !== quote.id)],
              }))
            })
            .catch((error) => reportMutationError(set, error))
        }
        return quote
      },

      updateQuote: (id, data) => {
        const current = get().quotes.find((quote) => quote.id === id)
        set((s) => ({
          quotes: s.quotes.map((q) => (q.id === id ? { ...q, ...data, updatedAt: now() } : q)),
        }))
        if (isOnline() && current) {
          const payload = { version: current.version }
          if (data.status !== undefined) payload.status = data.status
          if (data.validUntil !== undefined) payload.validUntil = data.validUntil
          if (data.notes !== undefined) payload.notes = data.notes
          crmApi.updateQuote(id, payload)
            .then((response) => {
              const saved = mapCrmQuoteFromApi(response)
              set((s) => ({ quotes: replaceById(s.quotes, saved) }))
            })
            .catch((error) => reportMutationError(set, error))
        }
      },

      deleteQuote: (id) => {
        const current = get().quotes.find((quote) => quote.id === id)
        if (isOnline() && current) {
          set((s) => ({
            quotes: s.quotes.map((quote) => (
              quote.id === id ? { ...quote, status: 'cancelada', updatedAt: now() } : quote
            )),
          }))
          crmApi.cancelQuote(id, current.version)
            .then((response) => {
              const saved = mapCrmQuoteFromApi(response)
              set((s) => ({ quotes: replaceById(s.quotes, saved) }))
            })
            .catch((error) => reportMutationError(set, error))
          return
        }
        set((s) => ({ quotes: s.quotes.filter((q) => q.id !== id) }))
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
