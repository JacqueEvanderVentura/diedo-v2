import { describe, expect, it } from 'vitest'
import { computeExpectedSupplyUsage, normalizeSupplyBom } from '@/modules/inventarios/lib/serviceBom'

describe('serviceBom', () => {
  it('normaliza líneas de BOM', () => {
    expect(normalizeSupplyBom([{ supplyId: 'sup-1', qty: 2 }])).toEqual([
      { supplyId: 'sup-1', qty: 2 },
    ])
  })

  it('calcula consumo esperado por empleado y servicio', () => {
    const expected = computeExpectedSupplyUsage({
      services: [{ id: 'p2', type: 'service', supplyBom: [{ supplyId: 'sup-1', qty: 1 }] }],
      appointments: [
        { employeeId: 'emp-1', status: 'cumplida', serviceId: 'p2' },
        { employeeId: 'emp-1', status: 'cumplida', serviceId: 'p2' },
        { employeeId: 'emp-1', status: 'confirmada', serviceId: 'p2' },
      ],
    })
    expect(expected['emp-1:sup-1']).toMatchObject({ expectedQty: 2, appointmentsCount: 2 })
  })
})
