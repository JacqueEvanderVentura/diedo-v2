import { describe, expect, it } from 'vitest'

import { computeSupplyUsageKpis } from '@/modules/inventarios/lib/supplyUsage'

describe('uso de insumos por personal', () => {
  it('agrupa salidas reales y cuenta solamente citas ya atendidas', () => {
    const result = computeSupplyUsageKpis({
      supplies: [{ id: 'supply-id', name: 'Guantes', type: 'supply' }],
      services: [{
        id: 'service-id',
        type: 'service',
        supplyBom: [{ supplyId: 'supply-id', qty: 1 }],
      }],
      employees: [{ id: 'employee-id', name: 'Ana Vargas' }],
      appointments: [
        { employeeId: 'employee-id', status: 'completada', serviceId: 'service-id' },
        { employeeId: 'employee-id', status: 'asistio', serviceId: 'service-id' },
        { employeeId: 'employee-id', status: 'confirmada', serviceId: 'service-id' },
      ],
      movements: [
        {
          type: 'salida',
          employeeId: 'employee-id',
          items: [{ id: 'supply-id', name: 'Guantes', qty: 3 }],
        },
        {
          type: 'entrada',
          employeeId: 'employee-id',
          items: [{ id: 'supply-id', name: 'Guantes', qty: 99 }],
        },
      ],
    })

    expect(result).toEqual([
      expect.objectContaining({
        employeeId: 'employee-id',
        employeeName: 'Ana Vargas',
        qty: 3,
        expectedQty: 2,
        variance: 1,
        appointmentsCount: 2,
        perAppointment: 1.5,
      }),
    ])
  })
})
