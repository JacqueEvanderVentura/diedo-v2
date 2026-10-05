import { describe, expect, it } from 'vitest'
import {
  applyRestToRow,
  checkoutTendersFromDraft,
  sumSplitDraft,
} from '@/modules/pos/lib/splitPayment'

describe('splitPayment', () => {
  const draft = [
    { methodId: 'efectivo', amount: '100', reference: '' },
    { methodId: 'tarjeta', amount: '', reference: '' },
    { methodId: 'transferencia', amount: '', reference: '' },
  ]

  it('aplica el resto al método elegido', () => {
    const next = applyRestToRow(draft, 'tarjeta', 5500)
    const card = next.find((row) => row.methodId === 'tarjeta')
    expect(card.amount).toBe('5400.00')
  })

  it('valida que la suma coincida con el total', () => {
    const ok = checkoutTendersFromDraft([
      { methodId: 'efectivo', amount: '3000', reference: '' },
      { methodId: 'tarjeta', amount: '2500', reference: '' },
    ], 5500)
    expect(ok.ok).toBe(true)
    expect(ok.tenders).toHaveLength(2)
    expect(sumSplitDraft(ok.tenders.map((row) => ({ amount: row.amount })))).toBe(5500)
  })

  it('rechaza montos incompletos', () => {
    const fail = checkoutTendersFromDraft([
      { methodId: 'efectivo', amount: '1000', reference: '' },
    ], 5500)
    expect(fail.ok).toBe(false)
  })
})
