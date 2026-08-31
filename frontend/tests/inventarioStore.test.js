import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listAllMovements: vi.fn(),
  getSupplyUsage: vi.fn(),
  listAllItems: vi.fn(),
  createOutboundMovement: vi.fn(),
  createAdjustmentMovement: vi.fn(),
}))

vi.mock('@/services/inventoryApi', () => ({ inventoryApi: mocks }))

import { useCatalogStore } from '@/stores/catalogStore'
import { useConfigStore } from '@/stores/configStore'
import { useInventarioStore } from '@/stores/inventarioStore'

const branch = { id: '01a03129-a18a-724f-ba73-96eedf0b84d7', code: 'NORTH', name: 'Sucursal Norte' }
const warehouse = { id: '7c64a006-bf00-428a-b94d-b42fde0273e0', code: 'MAIN', name: 'Almacén principal' }
const itemId = 'e59a85f4-224d-4010-83a9-8e23ef205119'

function movementResponse(movementType, { before = '4', after = '2', delta = '-2' } = {}) {
  return {
    id: `${movementType}-id`,
    movementType,
    branch,
    warehouse,
    employee: movementType === 'outbound' ? { id: 'employee-id', name: 'Jasmin Beltre' } : null,
    appointment: null,
    comment: movementType === 'outbound' ? 'Uso en sesión' : 'Conteo físico',
    items: [{
      id: 'line-id',
      itemId,
      itemName: 'Gel conductor',
      itemSku: 'INS-01',
      unitSymbol: 'ud',
      quantityDelta: delta,
      quantityBefore: before,
      quantityAfter: after,
      unitCost: '25',
    }],
    createdBy: 'Alex Demo',
    createdAt: '2026-08-31T12:00:00Z',
  }
}

describe('store del historial de inventario', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useInventarioStore.setState({
      movements: [],
      usage: [],
      apiContext: { hydrated: false },
      hydrating: false,
      error: null,
    })
    useConfigStore.setState({ branches: [branch] })
    useCatalogStore.setState({
      products: [{ id: itemId, name: 'Gel conductor', type: 'supply', stock: 4, branchId: branch.id }],
      hydrateFromApi: vi.fn().mockResolvedValue([]),
    })
  })

  it('hidrata historial y consumo agregado desde la API', async () => {
    mocks.listAllMovements.mockResolvedValue({ items: [movementResponse('outbound')] })
    mocks.getSupplyUsage.mockResolvedValue([{
      employeeId: 'employee-id',
      employeeName: 'Jasmin Beltre',
      supplyId: itemId,
      supplyName: 'Gel conductor',
      quantity: '2',
      appointmentsCount: 1,
      perAppointment: '2',
    }])

    await useInventarioStore.getState().hydrateFromApi()

    expect(mocks.listAllMovements).toHaveBeenCalledWith({ sortBy: 'createdAt', sortDirection: 'desc' })
    expect(useInventarioStore.getState()).toMatchObject({
      movements: [expect.objectContaining({ type: 'salida', employeeName: 'Jasmin Beltre' })],
      usage: [expect.objectContaining({ qty: 2, perAppointment: 2 })],
      apiContext: { hydrated: true },
    })
  })

  it('carga solo ítems con stock de la sucursal elegida', async () => {
    mocks.listAllItems.mockResolvedValue({
      items: [{
        id: itemId,
        name: 'Gel conductor',
        sku: 'INS-01',
        itemType: 'supply',
        stockQuantity: '4',
        minimumStock: '1',
        unitOfMeasure: { symbol: 'ud' },
        stockLocations: [{ branch }],
      }],
    })

    const items = await useInventarioStore.getState().loadStockItems(branch.id, { isOnline: true })

    expect(mocks.listAllItems).toHaveBeenCalledWith({
      branchId: branch.id,
      status: 'active',
      sortBy: 'name',
      sortDirection: 'asc',
    })
    expect(items).toEqual([expect.objectContaining({ id: itemId, type: 'supply', stock: 4, branchId: branch.id })])
  })

  it('registra una salida en API y aplica la existencia resultante', async () => {
    mocks.createOutboundMovement.mockResolvedValue(movementResponse('outbound'))
    mocks.getSupplyUsage.mockResolvedValue([])

    await useInventarioStore.getState().recordSalidaMultiple({
      branchId: branch.id,
      employeeId: 'employee-id',
      appointmentId: null,
      comment: 'Uso en sesión',
      items: [{ id: itemId, qty: 2 }],
    }, { isOnline: true })

    expect(mocks.createOutboundMovement).toHaveBeenCalledWith({
      branchId: branch.id,
      employeeId: 'employee-id',
      appointmentId: null,
      comment: 'Uso en sesión',
      items: [{ itemId, quantity: 2 }],
    })
    expect(useCatalogStore.getState().products[0].stock).toBe(2)
    expect(useInventarioStore.getState().movements[0]).toMatchObject({ type: 'salida', apiSynced: true })
  })

  it('registra un ajuste absoluto y conserva su diferencia en el historial', async () => {
    mocks.createAdjustmentMovement.mockResolvedValue(movementResponse('adjustment', {
      before: '4',
      after: '7',
      delta: '3',
    }))

    await useInventarioStore.getState().recordAdjustment({
      branchId: branch.id,
      comment: 'Conteo físico',
      items: [{ id: itemId, quantity: 7 }],
    }, { isOnline: true })

    expect(mocks.createAdjustmentMovement).toHaveBeenCalledWith({
      branchId: branch.id,
      comment: 'Conteo físico',
      items: [{ itemId, quantity: 7 }],
    })
    expect(useCatalogStore.getState().products[0].stock).toBe(7)
    expect(useInventarioStore.getState().movements[0]).toMatchObject({
      type: 'ajuste',
      items: [expect.objectContaining({ before: 4, after: 7, delta: 3 })],
    })
  })
})
