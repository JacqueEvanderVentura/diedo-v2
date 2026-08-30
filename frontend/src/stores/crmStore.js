import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ephemeralJsonStorage } from '@/services/storagePolicy'
import { currentSessionActor } from '@/lib/sessionActor'
import { computeAutoScore, effectiveScore } from '@/modules/crm/lib/scoring'
import { recordSerpUsage } from '@/modules/crm/lib/serpQuota'
import { DEFAULT_SCORING_WEIGHTS } from '@/data/crm'
import { useCustomersStore } from '@/stores/customersStore'

const genId = (p) => `${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 10000)}`
const now = () => new Date().toISOString()
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

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
      leads: buildSeedLeads(),
      opportunities: SEED_OPPORTUNITIES,
      activities: SEED_ACTIVITIES,
      quotes: SEED_QUOTES,
      scoringWeights: { ...DEFAULT_SCORING_WEIGHTS },
      serpHourCount: 0,
      serpHourWindowStart: Date.now(),
      serpMonthCount: 0,
      serpMonthKey: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,

      recordSerpSearch: () =>
        set((s) => {
          const next = recordSerpUsage(s)
          return { ...next }
        }),

      updateScoringWeights: (weights) =>
        set((s) => {
          const merged = { ...s.scoringWeights, ...weights }
          return { scoringWeights: merged, leads: recomputeLeads(s.leads, merged) }
        }),

      addLead: (data) => {
        const lead = normalizeLead(data, get().scoringWeights)
        set((s) => ({ leads: [lead, ...s.leads] }))
        return lead
      },

      addLeadsBatch: (items, source = 'serp') => {
        const weights = get().scoringWeights
        const ts = now()
        const newLeads = items.map((item) =>
          normalizeLead({ ...item, source, scrapedAt: ts, status: 'nuevo' }, weights)
        )
        set((s) => ({ leads: [...newLeads, ...s.leads] }))
        return newLeads
      },

      updateLead: (id, data) =>
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== id) return l
            const merged = { ...l, ...data, updatedAt: now() }
            if (data.scoreManual !== undefined) {
              merged.score = effectiveScore(merged)
            }
            return merged
          }),
        })),

      setManualScore: (id, scoreManual, scoreNotes = '') =>
        set((s) => ({
          leads: s.leads.map((l) => {
            if (l.id !== id) return l
            const score = scoreManual != null && scoreManual !== '' ? Number(scoreManual) : l.scoreAuto
            return {
              ...l,
              scoreManual: scoreManual != null && scoreManual !== '' ? Number(scoreManual) : null,
              scoreNotes,
              score,
              updatedAt: now(),
            }
          }),
        })),

      convertToCustomer: async (leadId) => {
        const lead = get().leads.find((l) => l.id === leadId)
        if (!lead) return null
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
        return opp
      },

      addOpportunity: (data) => {
        const opp = { id: genId('opp'), createdAt: now(), updatedAt: now(), stage: 'nuevo', value: 0, ...data }
        set((s) => ({ opportunities: [opp, ...s.opportunities] }))
        return opp
      },

      updateOpportunityStage: (id, stage) =>
        set((s) => ({
          opportunities: s.opportunities.map((o) => (o.id === id ? { ...o, stage, updatedAt: now() } : o)),
        })),

      updateOpportunity: (id, data) =>
        set((s) => ({
          opportunities: s.opportunities.map((o) => (o.id === id ? { ...o, ...data, updatedAt: now() } : o)),
        })),

      addActivity: (data) => {
        const act = {
          id: genId('act'),
          createdAt: now(),
          completedAt: null,
          assignedUserId: currentSessionActor().id,
          ...data,
        }
        set((s) => ({ activities: [act, ...s.activities] }))
        return act
      },

      updateActivity: (id, data) =>
        set((s) => ({
          activities: s.activities.map((a) => (a.id === id ? { ...a, ...data } : a)),
        })),

      toggleActivityComplete: (id) =>
        set((s) => ({
          activities: s.activities.map((a) =>
            a.id === id ? { ...a, completedAt: a.completedAt ? null : now() } : a
          ),
        })),

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
        return quote
      },

      updateQuote: (id, data) =>
        set((s) => ({
          quotes: s.quotes.map((q) => (q.id === id ? { ...q, ...data, updatedAt: now() } : q)),
        })),

      deleteQuote: (id) => set((s) => ({ quotes: s.quotes.filter((q) => q.id !== id) })),

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
      version: 1,
      migrate: (persisted) => {
        if (!persisted?.leads) return persisted
        const weights = persisted.scoringWeights || DEFAULT_SCORING_WEIGHTS
        return { ...persisted, leads: recomputeLeads(persisted.leads, weights) }
      },
    }
  )
)
