import { describe, expect, it } from 'vitest'
import {
  adjustmentMovementToApiPayload,
  mapInventoryMovementFromApi,
  outboundMovementToApiPayload,
} from '@/services/adapters/inventory'

const branch = { id: '01a03129-a18a-724f-ba73-96eedf0b84d7', code: 'NORTH', name: 'Sucursal Norte' }
const warehouse = { id: '7c64a006-bf00-428a-b94d-b42fde0273e0', code: 'MAIN', name: 'Almacén principal' }

function apiMovement(overrides = {}) {
  return {
    id: 'f114f2c9-9bd2-4fd6-9726-a62313b4755f',
    movementType: 'adjustment',
    branch,
    warehouse,
    employee: null,
    appointment: null,
    comment: 'Conteo físico',
    items: [{
      id: '48a73f70-6fc2-4324-9b6c-6cb7c010c876',
      itemId: 'e59a85f4-224d-4010-83a9-8e23ef205119',
      itemName: 'Gel conductor',
      itemSku: 'INS-01',
      unitSymbol: 'ud',
      quantityDelta: '-2',
      quantityBefore: '7',
      quantityAfter: '5',
      unitCost: '25.50',
    }],
    createdBy: 'Alex Demo',
    createdAt: '2026-08-31T12:00:00Z',
    ...overrides,
  }
}

describe('adaptadores del historial de inventario', () => {
  it('mapea un ajuste conservando cantidades anterior, física y diferencia', () => {
    expect(mapInventoryMovementFromApi(apiMovement())).toMatchObject({
      type: 'ajuste',
      movementType: 'adjustment',
      branchId: branch.id,
      branchName: branch.name,
      createdBy: 'Alex Demo',
      items: [{
        id: 'e59a85f4-224d-4010-83a9-8e23ef205119',
        name: 'Gel conductor',
        qty: 2,
        delta: -2,
        before: 7,
        after: 5,
        unitCost: 25.5,
      }],
    })
  })

  it('mapea una salida con empleado y cita para el historial', () => {
    const mapped = mapInventoryMovementFromApi(apiMovement({
      movementType: 'outbound',
      employee: { id: 'employee-id', name: 'Jasmin Beltre' },
      appointment: { id: 'appointment-id', label: 'María · Facial' },
    }))
    expect(mapped).toMatchObject({
      type: 'salida',
      employeeId: 'employee-id',
      employeeName: 'Jasmin Beltre',
      appointmentId: 'appointment-id',
      appointmentLabel: 'María · Facial',
    })
  })

  it('construye los contratos de salida y ajuste con cantidades numéricas', () => {
    expect(outboundMovementToApiPayload({
      branchId: branch.id,
      employeeId: 'employee-id',
      appointmentId: '',
      comment: ' Uso en sesión ',
      items: [{ id: 'supply-id', qty: '2.5' }],
    })).toEqual({
      branchId: branch.id,
      employeeId: 'employee-id',
      appointmentId: null,
      comment: 'Uso en sesión',
      items: [{ itemId: 'supply-id', quantity: 2.5 }],
    })

    expect(adjustmentMovementToApiPayload({
      branchId: branch.id,
      comment: ' Conteo de cierre ',
      items: [{ id: 'product-id', quantity: '0' }],
    })).toEqual({
      branchId: branch.id,
      comment: 'Conteo de cierre',
      items: [{ itemId: 'product-id', quantity: 0 }],
    })
  })

  it('rechaza cantidades inválidas antes de enviar el POST', () => {
    expect(() => outboundMovementToApiPayload({
      branchId: branch.id,
      employeeId: 'employee-id',
      items: [{ id: 'supply-id', qty: 0 }],
    })).toThrow('mayores que cero')
    expect(() => adjustmentMovementToApiPayload({
      branchId: branch.id,
      comment: 'Conteo',
      items: [{ id: 'supply-id', quantity: -1 }],
    })).toThrow('no puede ser negativa')
  })
})
