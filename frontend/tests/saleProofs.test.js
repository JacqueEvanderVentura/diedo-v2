import { describe, expect, it } from 'vitest'
import { collectSalePaymentProofs, saleHasPaymentProof } from '@/modules/crm/lib/saleProofs'

describe('saleProofs', () => {
  it('recolecta comprobantes sin duplicar', () => {
    const proof = { id: 'p1', name: 'transferencia.png' }
    const sale = {
      payment: { proof, proofs: [proof, { id: 'p2', name: 'otro.jpg' }] },
    }
    expect(collectSalePaymentProofs(sale)).toHaveLength(2)
    expect(saleHasPaymentProof(sale)).toBe(true)
  })
})
