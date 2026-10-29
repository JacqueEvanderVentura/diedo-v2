import { describe, expect, it } from 'vitest'
import { buildInvoicePaymentLog } from '@/modules/pos/lib/invoicePaymentLog'

describe('buildInvoicePaymentLog', () => {
  it('merges checkout tenders and receivable payments chronologically', () => {
    const sale = {
      id: 'sale-1',
      createdAt: '2026-01-02T10:00:00.000Z',
      tenders: [
        {
          id: 't1',
          amount: 40,
          method: 'efectivo',
          createdAt: '2026-01-02T10:00:00.000Z',
          status: 'settled',
        },
        {
          id: 't2',
          amount: 60,
          method: 'transferencia',
          reference: 'TR-99',
          createdAt: '2026-01-02T10:00:00.000Z',
          status: 'awaiting_approval',
        },
      ],
      payment: {
        proofs: [{ id: 'proof-1', name: 'voucher.png' }],
      },
    }
    const receivable = {
      payments: [
        {
          id: 'p1',
          amount: 25,
          method: 'efectivo',
          createdAt: '2026-01-05T12:00:00.000Z',
          proofs: [{ id: 'proof-2', name: 'abono.jpg' }],
        },
      ],
    }

    const log = buildInvoicePaymentLog({ sale, receivable })
    expect(log).toHaveLength(3)
    expect(log[0].sourceLabel).toBe('Al facturar')
    expect(log[1].sourceLabel).toBe('Al facturar')
    expect(log[2].sourceLabel).toBe('Abono')
    expect(log[2].proofs).toHaveLength(1)
    expect(log[1].proofs).toHaveLength(1)
  })

  it('synthesizes nothing when sale has no tenders and no receivable payments', () => {
    expect(buildInvoicePaymentLog({ sale: { tenders: [] }, receivable: { payments: [] } }))
      .toEqual([])
  })

  it('no adjunta comprobantes de abonos al tender cxc de checkout', () => {
    const sharedProof = {
      id: 'proof-shared',
      name: 'CnP.png',
      ownerType: 'customer_payment',
      paymentId: 'pay-2',
    }
    const sale = {
      id: 'sale-1',
      createdAt: '2026-10-29T18:46:00.000Z',
      tenders: [
        {
          id: 't-cxc',
          amount: 1,
          method: 'cxc',
          createdAt: '2026-10-29T18:46:00.000Z',
          status: 'settled',
        },
        {
          id: 't-transfer',
          amount: 1,
          method: 'transferencia',
          createdAt: '2026-10-29T18:46:00.000Z',
          status: 'settled',
        },
      ],
      payment: { proofs: [sharedProof] },
    }
    const receivable = {
      payments: [
        {
          id: 'pay-2',
          amount: 1,
          method: 'transferencia',
          createdAt: '2026-10-29T19:00:00.000Z',
          proofs: [sharedProof],
        },
      ],
    }

    const log = buildInvoicePaymentLog({ sale, receivable })
    const checkoutCxc = log.find((entry) => entry.key === 'checkout-t-cxc')
    const checkoutTransfer = log.find((entry) => entry.key === 'checkout-t-transfer')
    const abono = log.find((entry) => entry.source === 'receivable')

    expect(checkoutCxc.proofs).toEqual([])
    expect(checkoutTransfer.proofs).toEqual([])
    expect(abono.proofs).toHaveLength(1)
    expect(abono.proofs[0].id).toBe('proof-shared')
  })
})
