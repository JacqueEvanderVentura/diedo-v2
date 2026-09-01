import { describe, expect, it } from 'vitest'
import { calculatePosTotals } from '@/modules/pos/lib/openAccount'
import {
  buildCxcAccountRows,
  getAccountRowMeta,
  reconcileCxcSummary,
  summarizeCxcAccounts,
} from '@/modules/pos/lib/cxcAccounts'
import { buildShiftMovements, sumByMethod } from '@/modules/pos/lib/caja'
import { getReceivableVoidPolicy, POS_PROOF_ACCEPT } from '@/modules/pos/lib/receivables'

describe('reglas financieras de Terminal POS', () => {
  it('calcula ITBIS por línea después de distribuir el descuento', () => {
    const totals = calculatePosTotals({
      items: [
        { id: 'taxed', qty: 1, price: 100, taxPct: 18 },
        { id: 'exempt', qty: 1, price: 100, taxPct: 0 },
      ],
      discountMode: 'pct',
      discountValue: 10,
      taxPct: 18,
    })

    expect(totals).toMatchObject({
      subtotal: 200,
      discountAmount: 20,
      taxableAmount: 180,
      taxAmount: 16.2,
      total: 196.2,
    })
    expect(totals.lines.map((line) => line.taxAmount)).toEqual([16.2, 0])
  })

  it('usa redondeo comercial de centavos y milésimas como el backend', () => {
    const totals = calculatePosTotals({
      items: [{ id: 'edge', qty: 1.2345, price: 1.005, taxPct: 0 }],
    })

    expect(totals.lines[0]).toMatchObject({ quantity: 1.235, unitPrice: 1.01, gross: 1.25 })
    expect(totals.total).toBe(1.25)
  })

  it('no mezcla cotizaciones ni retenciones con la deuda CxC', () => {
    const rows = buildCxcAccountRows({
      receivables: [{
        id: 'receivable-id',
        customer: { id: 'customer-id', name: 'Ada' },
        amount: 50,
        balance: 50,
        paidAmount: 0,
        status: 'pending',
      }],
      openQuotes: [{ id: 'quote-id', total: 100, customer: { id: 'customer-id', name: 'Ada' }, items: [] }],
      heldCarts: [{ id: 'held-id', heldKind: 'park', total: 200, customer: { id: 'customer-id', name: 'Ada' }, items: [] }],
    })

    expect(summarizeCxcAccounts(rows)).toMatchObject({
      pendingTotal: 50,
      cxcCount: 1,
      openQuoteCount: 1,
      heldCount: 1,
    })

    expect(reconcileCxcSummary(
      summarizeCxcAccounts(rows),
      { pendingTotal: '1250.50', pendingCount: 8, partialCount: 3 },
      { openCount: 5, heldCount: 4 }
    )).toMatchObject({
      pendingTotal: 1250.5,
      cxcCount: 8,
      partialCount: 3,
      openCount: 17,
      openQuoteCount: 5,
      heldCount: 4,
    })
  })

  it('identifica CxC de citas y excluye ventas anuladas de caja', () => {
    expect(getAccountRowMeta({ kind: 'receivable', source: 'appointment' }).label).toBe('Agenda')

    const sales = [
      { id: 'active', status: 'completed', method: 'efectivo', total: 100, createdAt: '2026-09-01T10:00:00Z' },
      { id: 'voided', status: 'voided', method: 'efectivo', total: 75, createdAt: '2026-09-01T11:00:00Z' },
    ]
    expect(buildShiftMovements({ shiftSales: sales })).toHaveLength(1)
    expect(sumByMethod(sales, 'efectivo')).toBe(100)
  })

  it('sólo permite anular CxC compatibles sin pagos aplicados', () => {
    expect(getReceivableVoidPolicy({ source: 'sale', status: 'pending', amount: 100, balance: 100 })).toEqual({
      canVoid: false,
      reason: 'Anula la venta de origen.',
    })
    expect(getReceivableVoidPolicy({ source: 'appointment', status: 'partial', amount: 100, paidAmount: 25, balance: 75, apiSynced: true })).toEqual({
      canVoid: false,
      reason: 'Reversa los pagos antes de anularla.',
    })
    expect(getReceivableVoidPolicy({ source: 'appointment', status: 'pending', amount: 100, paidAmount: 0, balance: 100 })).toEqual({
      canVoid: true,
      reason: null,
    })
    expect(getReceivableVoidPolicy({ source: 'manual', status: 'overdue', amount: 100, paidAmount: 0, balance: 100 }).canVoid).toBe(true)
    expect(getReceivableVoidPolicy({ source: 'appointment', status: 'paid', balance: 0 }).canVoid).toBe(false)
    expect(getReceivableVoidPolicy({ source: 'appointment', status: 'voided', balance: 100 }).canVoid).toBe(false)
  })

  it('limita comprobantes POS a los MIME admitidos por backend', () => {
    expect(POS_PROOF_ACCEPT).toContain('application/pdf')
    expect(POS_PROOF_ACCEPT).toContain('image/jpeg')
    expect(POS_PROOF_ACCEPT).toContain('image/png')
    expect(POS_PROOF_ACCEPT).toContain('image/webp')
    expect(POS_PROOF_ACCEPT).not.toContain('image/*')
    expect(POS_PROOF_ACCEPT).not.toContain('gif')
  })
})
