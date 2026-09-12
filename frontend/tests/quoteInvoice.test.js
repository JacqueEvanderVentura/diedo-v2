import { describe, expect, it } from 'vitest'
import {
  analyzeQuoteInvoicePaymentSetup,
  canEmitQuoteInvoice,
  collectionModeForMethod,
  crmReceivablesFromQuotes,
  listCrmOpenReceivables,
  quoteConvertedSaleId,
  isQuoteInvoicePaid,
  isQuoteInvoicePending,
  isQuoteInvoiced,
  enrichQuoteInvoiceCollection,
  mergeInvoiceCollection,
  invoiceCollectionFromSalePolicy,
  invoiceCollectionStatusFromMethod,
  isQuoteInvoicePendingValidation,
  resolveQuoteInvoicePaymentMethod,
} from '@/modules/crm/lib/quoteInvoice'

const methods = [
  {
    id: 'efectivo',
    apiId: 'pm-cash',
    code: 'cash',
    enabled: true,
    settlementMode: 'immediate',
    settlementPolicy: 'immediate',
  },
  {
    id: 'transferencia',
    apiId: 'pm-transfer',
    code: 'transfer',
    enabled: true,
    settlementMode: 'pending_confirmation',
    settlementPolicy: 'pending_confirmation',
  },
  {
    id: 'cxc',
    apiId: 'pm-cxc',
    code: 'credit',
    enabled: true,
    settlementMode: 'credit',
    settlementPolicy: 'receivable',
  },
]

describe('quoteInvoice helpers', () => {
  it('no marca facturada hasta tener venta vinculada', () => {
    expect(isQuoteInvoiced({ status: 'aceptada' })).toBe(false)
    expect(isQuoteInvoiced({ convertedSaleId: 'sale-1' })).toBe(true)
  })

  it('solo permite emitir en aceptada sin factura previa', () => {
    expect(canEmitQuoteInvoice({ status: 'aceptada', items: [{ id: '1' }] })).toBe(true)
    expect(canEmitQuoteInvoice({ status: 'aceptada', total: 1500, items: [] })).toBe(true)
    expect(canEmitQuoteInvoice({ status: 'enviada', items: [{ id: '1' }] })).toBe(false)
    expect(canEmitQuoteInvoice({ status: 'aceptada', invoiceNumber: 'FAC-1', items: [{ id: '1' }] })).toBe(false)
  })

  it('resuelve método y modo de cobro como en POS', () => {
    expect(resolveQuoteInvoicePaymentMethod(methods, { paymentMethodId: 'efectivo' }).collectionMode).toBe('now')
    expect(resolveQuoteInvoicePaymentMethod(methods, { paymentMethodId: 'cxc' }).collectionMode).toBe('receivable')
    expect(collectionModeForMethod(methods[1])).toBe('receivable')
  })

  it('detecta huecos de configuración para mostrar CTA inline', () => {
    expect(analyzeQuoteInvoicePaymentSetup([], { online: true })?.code).toBe('no_methods')
    expect(
      analyzeQuoteInvoicePaymentSetup([{ id: 'x', enabled: true }], { online: true })?.code
    ).toBe('not_synced')
    expect(analyzeQuoteInvoicePaymentSetup(methods, { online: true })).toBeNull()
  })

  it('no degrada pendiente a cobrada al sincronizar con API', () => {
    expect(mergeInvoiceCollection('collected', 'pending_validation')).toBe('pending_validation')
    expect(mergeInvoiceCollection('pending_validation', 'collected')).toBe('pending_validation')
  })

  it('corrige collected del API si el método de pago fue transferencia', () => {
    const enriched = enrichQuoteInvoiceCollection(
      {
        id: 'q1',
        convertedSaleId: 'sale-t',
        invoiceNumber: 'VTA-9',
        invoiceCollection: 'collected',
        invoicePaymentMethod: 'transferencia',
      },
      [],
      []
    )
    expect(enriched.invoiceCollection).toBe('pending_validation')
  })

  it('infiere estado de cobro desde la venta al recargar', () => {
    const sales = [{
      id: 'sale-t',
      number: 'VTA-9',
      settlementPolicy: 'pending_confirmation',
      method: 'transferencia',
    }]
    const enriched = enrichQuoteInvoiceCollection(
      { id: 'q1', convertedSaleId: 'sale-t', invoiceNumber: 'VTA-9' },
      [],
      sales
    )
    expect(enriched.invoiceCollection).toBe('pending_validation')
    expect(invoiceCollectionFromSalePolicy(sales[0])).toBe('pending_validation')
  })

  it('clasifica cobro según método al emitir', () => {
    expect(invoiceCollectionStatusFromMethod(methods[0])).toBe('collected')
    expect(invoiceCollectionStatusFromMethod(methods[1])).toBe('pending_validation')
    expect(invoiceCollectionStatusFromMethod(methods[2])).toBe('receivable')
    expect(isQuoteInvoicePendingValidation({
      convertedSaleId: 's1',
      invoiceCollection: 'pending_validation',
    })).toBe(true)
    expect(isQuoteInvoicePaid({
      convertedSaleId: 's1',
      invoiceCollection: 'pending_validation',
    }, [])).toBe(false)
  })

  it('detecta factura pagada al instante o CxC saldada', () => {
    expect(isQuoteInvoicePaid({ convertedSaleId: 'sale-a' }, [])).toBe(true)
    expect(isQuoteInvoicePaid(
      { convertedSaleId: 'sale-a', invoiceCollection: 'receivable' },
      []
    )).toBe(false)
    expect(isQuoteInvoicePending(
      { convertedSaleId: 'sale-a', invoiceCollection: 'receivable' },
      []
    )).toBe(true)
    expect(isQuoteInvoicePaid(
      { convertedSaleId: 'sale-a' },
      [{ saleId: 'sale-a', amount: 100, paidAmount: 100, balance: 0, status: 'paid', apiSynced: true }]
    )).toBe(true)
    expect(isQuoteInvoicePaid(
      { convertedSaleId: 'sale-a' },
      [{ saleId: 'sale-a', amount: 100, paidAmount: 0, balance: 100, status: 'pending', apiSynced: true }]
    )).toBe(false)
    expect(isQuoteInvoicePending(
      { convertedSaleId: 'sale-a' },
      [{ saleId: 'sale-a', amount: 100, paidAmount: 0, balance: 100, status: 'pending', apiSynced: true }]
    )).toBe(true)
  })

  it('resuelve venta por número de factura cuando falta convertedSaleId', () => {
    const sales = [{ id: 'sale-uuid', number: 'VTA-00000041' }]
    expect(quoteConvertedSaleId({ invoiceNumber: 'VTA-00000041' }, sales)).toBe('sale-uuid')
    const rows = listCrmOpenReceivables(
      [],
      [{ id: 'q1', invoiceNumber: 'VTA-00000041', invoiceCollection: 'receivable', total: 1200, customerName: 'Test' }],
      sales
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].synthetic).toBe(true)
    expect(rows[0].balance).toBe(1200)
  })

  it('filtra CxC ligadas a cotizaciones CRM', () => {
    const quotes = [{ convertedSaleId: 'sale-a' }, { convertedSaleId: 'sale-b' }]
    const receivables = [
      { id: 'r1', saleId: 'sale-a', amount: 100, paidAmount: 0 },
      { id: 'r2', saleId: 'sale-x', amount: 50, paidAmount: 0 },
    ]
    expect(crmReceivablesFromQuotes(receivables, quotes).map((item) => item.id)).toEqual(['r1'])
  })
})
