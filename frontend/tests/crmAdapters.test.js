import { describe, expect, it } from 'vitest'
import {
  mapCrmCustomerFromApi,
  mapCrmOverviewFromApi,
  mapCrmQuoteFromApi,
  mapCrmStateFromApi,
} from '@/services/adapters/crm'

describe('adaptadores de CRM', () => {
  it('convierte números y conserva versiones del estado agregado', () => {
    const state = mapCrmStateFromApi({
      leads: [{ id: 'lead-id', score: '74', scoreAuto: '70', scoreManual: '74' }],
      opportunities: [{ id: 'opp-id', value: '12500.50' }],
      activities: [{ id: 'activity-id', assignedMembershipId: 'membership-id' }],
      quotes: [{
        opportunityId: 'opp-id',
        crmStatus: 'enviada',
        quote: {
          id: 'quote-id',
          version: 7,
          total: '12500.50',
          customer: { id: 'customer-id', name: 'Ada' },
          branch: { id: 'branch-id' },
          lines: [{ id: 'line-id', itemId: 'item-id', quantity: '2', unitPrice: '6250.25' }],
        },
      }],
      settings: { version: 4, weights: { website: 8 } },
    })

    expect(state.leads[0]).toMatchObject({ score: 74, scoreAuto: 70, scoreManual: 74 })
    expect(state.opportunities[0].value).toBe(12500.5)
    expect(state.activities[0].assignedUserId).toBe('membership-id')
    expect(state.quotes[0]).toMatchObject({
      id: 'quote-id',
      opportunityId: 'opp-id',
      customerId: 'customer-id',
      branchId: 'branch-id',
      status: 'enviada',
      total: 12500.5,
      version: 7,
    })
    expect(state.quotes[0].items[0]).toMatchObject({ qty: 2, price: 6250.25 })
    expect(state.scoringVersion).toBe(4)
  })

  it('mapea el perfil comercial del cliente compartido', () => {
    const customer = mapCrmCustomerFromApi({
      id: 'customer-id',
      displayName: 'Laboratorio Ada',
      businessName: 'Ada SRL',
      customerType: 'business',
      lifecycleStatus: 'cliente',
      loyaltyPoints: '85',
      purchaseCount: '3',
      totalSpent: '42000.75',
      masterStatus: 'active',
      profileVersion: 2,
      version: 5,
      branches: [{ id: 'branch-id', name: 'Principal' }],
    })

    expect(customer).toMatchObject({
      name: 'Laboratorio Ada',
      customerType: 'b2b',
      customerStatus: 'cliente',
      points: 85,
      purchaseCount: 3,
      totalSpent: 42000.75,
      branchId: 'branch-id',
      branchIds: ['branch-id'],
      active: true,
      profileVersion: 2,
      version: 5,
    })
  })

  it('normaliza los importes del overview agregado', () => {
    expect(mapCrmOverviewFromApi({
      totalLeads: 8,
      pipelineValue: '221000.00',
      salesValueThisMonth: '54000.25',
    })).toMatchObject({
      totalLeads: 8,
      pipelineValue: 221000,
      salesValueThisMonth: 54000.25,
    })
  })
})
