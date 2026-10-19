import { describe, expect, it } from 'vitest'
import {
  buildInvoiceDataFromManualIncome,
  canIncomeInvoice,
  isPosIncome,
} from '@/modules/finanzas/lib/incomeInvoice'

describe('incomeInvoice', () => {
  it('detecta ingresos provenientes de ventas POS', () => {
    expect(isPosIncome({ origin: 'pos', source: 'POS' })).toBe(true)
    expect(isPosIncome({ origin: 'pos' })).toBe(true)
  })

  it('no trata ingresos manuales con fuente POS como factura', () => {
    expect(isPosIncome({ source: 'POS', origin: 'manual' })).toBe(false)
    expect(isPosIncome({ source: 'Formulario', origin: 'manual' })).toBe(false)
  })

  it('permite comprobante en ingresos manuales y POS', () => {
    expect(canIncomeInvoice({ origin: 'manual' })).toBe(true)
    expect(canIncomeInvoice({ origin: 'pos' })).toBe(true)
    expect(canIncomeInvoice({ origin: 'other' })).toBe(false)
  })

  it('arma factura simple desde ingreso manual', () => {
    const data = buildInvoiceDataFromManualIncome({
      id: 'inc-1',
      customer: 'Cabelleria Barber Shop',
      concept: 'Corte premium',
      category: 'transferencia',
      amount: 1200,
      date: '2026-10-06',
      status: 'pagado',
      branchId: 'branch-1',
    }, { branches: [{ id: 'branch-1', name: 'Sede Principal' }] })
    expect(data.customerName).toBe('Cabelleria Barber Shop')
    expect(data.items[0].name).toBe('Corte premium')
    expect(data.total).toBe(1200)
    expect(data.paymentMethod).toBe('Transferencia')
  })
})
