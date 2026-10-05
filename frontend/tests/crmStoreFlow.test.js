import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getLead: vi.fn(),
  getSale: vi.fn(),
  leads: vi.fn(),
  updateLead: vi.fn(),
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
const customerId = '55555555-5555-4555-8555-555555555555'

function pipelineLead(overrides = {}) {
  return {
    id: leadId,
    branchId,
    name: 'Ada',
    company: 'Empresa de prueba',
    status: 'contactado',
    customerId: null,
    assignedUserId: membershipId,
    version: 1,
    createdAt: '2026-09-07T12:00:00Z',
    updatedAt: '2026-09-07T12:00:00Z',
    ...overrides,
  }
}

describe('flujo conectado del store CRM', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.leads.mockReset()
    useSessionStore.setState({
      status: 'online',
      user: { id: membershipId, membershipId, branchIds: [branchId] },
    })
    useCrmStore.setState({
      leads: [pipelineLead({ status: 'calificado' })],
      activities: [],
      quotes: [],
      customers: [],
      error: null,
    })
  })

  it('devuelve el lead al incorporarlo al pipeline', async () => {
    const saved = await useCrmStore.getState().addToPipeline(leadId)
    expect(saved).toMatchObject({ id: leadId, company: 'Empresa de prueba' })
  })

  it('no muestra un cambio de etapa que el backend rechazó', async () => {
    useCrmStore.setState({ leads: [pipelineLead({ status: 'nuevo' })] })
    mocks.updateLead.mockRejectedValue(new Error('Conflicto de versión'))

    await expect(
      useCrmStore.getState().updateLeadStage(leadId, 'propuesta')
    ).rejects.toThrow('Conflicto de versión')

    expect(mocks.updateLead).toHaveBeenCalledWith(leadId, {
      version: 1,
      status: 'propuesta',
    })
    expect(useCrmStore.getState().leads[0].status).toBe('nuevo')
  })

  it('envía la relación lead-cliente al crear el seguimiento', async () => {
    useCrmStore.setState({ leads: [pipelineLead({ customerId })] })
    mocks.createActivity.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      branchId,
      leadId,
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
      customerId,
      assignedMembershipId: membershipId,
    }))
    expect(useCrmStore.getState().activities[0].leadId).toBe(leadId)
  })

  it('persiste una cotización vinculada y conserva el ID devuelto por la API', async () => {
    const quoteId = '77777777-7777-4777-8777-777777777777'
    mocks.createQuote.mockResolvedValue({
      id: quoteId,
      number: 'COT-2026-010',
      leadId,
      customerId,
      customerName: 'Empresa de prueba',
      branchId,
      crmStatus: 'borrador',
      total: '25000.00',
      lines: [{ itemId: 'item-id', itemName: 'Implementación', quantity: '1', unitPrice: '25000.00' }],
      version: 1,
    })

    await useCrmStore.getState().addQuote({
      leadId,
      customerId,
      customerName: 'Empresa de prueba',
      branchId,
      items: [{ itemId: 'item-id', name: 'Implementación', qty: 1, price: 25000 }],
      total: 25000,
    })

    expect(mocks.createQuote).toHaveBeenCalledWith(expect.objectContaining({
      leadId,
      customerId,
      branchId,
      lines: [{ itemId: 'item-id', quantity: 1, unitPrice: 25000 }],
    }))
    expect(useCrmStore.getState().quotes[0]).toMatchObject({ id: quoteId, leadId, total: 25000 })
  })

  it('envía leadId y líneas al actualizar una cotización en línea', async () => {
    const quoteId = '88888888-8888-4888-8888-888888888888'
    const linkedLeadId = '99999999-9999-4999-8999-999999999999'
    useCrmStore.setState({
      quotes: [{
        id: quoteId,
        number: 'COT-2026-011',
        leadId: null,
        customerId,
        branchId,
        status: 'borrador',
        total: 1000,
        items: [{ itemId: 'item-a', name: 'A', qty: 1, price: 1000 }],
        version: 2,
      }],
    })
    mocks.updateQuote.mockResolvedValue({
      quote: {
        id: quoteId,
        number: 'COT-2026-011',
        leadId: linkedLeadId,
        customerId,
        branchId,
        total: '3000.00',
        version: 3,
        lines: [
          { itemId: 'item-a', itemName: 'A', quantity: '1', unitPrice: '1000.00' },
          { itemId: 'item-b', itemName: 'B', quantity: '2', unitPrice: '1000.00' },
        ],
      },
      crmStatus: 'borrador',
    })

    await useCrmStore.getState().updateQuote(quoteId, {
      leadId: linkedLeadId,
      items: [
        { itemId: 'item-a', qty: 1, price: 1000 },
        { itemId: 'item-b', qty: 2, price: 1000 },
      ],
    })

    expect(mocks.updateQuote).toHaveBeenCalledWith(quoteId, {
      version: 2,
      leadId: linkedLeadId,
      lines: [
        { itemId: 'item-a', quantity: 1, unitPrice: 1000 },
        { itemId: 'item-b', quantity: 2, unitPrice: 1000 },
      ],
    })
    expect(useCrmStore.getState().quotes[0].leadId).toBe(linkedLeadId)
  })

  it('programa seguimiento simplificado y mueve a negociación', async () => {
    useCrmStore.setState({ leads: [pipelineLead({ status: 'propuesta' })] })
    mocks.createActivity.mockResolvedValue({
      id: 'act-1',
      type: 'tarea',
      title: 'Seguimiento',
      leadId,
      dueAt: '2026-09-20T14:00:00Z',
      version: 1,
    })
    mocks.updateLead.mockResolvedValue(pipelineLead({ status: 'negociacion', version: 2 }))

    await useCrmStore.getState().applySimplifiedFollowUp(leadId, {
      dueAt: '2026-09-20T14:00:00',
      title: 'Seguimiento',
      description: 'Llamar',
    })

    expect(mocks.createActivity).toHaveBeenCalled()
    expect(mocks.updateLead).toHaveBeenCalledWith(
      leadId,
      expect.objectContaining({ status: 'negociacion' }),
    )
  })

  it('marca perdido con motivo en modo simplificado', async () => {
    useCrmStore.setState({ leads: [pipelineLead({ status: 'propuesta' })] })
    mocks.updateLead.mockResolvedValue(pipelineLead({ status: 'perdido', lostReason: 'Precio alto', version: 2 }))

    await useCrmStore.getState().applySimplifiedLost(leadId, 'Precio alto')

    expect(mocks.updateLead).toHaveBeenCalledWith(
      leadId,
      expect.objectContaining({ status: 'perdido', lostReason: 'Precio alto' }),
    )
  })

  it('ajusta contadores de etapa con filtros de fecha y búsqueda en línea', async () => {
    const recent = new Date().toISOString()
    const old = '2020-01-01T12:00:00.000Z'
    mocks.leads.mockImplementation(async (params) => {
      const inUpdatedRange = (lead) => {
        const updated = new Date(lead.updatedAt || lead.createdAt || 0).getTime()
        const after = params.updatedAfter ? new Date(params.updatedAfter).getTime() : null
        const before = params.updatedBefore ? new Date(params.updatedBefore).getTime() : null
        if (after != null && updated < after) return false
        if (before != null && updated > before) return false
        return true
      }
      const nuevoPool = [
        pipelineLead({ status: 'nuevo', name: 'DEMO', company: '', updatedAt: recent }),
        pipelineLead({ id: `${leadId}-old`, status: 'nuevo', name: 'DEMO viejo', updatedAt: old }),
      ].filter(inUpdatedRange)
      const otherPool = [pipelineLead({ status: params.status, name: 'Otro', updatedAt: old })].filter(inUpdatedRange)
      const items = params.status === 'nuevo' ? nuevoPool : otherPool
      return {
        items,
        page: params.page || 1,
        pageSize: params.pageSize,
        totalItems: items.length,
        totalPages: 1,
      }
    })
    const { defaultSimplifiedDateFilter } = await import('@/modules/crm/lib/simplifiedWorkspaceQuery')
    const counts = await useCrmStore.getState().fetchSimplifiedWorkspaceStageCounts({
      search: 'demo',
      branchIds: [],
      dateFilter: defaultSimplifiedDateFilter(),
    })
    expect(counts.nuevo).toBe(1)
    expect(counts.contactado).toBe(0)
  })

  it('consulta la cola y el contador de Perdidos para todo el historial', async () => {
    const lost = pipelineLead({ status: 'perdido', lostReason: 'Precio alto' })
    mocks.leads.mockImplementation(async (params) => ({
      items: params.pageSize === 1 ? [] : [lost],
      page: 1,
      pageSize: params.pageSize,
      totalItems: params.status === 'perdido' ? 1 : 0,
      totalPages: 1,
    }))
    const filters = { dateFilter: { period: 'all', dateFrom: null, dateTo: null } }
    const counts = await useCrmStore.getState().fetchSimplifiedWorkspaceStageCounts(filters)
    expect(counts.perdido).toBe(1)
    expect(mocks.leads).toHaveBeenCalledWith(expect.objectContaining({ status: 'perdido' }))
    await useCrmStore.getState().fetchSimplifiedWorkspaceQueue({ stage: 'perdido', ...filters })
    expect(useCrmStore.getState().simplifiedWorkspace.items[0]).toMatchObject({
      id: leadId,
      lostReason: 'Precio alto',
    })
  })

  it('expone el error de API de la cola y permite reintento', async () => {
    mocks.leads.mockRejectedValueOnce(new Error('API no disponible'))
    await expect(useCrmStore.getState().fetchSimplifiedWorkspaceQueue({
      stage: 'perdido', dateFilter: { period: 'all' },
    })).rejects.toThrow('API no disponible')
    expect(useCrmStore.getState().simplifiedWorkspace.error.message).toBe('API no disponible')
    mocks.leads.mockResolvedValueOnce({
      items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 0,
    })
    await useCrmStore.getState().fetchSimplifiedWorkspaceQueue({
      stage: 'perdido', dateFilter: { period: 'all' },
    })
    expect(useCrmStore.getState().simplifiedWorkspace.error).toBeNull()
  })

  it('cierra un lead facturado sin volver a emitir la venta', async () => {
    customerStore.customers = [{ id: customerId, name: 'Cliente' }]
    useCrmStore.setState({
      leads: [pipelineLead({ customerId, status: 'negociacion' })],
      quotes: [{
        id: 'quote',
        leadId,
        customerId,
        status: 'aceptada',
        convertedSaleId: 'sale',
        items: [{ name: 'Servicio', price: 900, qty: 1 }],
        version: 1,
      }],
    })
    mocks.getSale.mockResolvedValue({ id: 'sale', number: 'VTA-001', total: '955.80', lines: [] })
    mocks.updateLead.mockResolvedValue(pipelineLead({ customerId, status: 'cerrado', version: 2 }))
    const invoice = vi.spyOn(useCrmStore.getState(), 'invoiceQuote')
    const sale = await useCrmStore.getState().closeLeadWithInvoice(leadId)
    expect(sale.id).toBe('sale')
    expect(invoice).not.toHaveBeenCalled()
    expect(useCrmStore.getState().leads[0].status).toBe('cerrado')
    invoice.mockRestore()
  })
})
