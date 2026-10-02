import { describe, expect, it } from 'vitest'
import { saleReceivablePending, saleStatusBadge } from '@/modules/crm/lib/crm'

describe('saleStatusBadge', () => {
  it('muestra Cta. por cobrar con saldo pendiente', () => {
    const sale = { id: 's1', status: 'completed', method: 'cxc', total: 1000 }
    const receivable = { saleId: 's1', amount: 1000, paidAmount: 200 }
    expect(saleReceivablePending(sale, receivable)).toBe(true)
    expect(saleStatusBadge(sale, receivable)).toEqual({
      label: 'Cta. por cobrar',
      tone: 'brand',
    })
  })

  it('muestra Completada cuando no hay saldo', () => {
    const sale = { id: 's2', status: 'completed', method: 'efectivo', total: 500 }
    expect(saleStatusBadge(sale, null)).toEqual({
      label: 'Completada',
      tone: 'success',
    })
  })

  it('muestra Anulada para ventas voided', () => {
    const sale = { id: 's3', status: 'voided', method: 'efectivo' }
    expect(saleStatusBadge(sale, null)).toEqual({
      label: 'Anulada',
      tone: 'danger',
    })
  })
})
