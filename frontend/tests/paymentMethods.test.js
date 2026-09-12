import { describe, expect, it } from 'vitest'
import {
  paymentMethodAllowsProofUpload,
  validatePaymentEvidence,
} from '@/modules/pos/lib/paymentMethods'

describe('paymentMethods evidence', () => {
  it('permite comprobante en transferencia, link y tarjeta', () => {
    expect(paymentMethodAllowsProofUpload({ id: 'transferencia' })).toBe(true)
    expect(paymentMethodAllowsProofUpload({ id: 'link' })).toBe(true)
    expect(paymentMethodAllowsProofUpload({ id: 'tarjeta' })).toBe(true)
    expect(paymentMethodAllowsProofUpload({ id: 'efectivo' })).toBe(false)
  })

  it('exige referencia o comprobante solo en transferencia', () => {
    expect(validatePaymentEvidence({ id: 'transferencia' }, { reference: '', proof: null })).toBeTruthy()
    expect(validatePaymentEvidence({ id: 'transferencia' }, { reference: 'ABC', proof: null })).toBeNull()
    expect(validatePaymentEvidence({ id: 'tarjeta' }, { reference: '', proof: null })).toBeNull()
  })
})
