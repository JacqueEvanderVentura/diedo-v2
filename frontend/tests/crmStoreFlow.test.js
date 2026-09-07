import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createLeadOpportunity: vi.fn(),
  createOpportunity: vi.fn(),
  updateOpportunity: vi.fn(),
  createActivity: vi.fn(),
  updateActivity: vi.fn(),
  completeActivity: vi.fn(),
  reopenActivity: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  cancelQuote: vi.fn(),
}))

const customerStore = vi.hoisted(() => ({
  hydrate: vi.fn(),
  addCustomer: vi.fn(),
  mergeCrmProfiles: vi.fn(),
}))

vi.mock('@/services/crmApi', () => ({ crmApi: mocks }))
vi.mock('@/stores/customersStore', () => ({
  useCustomersStore: { getState: () => customerStore },
}))

import { useCrmStore } from '@/stores/crmStore'
import { useSessionStore } from '@/stores/sessionStore'

const branchId = '11111111-1111-4111-8111-111111111111'
const membershipId = '22222222-2222-4222-8222-222222222222'
const leadId = '33333333-3333-4333-8333-333333333333'
const opportunityId = '44444444-4444-4444-8444-444444444444'
const customerId = '55555555-5555-4555-8555-555555555555'

function opportunity(overrides = {}) {
  return {
    id: opportunityId,
    branchId,
    leadId,
    customerId: null,
    assignedMembershipId: membershipId,
    title: 'Empresa de prueba — Oportunidad',
    customerName: 'Empresa de prueba',
    stage: 'contactado',
    value: '15000.00',
    version: 1,
    createdAt: '2026-09-07T12:00:00Z',
    updatedAt: '2026-09-07T12:00:00Z',
    ...overrides,
  }
}

describe('flujo conectado del store CRM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSessionStore.setState({
      status: 'online',
      user: { id: membershipId, membershipId, branchIds: [branchId] },
    })
    useCrmStore.setState({
      leads: [{
        id: leadId,
        branchId,
        name: 'Ada',
        company: 'Empresa de prueba',
        status: 'calificado',
        score: 80,
        opportunityId: null,
        assignedUserId: membershipId,
        version: 1,
      }],
      opportunities: [],
      activities: [],
      quotes: [],
      customers: [],
      error: null,
    })
  })

  it('espera el endpoint antes de incorporar una oportunidad y propaga su ID real al lead', async () => {
    let resolveRequest
    mocks.createLeadOpportunity.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve
    }))

    const mutation = useCrmStore.getState().addToPipeline(leadId)

    expect(useCrmStore.getState().opportunities).toEqual([])
    expect(useCrmStore.getState().leads[0].opportunityId).toBeNull()

    resolveRequest(opportunity())
    const saved = await mutation

    expect(saved.id).toBe(opportunityId)
    expect(useCrmStore.getState().opportunities).toEqual([
      expect.objectContaining({ id: opportunityId, value: 15000 }),
    ])
    expect(useCrmStore.getState().leads[0]).toMatchObject({
      opportunityId,
      status: 'calificado',
    })
  })

  it('no muestra un cambio de etapa que el backend rechazó', async () => {
    useCrmStore.setState({ opportunities: [opportunity({ stage: 'nuevo' })] })
    mocks.updateOpportunity.mockRejectedValue(new Error('Conflicto de versión'))

    await expect(
      useCrmStore.getState().updateOpportunityStage(opportunityId, 'propuesta')
    ).rejects.toThrow('Conflicto de versión')

    expect(mocks.updateOpportunity).toHaveBeenCalledWith(opportunityId, {
      version: 1,
      stage: 'propuesta',
    })
    expect(useCrmStore.getState().opportunities[0].stage).toBe('nuevo')
  })

  it('envía la relación oportunidad-lead-cliente al crear el seguimiento', async () => {
    useCrmStore.setState({ opportunities: [opportunity({ customerId })] })
    mocks.createActivity.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      branchId,
      leadId,
      opportunityId,
      customerId,
      assignedMembershipId: membershipId,
      type: 'reunion',
      title: 'Demo comercial',
      customerName: 'Empresa de prueba',
      dueAt: '2026-09-08T15:00:00Z',
      completedAt: null,
      version: 1,
    })

    await useCrmStore.getState().addActivity({
      opportunityId,
      leadId,
      customerId,
      assignedUserId: membershipId,
      type: 'reunion',
      title: 'Demo comercial',
      customerName: 'Empresa de prueba',
      dueAt: '2026-09-08T15:00:00Z',
    })

    expect(mocks.createActivity).toHaveBeenCalledWith(expect.objectContaining({
      branchId,
      leadId,
      opportunityId,
      customerId,
      assignedMembershipId: membershipId,
    }))
    expect(useCrmStore.getState().activities[0].opportunityId).toBe(opportunityId)
  })

  it('persiste una cotización vinculada y conserva el ID devuelto por la API', async () => {
    const quoteId = '77777777-7777-4777-8777-777777777777'
    mocks.createQuote.mockResolvedValue({
      id: quoteId,
      number: 'COT-2026-010',
      opportunityId,
      customerId,
      customerName: 'Empresa de prueba',
      branchId,
      crmStatus: 'borrador',
      total: '25000.00',
      lines: [{ itemId: 'item-id', itemName: 'Implementación', quantity: '1', unitPrice: '25000.00' }],
      version: 1,
    })

    await useCrmStore.getState().addQuote({
      opportunityId,
      customerId,
      customerName: 'Empresa de prueba',
      branchId,
      items: [{ itemId: 'item-id', name: 'Implementación', qty: 1, price: 25000 }],
      total: 25000,
    })

    expect(mocks.createQuote).toHaveBeenCalledWith(expect.objectContaining({
      opportunityId,
      customerId,
      branchId,
      lines: [{ itemId: 'item-id', quantity: 1, unitPrice: 25000 }],
    }))
    expect(useCrmStore.getState().quotes[0]).toMatchObject({ id: quoteId, opportunityId, total: 25000 })
  })
})
