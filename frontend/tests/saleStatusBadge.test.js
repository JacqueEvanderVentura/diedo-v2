import { describe, expect, it } from 'vitest'
import { saleStatusBadge } from '@/modules/crm/lib/crm'
import { isReceivableProofRequiredError } from '@/modules/pos/lib/receivables'

describe('saleStatusBadge', () => {
  const sale = { status: 'completed', method: 'transferencia', settlementPolicy: 'pending_confirmation' }

  it('shows APROBAR when approval is pending on the receivable', () => {
    expect(saleStatusBadge(sale, { approvalPendingAmount: 826, amount: 826, balance: 0 }).label).toBe('APROBAR')
  })

  it('shows Cta. por cobrar for open transfer without voucher', () => {
    expect(saleStatusBadge(sale, { approvalPendingAmount: 0, amount: 826, balance: 826 }).label).toBe('Cta. por cobrar')
  })

  it('shows Completada when receivable is settled', () => {
    expect(saleStatusBadge(sale, {
      apiSynced: true,
      approvalPendingAmount: 0,
      amount: 826,
      paidAmount: 826,
      balance: 0,
    }).label).toBe('Completada')
  })
})

describe('isReceivableProofRequiredError', () => {
  it('detects missing proof errors from approve and payment flows', () => {
    expect(isReceivableProofRequiredError('Adjunta el comprobante requerido por este método de pago.')).toBe(true)
    expect(isReceivableProofRequiredError('Adjunta un comprobante antes de aprobar el pago.')).toBe(true)
    expect(isReceivableProofRequiredError('No se pudo aprobar el pago.')).toBe(false)
  })
})
