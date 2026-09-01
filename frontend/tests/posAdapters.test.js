import { describe, expect, it } from 'vitest'
import {
  checkoutToApiPayload,
  mapReceivableFromApi,
  mapRegisterHistoryEntry,
  mapPaymentMethodsFromApi,
  mapPosStateFromApi,
  movementToApiPayload,
  mapQuoteFromApi,
  mapQuoteSummaryFromApi,
  mapQuotesPageFromApi,
  mapReceivableSummaryFromApi,
  mapReceivablesPageFromApi,
  mapRegisterFromApi,
  mapSalesPageFromApi,
  quotePatchToApiPayload,
  quoteToApiPayload,
  receivablePaymentToApiPayload,
} from '@/services/adapters/pos'

describe('adaptadores de Terminal POS', () => {
  it('normaliza códigos de pago API a códigos semánticos usados por la UI', () => {
    const methods = mapPaymentMethodsFromApi([
      { id: 'cash-id', code: 'cash', name: 'Efectivo', status: 'active', isSystem: true },
      { id: 'card-id', code: 'card', name: 'Tarjeta', status: 'active', isSystem: true },
      {
        id: 'transfer-id',
        code: 'bank_transfer',
        name: 'Transferencia',
        status: 'active',
        settlementPolicy: 'pending_confirmation',
        affectsCashDrawer: false,
        requiresEvidence: true,
      },
      { id: 'credit-id', code: 'accounts_receivable', name: 'Crédito', status: 'active' },
    ])

    expect(methods.map((method) => method.id)).toEqual([
      'efectivo',
      'tarjeta',
      'transferencia',
      'cxc',
    ])
    expect(methods[0]).toMatchObject({ apiId: 'cash-id', affectsCash: true })
    expect(methods[2]).toMatchObject({
      settlementMode: 'pending_confirmation',
      affectsCash: false,
      requiresProof: true,
    })
    expect(methods[3]).toMatchObject({ settlementMode: 'credit' })
  })

  it('mapea el estado agregado sin mezclar cotizaciones retenidas con CxC', () => {
    const mapped = mapPosStateFromApi({
      register: {
        id: 'register-id',
        status: 'open',
        branchId: 'branch-id',
        openingCash: '1000.00',
        expectedCash: '1425.00',
        version: 2,
      },
      sales: [{
        id: 'sale-id',
        branchId: 'branch-id',
        total: '500.00',
        paymentMethodCode: 'cash',
        lines: [{ id: 'line-id', itemId: 'item-id', itemName: 'Servicio', quantity: '1', unitPrice: '500' }],
      }],
      quotes: [
        { id: 'quote-id', kind: 'quote', status: 'open', customerName: 'Ada', items: [] },
        { id: 'park-id', kind: 'parked', status: 'open', customerName: 'Lin', items: [] },
      ],
      receivables: [{
        id: 'receivable-id',
        customerName: 'Ada',
        amount: '1000',
        paidAmount: '250',
        balance: '750',
        status: 'partially_paid',
        payments: [],
        lines: [{ id: 'receivable-line-id', description: 'Saldo de cita', quantity: '1', unitPrice: '1000' }],
      }],
    }, { branchId: 'branch-id' })

    expect(mapped.register).toMatchObject({ id: 'register-id', open: true, expectedCash: 1425 })
    expect(mapped.sales[0]).toMatchObject({ id: 'sale-id', total: 500, method: 'efectivo' })
    expect(mapped.heldCarts).toHaveLength(2)
    expect(mapped.openQuotes.map((quote) => quote.id)).toEqual(['quote-id'])
    expect(mapped.receivables[0]).toMatchObject({ status: 'partial', paidAmount: 250, balance: 750 })
    expect(mapped.receivables[0].items[0]).toMatchObject({ name: 'Saldo de cita', price: 1000 })
  })

  it('construye checkout con UUID de método y conserva File sólo en el pago multipart', () => {
    const methods = [{ id: 'transferencia', apiId: 'method-id', code: 'transfer' }]
    const state = {
      branchId: 'branch-id',
      register: { id: 'register-id' },
      activeQuoteId: 'quote-id',
      heldCarts: [{ id: 'quote-id', version: 7 }],
      openQuotes: [],
      apiContext: { mode: 'online' },
      customer: { id: 'customer-id' },
      items: [],
      discountMode: 'pct',
      discountValue: 10,
      taxPct: 18,
      paymentMethods: methods,
    }
    const checkout = checkoutToApiPayload({
      total: 106.2,
      subtotal: 100,
      discountAmt: 10,
      taxAmt: 16.2,
      taxPct: 18,
      method: 'transferencia',
      reference: 'TRF-01',
      customer: state.customer,
      items: [{ id: 'item-id', qty: 1, price: 100 }],
    }, state)

    expect(checkout).toMatchObject({
      branchId: 'branch-id',
      registerId: 'register-id',
      quoteId: 'quote-id',
      quoteVersion: 7,
      paymentMethodId: 'method-id',
      reference: 'TRF-01',
      lines: [{ itemId: 'item-id', quantity: 1, unitPrice: 100 }],
    })

    const proof = new File(['image'], 'proof.png', { type: 'image/png' })
    const payment = receivablePaymentToApiPayload(
      { version: 4 },
      { amount: 50, method: 'transferencia', proof },
      { register: { open: true, id: 'register-id' }, paymentMethods: methods }
    )
    expect(payment.proof).toBe(proof)
  })

  it('rechaza el checkout online de una cotización sin versión sincronizada', () => {
    expect(() => checkoutToApiPayload({
      method: 'efectivo',
      customer: { id: 'walk-in' },
      items: [{ id: 'item-id', qty: 1, price: 100 }],
    }, {
      branchId: 'branch-id',
      register: { id: 'register-id' },
      activeQuoteId: 'quote-id',
      heldCarts: [{ id: 'quote-id' }],
      openQuotes: [],
      apiContext: { mode: 'online' },
      paymentMethods: [{ id: 'efectivo', apiId: 'cash-id', code: 'cash' }],
    })).toThrow('falta su versión sincronizada')
  })

  it('respeta anulaciones backend y excluye ventas anuladas del turno', () => {
    expect(mapReceivableFromApi({
      id: 'receivable-cancelled',
      amount: '100',
      balance: '100',
      status: 'cancelled',
    }).status).toBe('voided')

    const mapped = mapPosStateFromApi({
      register: { id: 'register-id', status: 'open', branchId: 'branch-id' },
      sales: [
        { id: 'sale-active', registerId: 'register-id', total: '100', status: 'completed', lines: [] },
        { id: 'sale-voided', registerId: 'register-id', total: '90', status: 'voided', lines: [] },
      ],
    }, { branchId: 'branch-id' })

    expect(mapped.sales).toHaveLength(2)
    expect(mapped.shiftSales.map((sale) => sale.id)).toEqual(['sale-active'])
  })

  it('fuerza vencida desde el boolean backend sin degradar pagadas ni anuladas', () => {
    expect(mapReceivableFromApi({
      id: 'receivable-overdue',
      amount: '100',
      balance: '75',
      paidAmount: '25',
      status: 'partial',
      overdue: true,
    }).status).toBe('overdue')

    expect(mapReceivableFromApi({
      id: 'receivable-paid',
      amount: '100',
      balance: '0',
      status: 'paid',
      overdue: true,
    }).status).toBe('paid')

    expect(mapReceivableFromApi({
      id: 'receivable-voided',
      amount: '100',
      balance: '100',
      status: 'cancelled',
      overdue: true,
    }).status).toBe('voided')
  })

  it('reconcilia el monto de un gasto itemizado con la suma de sus líneas', () => {
    const payload = movementToApiPayload({
      concept: 'Insumos',
      amount: 999,
      method: 'efectivo',
      items: [
        { id: 'item-a', name: 'Guantes', qty: 2, price: 10.25 },
        { id: 'item-b', name: 'Gel', qty: 1, price: 4.5 },
      ],
    }, {
      paymentMethods: [{ id: 'efectivo', apiId: 'cash-id', code: 'cash' }],
    }, 'expense')

    expect(payload.amount).toBe(25)
    expect(payload.lines).toEqual([
      expect.objectContaining({ itemId: 'item-a', quantity: 2, unitCost: 10.25 }),
      expect.objectContaining({ itemId: 'item-b', quantity: 1, unitCost: 4.5 }),
    ])
  })

  it('mapea el resumen de cierre con los nombres reales del backend', () => {
    const mapped = mapRegisterHistoryEntry({
      id: 'register-id',
      status: 'closed',
      branchId: 'branch-id',
      openingCash: '1000',
      expectedCash: '1240',
      countedCash: '1235',
      difference: '-5',
      openedByName: 'Ada',
      closedAt: '2026-09-01T12:00:00Z',
      summary: {
        cashSales: '200',
        cashReceivablePayments: '50',
        manualIncome: '20',
        cashExpenses: '30',
        expectedCash: '1240',
      },
    }, 'branch-id')

    expect(mapped).toMatchObject({
      cashSales: 200,
      cashReceivablePayments: 50,
      cashIncomes: 20,
      expenses: 30,
      expected: 1240,
      actual: 1235,
      difference: -5,
      userName: 'Ada',
    })
  })

  it('guarda y restaura método y referencia de cotizaciones sin usar notas', () => {
    const paymentMethods = [{ id: 'transferencia', apiId: 'method-id', code: 'transfer' }]
    const payload = quoteToApiPayload({
      branchId: 'branch-id',
      customer: { id: 'customer-id' },
      items: [{ id: 'item-id', qty: 1, price: 100 }],
      discountMode: 'pct',
      discountValue: 0,
      paymentMethod: 'transferencia',
      paymentReference: 'TRF-001',
      notes: 'Nota operativa',
      paymentMethods,
    })

    expect(payload).toMatchObject({
      paymentMethodId: 'method-id',
      reference: 'TRF-001',
      notes: 'Nota operativa',
    })
    const mapped = mapQuoteFromApi({
      id: 'quote-id',
      paymentMethod: { id: 'method-id', code: 'transfer' },
      reference: 'TRF-001',
      notes: 'Nota operativa',
      lines: [],
    })
    expect(mapped).toMatchObject({
      paymentMethod: 'transferencia',
      paymentMethodApiId: 'method-id',
      paymentReference: 'TRF-001',
      notes: 'Nota operativa',
    })

    expect(quotePatchToApiPayload(mapped, {
      paymentMethod: 'transferencia',
      paymentReference: 'TRF-002',
      notes: 'Otra nota',
      paymentMethods,
    })).toMatchObject({
      paymentMethodId: 'method-id',
      reference: 'TRF-002',
      notes: 'Otra nota',
    })
  })

  it('mapea agregados y páginas sin inventar detalles no cargados', () => {
    const register = mapRegisterFromApi({
      id: 'register-id',
      status: 'open',
      branchId: 'branch-id',
      movementsTotal: 140,
      summary: {
        totalSales: '1250.50',
        salesCount: 12,
        voidedSalesCount: 2,
        salesByPaymentMethod: [{
          paymentMethod: { id: 'cash-id', code: 'cash', name: 'Efectivo' },
          salesTotal: '800.00',
          salesCount: 8,
        }],
      },
    })
    expect(register).toMatchObject({
      movementsTotal: 140,
      summary: {
        totalSales: 1250.5,
        salesCount: 12,
        voidedSalesCount: 2,
        salesByPaymentMethod: [{ salesTotal: 800, paymentMethod: { id: 'efectivo' } }],
      },
    })

    const salesPage = mapSalesPageFromApi({
      items: [{ id: 'sale-id', total: '100', paymentMethod: { code: 'card' } }],
      page: 2,
      pageSize: 50,
      totalItems: 101,
      totalPages: 3,
    })
    expect(salesPage.pagination).toEqual({
      page: 2,
      pageSize: 50,
      totalItems: 101,
      totalPages: 3,
      loading: false,
    })

    const receivablesPage = mapReceivablesPageFromApi({
      items: [{ id: 'receivable-id', originalAmount: '100', paidTotal: '25', balance: '75' }],
      page: 1,
      pageSize: 50,
      totalItems: 1,
      totalPages: 1,
    })
    const quotesPage = mapQuotesPageFromApi({
      items: [{ id: 'quote-id', kind: 'quote', status: 'open', total: '90' }],
      page: 1,
      pageSize: 50,
      totalItems: 1,
      totalPages: 1,
    })
    expect(receivablesPage.items[0].detailLoaded).toBe(false)
    expect(quotesPage.items[0].detailLoaded).toBe(false)
    expect(mapReceivableSummaryFromApi({ pendingTotal: '75', pendingCount: 1, partialCount: 1 }))
      .toMatchObject({ pendingTotal: 75, pendingCount: 1, partialCount: 1 })
    expect(mapQuoteSummaryFromApi({ openTotal: '90', openCount: 1, heldCount: 0 }))
      .toMatchObject({ openTotal: 90, openCount: 1, heldCount: 0 })
  })
})
