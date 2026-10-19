import { describe, expect, it } from 'vitest'
import { buildManualIncomePayload, validateIncomeForm } from '@/modules/finanzas/lib/incomeForm'

describe('incomeForm', () => {
  it('arma payload de venta de servicio con método de cobro', () => {
    const payload = buildManualIncomePayload({
      itemKind: 'service',
      catalogItem: { id: 'svc-1', name: 'Láser piernas' },
      paymentCategory: 'tarjeta',
      branchId: 'branch-1',
      amount: '1500',
      date: '2026-10-05',
      source: 'Formulario',
      status: 'pagado',
    }, 'María')
    expect(payload.category).toBe('tarjeta')
    expect(payload.itemKind).toBe('service')
    expect(payload.catalogItemId).toBe('svc-1')
    expect(payload.concept).toBe('Láser piernas')
    expect(payload.customer).toBe('María')
  })

  it('valida ingreso general con concepto', () => {
    expect(validateIncomeForm({
      itemKind: 'general',
      concept: 'Alquiler',
      branchId: 'b1',
      amount: '100',
    })).toBe('')
  })
})
