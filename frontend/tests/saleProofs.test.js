import { describe, expect, it } from 'vitest'
import {
  collectSalePaymentProofs,
  findReceivableForSale,
  saleHasPaymentProof,
} from '@/modules/crm/lib/saleProofs'

describe('saleProofs', () => {
  it('recolecta comprobantes sin duplicar', () => {
    const proof = { id: 'p1', name: 'transferencia.png' }
    const sale = {
      payment: { proof, proofs: [proof, { id: 'p2', name: 'otro.jpg' }] },
    }
    expect(collectSalePaymentProofs(sale)).toHaveLength(2)
    expect(saleHasPaymentProof(sale)).toBe(true)
  })

  it('une comprobantes de la venta y de la CxC vinculada', () => {
    const sale = {
      id: 'sale-1',
      payment: { proofs: [{ id: 'p-sale', name: 'venta.png' }] },
    }
    const receivable = {
      saleId: 'sale-1',
      proofs: [{ id: 'p-recv', name: 'cxc.png' }],
      payments: [{ proofs: [{ id: 'p-pay', name: 'cobro.jpg' }] }],
    }
    const proofs = collectSalePaymentProofs(sale, receivable)
    expect(proofs).toHaveLength(3)
    expect(findReceivableForSale([receivable], 'sale-1')).toBe(receivable)
  })
})
