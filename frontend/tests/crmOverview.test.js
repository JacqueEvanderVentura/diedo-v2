import { describe, it, expect } from 'vitest'
import {
  buildCrmOverviewStats,
  buildCrmOverviewKpis,
  buildCrmNavCards,
} from '@/modules/crm/lib/crmOverview'

describe('buildCrmOverviewStats', () => {
  it('usa campos del overview API', () => {
    const stats = buildCrmOverviewStats({
      overview: {
        totalLeads: 10,
        qualifiedLeads: 4,
        convertedThisMonth: 2,
        pipelineValue: 50000,
        openOpportunities: 3,
        salesValueThisMonth: 12000,
        pendingActivities: 5,
      },
      leads: [],
      opportunities: [],
    })
    expect(stats).toMatchObject({
      totalLeads: 10,
      qualifiedLeads: 4,
      convertedMonth: 2,
      pipelineValue: 50000,
      openOpportunities: 3,
      salesValueThisMonth: 12000,
      pendingActivities: 5,
    })
  })

  it('calcula fallback local sin overview', () => {
    const stats = buildCrmOverviewStats({
      overview: null,
      leads: [
        { status: 'nuevo', updatedAt: '2026-01-01' },
        { status: 'calificado', updatedAt: '2026-01-01' },
        { status: 'convertido', updatedAt: new Date().toISOString() },
      ],
      opportunities: [
        { stage: 'propuesta', value: 1000 },
        { stage: 'cerrado', value: 500 },
      ],
      activities: [{ status: 'pendiente' }, { status: 'completada' }],
    })
    expect(stats.totalLeads).toBe(3)
    expect(stats.qualifiedLeads).toBe(1)
    expect(stats.convertedMonth).toBe(1)
    expect(stats.pipelineValue).toBe(1000)
    expect(stats.openOpportunities).toBe(1)
    expect(stats.salesValueThisMonth).toBeNull()
    expect(stats.pendingActivities).toBe(1)
  })
})

describe('buildCrmOverviewKpis', () => {
  it('no repite sublabels engañosos (leads vs oportunidades)', () => {
    const kpis = buildCrmOverviewKpis({
      totalLeads: 8,
      qualifiedLeads: 2,
      convertedMonth: 1,
      pipelineValue: 100,
      openOpportunities: 2,
      salesValueThisMonth: 0,
      pendingActivities: 0,
    })
    const leadsKpi = kpis.find((k) => k.key === 'leads')
    expect(leadsKpi.sublabel).toMatch(/prospecto/i)
    expect(leadsKpi.sublabel).not.toMatch(/oportunidad/i)
    const converted = kpis.find((k) => k.key === 'converted')
    expect(converted.sublabel).toMatch(/cliente/i)
    expect(converted.sublabel).not.toMatch(/ventas ganadas/i)
  })

  it('ordena embudo: leads antes que pipeline en nav', () => {
    const cards = buildCrmNavCards({ crmDiscovery: false })
    const keys = cards.map((c) => c.navKey)
    expect(keys.indexOf('leads')).toBeLessThan(keys.indexOf('pipeline'))
    expect(keys.indexOf('pipeline')).toBeLessThan(keys.indexOf('cotizaciones'))
    expect(keys.indexOf('cotizaciones')).toBeLessThan(keys.indexOf('clientes'))
  })
})
