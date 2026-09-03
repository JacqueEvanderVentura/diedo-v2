import { describe, expect, it } from 'vitest'

import { computeSupplyUsageKpis } from '@/modules/inventarios/lib/supplyUsage'

describe('uso de insumos por personal', () => {
  it('agrupa salidas reales y cuenta solamente citas ya atendidas', () => {
    const result = computeSupplyUsageKpis({
      supplies: [{ id: 'supply-id' }],
      employees: [{ id: 'employee-id', name: 'Ana Vargas' }],
      appointments: [
        { employeeId: 'employee-id', status: 'completada' },
        { employeeId: 'employee-id', status: 'asistio' },
        { employeeId: 'employee-id', status: 'confirmada' },
      ],
      movements: [
        {
          type: 'salida',
          employeeId: 'employee-id',
          items: [{ id: 'supply-id', name: 'Guantes', qty: 6 }],
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
        qty: 6,
        appointmentsCount: 2,
        perAppointment: 3,
      }),
    ])
  })
})
