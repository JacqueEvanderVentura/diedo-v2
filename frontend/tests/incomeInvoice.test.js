import { describe, expect, it } from 'vitest'
import { isPosIncome } from '@/modules/finanzas/lib/incomeInvoice'

describe('incomeInvoice', () => {
  it('detecta ingresos provenientes de POS', () => {
    expect(isPosIncome({ source: 'POS' })).toBe(true)
    expect(isPosIncome({ origin: 'pos' })).toBe(true)
    expect(isPosIncome({ source: 'Formulario', origin: 'manual' })).toBe(false)
  })
})
