import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  paymentMethods: vi.fn(),
  listRegisters: vi.fn(),
  listSales: vi.fn(),
  listRegisterMovements: vi.fn(),
  listReceivables: vi.fn(),
  receivablesSummary: vi.fn(),
  listQuotes: vi.fn(),
  quotesSummary: vi.fn(),
  getReceivable: vi.fn(),
  getQuote: vi.fn(),
  checkout: vi.fn(),
  openRegister: vi.fn(),
  closeRegister: vi.fn(),
  createRegisterMovement: vi.fn(),
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
  cancelQuote: vi.fn(),
  updateReceivable: vi.fn(),
  createReceivablePayment: vi.fn(),
  voidReceivable: vi.fn(),
  voidSale: vi.fn(),
  reversePayment: vi.fn(),
  uploadReceivableProof: vi.fn(),
  downloadProof: vi.fn(),
  createKey: vi.fn(),
}))

vi.mock('@/services/posApi', () => ({
  posApi: mocks,
  createPosIdempotencyKey: mocks.createKey,
}))

import { useConfigStore } from '@/stores/configStore'
import { usePosStore } from '@/stores/posStore'
import { useSessionStore } from '@/stores/sessionStore'

const apiState = () => ({
  register: {
    id: 'register-id',
    status: 'open',
    branchId: 'branch-id',
    openingCash: '1000',
    expectedCash: '1000',
    version: 1,
  },
  sales: [],
  quotes: [],
  receivables: [],
  movements: [],
  catalog: [{
    id: 'branch-product-id',
    name: 'Producto sucursal',
    itemType: 'product',
    salePrice: '100',
    taxRate: '18',
    stockQuantity: '1',
    stockStatus: 'available',
  }],
})

describe('store online de Terminal POS', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.createKey.mockReturnValue('attempt-key-1')
    mocks.state.mockResolvedValue(apiState())
    mocks.paymentMethods.mockResolvedValue([
      { id: 'cash-id', code: 'cash', name: 'Efectivo', status: 'active' },
      { id: 'transfer-id', code: 'transfer', name: 'Transferencia', status: 'active' },
    ])
    mocks.listRegisters.mockResolvedValue({ items: [] })
    mocks.listSales.mockResolvedValue({ items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 0 })
    mocks.listRegisterMovements.mockResolvedValue({ items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 0 })
    mocks.listReceivables.mockResolvedValue({ items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 0 })
    mocks.receivablesSummary.mockResolvedValue({ pendingTotal: '0', pendingCount: 0, partialCount: 0 })
    mocks.listQuotes.mockResolvedValue({ items: [], page: 1, pageSize: 50, totalItems: 0, totalPages: 0 })
    mocks.quotesSummary.mockResolvedValue({ openCount: 0, heldCount: 0, openTotal: '0', heldTotal: '0' })
    useSessionStore.setState({
      status: 'online',
      initialized: true,
      accessToken: 'token',
      user: { workspaceId: 'workspace-id', enabledModules: ['sales', 'pos'] },
    })
    usePosStore.getState().clearSensitive()
    usePosStore.setState({
      branchId: 'branch-id',
      apiContext: { hydrated: false, mode: 'online', branchId: 'branch-id', lastSyncedAt: null },
      hydrating: false,
      mutating: null,
      error: null,
    })
  })

  afterAll(() => {
    useSessionStore.setState({ status: 'demo', accessToken: null, user: null })
    usePosStore.getState().clearSensitive()
  })

  it('hidrata estado por sucursal y sincroniza métodos semánticos', async () => {
    await usePosStore.getState().hydrateFromApi('branch-id')

    expect(mocks.state).toHaveBeenCalledWith({ branchId: 'branch-id' })
    expect(usePosStore.getState()).toMatchObject({
      register: { id: 'register-id', open: true, expectedCash: 1000 },
      apiContext: { hydrated: true, mode: 'online', branchId: 'branch-id' },
      hydrating: false,
      error: null,
    })
    expect(useConfigStore.getState().paymentMethods).toEqual([
      expect.objectContaining({ id: 'efectivo', apiId: 'cash-id' }),
      expect.objectContaining({ id: 'transferencia', apiId: 'transfer-id' }),
    ])
  })

  it('pagina CxC y carga el detalle sólo al abrir la cuenta', async () => {
    mocks.listReceivables.mockResolvedValueOnce({
      items: [{
        id: 'receivable-page-1',
        branchId: 'branch-id',
        customerName: 'Ada',
        originalAmount: '100',
        paidTotal: '0',
        balance: '100',
        status: 'pending',
        version: 1,
      }],
      page: 1,
      pageSize: 50,
      totalItems: 51,
      totalPages: 2,
    })

    await usePosStore.getState().hydrateFromApi('branch-id')
    expect(usePosStore.getState().receivables[0]).toMatchObject({
      id: 'receivable-page-1',
      detailLoaded: false,
    })
    expect(usePosStore.getState().pagination.receivables).toMatchObject({ page: 1, totalPages: 2 })

    mocks.listReceivables.mockResolvedValueOnce({
      items: [{
        id: 'receivable-page-2',
        branchId: 'branch-id',
        customerName: 'Lin',
        originalAmount: '75',
        paidTotal: '0',
        balance: '75',
        status: 'pending',
        version: 1,
      }],
      page: 2,
      pageSize: 50,
      totalItems: 51,
      totalPages: 2,
    })
    await usePosStore.getState().loadMoreReceivables()
    expect(usePosStore.getState().receivables.map((item) => item.id)).toEqual([
      'receivable-page-1',
      'receivable-page-2',
    ])

    mocks.getReceivable.mockResolvedValueOnce({
      id: 'receivable-page-2',
      branchId: 'branch-id',
      customerName: 'Lin',
      originalAmount: '75',
      paidTotal: '0',
      balance: '75',
      status: 'pending',
      version: 1,
      lines: [{ id: 'line-id', description: 'Servicio', quantity: '1', unitPrice: '75' }],
      payments: [],
      proofs: [],
    })
    await usePosStore.getState().ensureReceivableDetail('receivable-page-2')
    expect(mocks.getReceivable).toHaveBeenCalledWith('receivable-page-2')
    expect(usePosStore.getState().receivables[1]).toMatchObject({
      detailLoaded: true,
      items: [{ name: 'Servicio', price: 75 }],
    })
  })

  it('reutiliza Idempotency-Key al reintentar exactamente el mismo checkout', async () => {
    await usePosStore.getState().hydrateFromApi('branch-id')
    const data = {
      total: 118,
      method: 'efectivo',
      customer: { id: 'customer-id', name: 'Ada' },
      reference: null,
      items: [{ id: 'item-id', name: 'Servicio', qty: 1, price: 100 }],
      subtotal: 100,
      discountAmt: 0,
      discountPct: 0,
      taxPct: 18,
      taxAmt: 18,
    }
    mocks.checkout
      .mockRejectedValueOnce(new Error('La conexión se interrumpió'))
      .mockResolvedValueOnce({ sale: { id: 'sale-id', total: '118', paymentMethodCode: 'cash', lines: [] } })

    await expect(usePosStore.getState().recordSale(data)).rejects.toThrow('La conexión se interrumpió')
    await expect(usePosStore.getState().recordSale(data)).resolves.toBeTruthy()

    const firstOptions = mocks.checkout.mock.calls[0][1]
    const retryOptions = mocks.checkout.mock.calls[1][1]
    expect(firstOptions).toEqual({ idempotencyKey: 'attempt-key-1' })
    expect(retryOptions).toEqual({ idempotencyKey: 'attempt-key-1' })
    expect(mocks.createKey).toHaveBeenCalledTimes(1)
  })

  it('respeta el stock del catálogo POS de la sucursal al incrementar el carrito', async () => {
    await usePosStore.getState().hydrateFromApi('branch-id')
    const product = usePosStore.getState().posCatalog[0]

    usePosStore.getState().addItem(product)
    usePosStore.getState().incItem(product.id)

    expect(usePosStore.getState().items).toEqual([
      expect.objectContaining({ id: 'branch-product-id', qty: 1 }),
    ])
  })

  it('exige el efectivo contado y envía el arqueo real al cerrar', async () => {
    usePosStore.setState({
      register: {
        id: 'register-id',
        open: true,
        branchId: 'branch-id',
        openingCash: 1000,
        version: 3,
        apiSynced: true,
      },
      apiContext: { hydrated: true, mode: 'online', branchId: 'branch-id', lastSyncedAt: null },
    })

    await expect(usePosStore.getState().closeRegister('')).rejects.toThrow('efectivo contado')
    expect(mocks.closeRegister).not.toHaveBeenCalled()

    const closeResponse = {
      id: 'register-id',
      status: 'closed',
      branchId: 'branch-id',
      openingCash: '1000',
      expectedCash: '1240',
      countedCash: '1235',
      difference: '-5',
      openedByName: 'Ada',
      closedAt: '2026-09-01T12:00:00Z',
      version: 4,
      summary: {
        openingCash: '1000',
        cashSales: '200',
        cashReceivablePayments: '50',
        manualIncome: '20',
        cashExpenses: '30',
        expectedCash: '1240',
      },
    }
    mocks.closeRegister.mockResolvedValue(closeResponse)
    mocks.state.mockResolvedValueOnce({ ...apiState(), register: null })

    await usePosStore.getState().closeRegister(1235)

    expect(mocks.closeRegister).toHaveBeenCalledWith(
      'register-id',
      { countedCash: 1235, notes: null, version: 3 },
      { idempotencyKey: 'attempt-key-1' }
    )
    expect(usePosStore.getState().lastCloseSummary).toMatchObject({
      actual: 1235,
      expected: 1240,
      cashIncomes: 20,
      expenses: 30,
      cashReceivablePayments: 50,
    })
  })

  it('limpia carrito, cliente y cotización activa al cambiar de sucursal', () => {
    usePosStore.setState({
      branchId: 'branch-id',
      items: [{ id: 'item-id', name: 'Servicio', qty: 1, price: 100 }],
      customer: { id: 'customer-id', name: 'Ada' },
      activeQuoteId: 'quote-id',
      isFinalized: true,
      cartDrawerOpen: true,
    })

    usePosStore.getState().setBranch('other-branch-id')

    expect(usePosStore.getState()).toMatchObject({
      branchId: 'other-branch-id',
      items: [],
      customer: { id: 'walk-in' },
      activeQuoteId: null,
      isFinalized: false,
      cartDrawerOpen: false,
    })
  })

  it('abre un turno online sin arrastrar movimientos del turno anterior', async () => {
    usePosStore.setState({
      register: { id: null, open: false, branchId: 'branch-id', apiSynced: true },
      cashSales: 100,
      shiftSales: [{ id: 'old-sale', total: 100 }],
      shiftIncomes: [{ id: 'old-income', amount: 20 }],
      expenses: [{ id: 'old-expense', amount: 10 }],
      lastCloseSummary: { id: 'old-register' },
      apiContext: { hydrated: true, mode: 'online', branchId: 'branch-id', lastSyncedAt: null },
    })
    mocks.openRegister.mockResolvedValue({
      id: 'new-register',
      status: 'open',
      branchId: 'branch-id',
      openingCash: '500',
      expectedCash: '500',
      version: 1,
    })
    mocks.state.mockRejectedValueOnce(new Error('sin recarga'))

    await usePosStore.getState().openRegister(500)

    expect(usePosStore.getState()).toMatchObject({
      register: { id: 'new-register', open: true },
      cashSales: 0,
      shiftSales: [],
      shiftIncomes: [],
      expenses: [],
      lastCloseSummary: null,
    })
  })

  it('aplica la CxC devuelta al reversar un pago', async () => {
    usePosStore.setState({
      receivables: [{
        id: 'receivable-id',
        apiSynced: true,
        amount: 100,
        paidAmount: 50,
        balance: 50,
        status: 'partial',
        version: 2,
        payments: [{ id: 'payment-id', amount: 50, version: 1 }],
      }],
      apiContext: { hydrated: true, mode: 'online', branchId: 'branch-id', lastSyncedAt: null },
    })
    mocks.reversePayment.mockResolvedValue({
      id: 'receivable-id',
      amount: '100',
      paidAmount: '0',
      balance: '100',
      status: 'open',
      version: 3,
      payments: [{ id: 'payment-id', amount: '50', status: 'reversed', reversedAt: '2026-09-01T12:00:00Z' }],
    })
    mocks.state.mockRejectedValueOnce(new Error('sin recarga'))

    await usePosStore.getState().reversePayment('payment-id', 'Duplicado')

    expect(usePosStore.getState().receivables[0]).toMatchObject({
      paidAmount: 0,
      balance: 100,
      status: 'pending',
      version: 3,
    })
    expect(usePosStore.getState().receivables[0].payments[0]).toMatchObject({ reversed: true })
  })

  it('muestra el comprobante devuelto por el backend sin enviar campos multipart ajenos', async () => {
    const proofFile = new File(['proof'], 'proof.png', { type: 'image/png' })
    usePosStore.setState({
      receivables: [{
        id: 'receivable-id',
        apiSynced: true,
        amount: 100,
        balance: 100,
        status: 'pending',
        version: 2,
        payments: [],
      }],
      apiContext: { hydrated: true, mode: 'online', branchId: 'branch-id', lastSyncedAt: null },
    })
    mocks.uploadReceivableProof.mockResolvedValue({
      id: 'proof-id',
      originalFilename: 'proof.png',
      contentType: 'image/png',
      sizeBytes: 5,
      downloadUrl: '/api/v1/pos/proofs/proof-id/content',
    })
    mocks.state.mockRejectedValueOnce(new Error('sin recarga'))

    await usePosStore.getState().attachReceivableProof('receivable-id', {
      proof: proofFile,
      reference: 'IGNORADA',
    })

    expect(mocks.uploadReceivableProof).toHaveBeenCalledWith(
      'receivable-id',
      { file: proofFile },
      { idempotencyKey: 'attempt-key-1' }
    )
    expect(usePosStore.getState().receivables[0].proof).toMatchObject({
      id: 'proof-id',
      name: 'proof.png',
      downloadUrl: '/api/v1/pos/proofs/proof-id/content',
    })
  })

  it('elimina semillas demo al entrar en sesión online', () => {
    useSessionStore.setState({ status: 'demo', accessToken: null, user: null })
    expect(usePosStore.getState().sales.length).toBeGreaterThan(0)

    useSessionStore.setState({
      status: 'online',
      initialized: true,
      accessToken: 'token',
      user: { workspaceId: 'workspace-id', enabledModules: ['sales', 'pos'] },
    })

    expect(usePosStore.getState()).toMatchObject({
      sales: [],
      receivables: [],
      heldCarts: [],
      apiContext: { mode: 'cleared' },
    })
  })

  it.each([
    ['saveOpenQuote', 'quote'],
    ['retainCart', 'held'],
  ])('actualiza la cotización restaurada con %s sin duplicarla', async (action, kind) => {
    useConfigStore.setState({
      paymentMethods: [{ id: 'transferencia', apiId: 'transfer-id', code: 'transfer', enabled: true }],
    })
    const restored = {
      id: 'quote-id',
      apiSynced: true,
      version: 4,
      heldKind: 'quote',
      documentKind: 'quote',
      branchId: 'branch-id',
      customer: { id: 'customer-id', name: 'Ada' },
      items: [{ id: 'item-id', name: 'Servicio', qty: 1, price: 100 }],
      discountMode: 'pct',
      discountValue: 0,
      paymentMethod: 'transferencia',
      paymentReference: 'TRF-OLD',
      notes: 'Conservar nota',
    }
    usePosStore.setState({
      heldCarts: [restored],
      openQuotes: [restored],
      apiContext: { hydrated: true, mode: 'online', branchId: 'branch-id', lastSyncedAt: null },
    })
    expect(usePosStore.getState().restoreHeldCart('quote-id')).toBe(true)
    usePosStore.getState().incItem('item-id')
    usePosStore.getState().setPaymentReference('TRF-NEW')

    mocks.updateQuote.mockResolvedValue({
      ...restored,
      kind,
      version: 5,
      reference: 'TRF-NEW',
      paymentMethod: { id: 'transfer-id', code: 'transfer' },
      lines: [{ id: 'line-id', itemId: 'item-id', itemName: 'Servicio', quantity: '2', unitPrice: '100' }],
    })
    mocks.state.mockRejectedValueOnce(new Error('sin recarga'))

    await usePosStore.getState()[action]()

    expect(mocks.createQuote).not.toHaveBeenCalled()
    expect(mocks.updateQuote).toHaveBeenCalledWith(
      'quote-id',
      expect.objectContaining({
        version: 4,
        kind,
        paymentMethodId: 'transfer-id',
        reference: 'TRF-NEW',
        lines: [expect.objectContaining({ itemId: 'item-id', quantity: 2 })],
      }),
      { idempotencyKey: 'attempt-key-1' }
    )
    expect(usePosStore.getState()).toMatchObject({ items: [], activeQuoteId: null })
  })

  it('anula una venta online y la excluye de los totales del turno', async () => {
    const sale = {
      id: 'sale-id',
      apiSynced: true,
      version: 2,
      status: 'posted',
      method: 'efectivo',
      total: 100,
      items: [],
    }
    usePosStore.setState({
      register: { id: 'register-id', open: true, branchId: 'branch-id', apiSynced: true },
      sales: [sale],
      shiftSales: [sale],
      cashSales: 100,
      apiContext: { hydrated: true, mode: 'online', branchId: 'branch-id', lastSyncedAt: null },
    })
    mocks.voidSale.mockResolvedValue({ id: 'sale-id', status: 'voided', version: 3 })
    mocks.state.mockRejectedValueOnce(new Error('sin recarga'))

    await usePosStore.getState().voidSale('sale-id', 'Cobro duplicado')

    expect(mocks.voidSale).toHaveBeenCalledWith(
      'sale-id',
      { reason: 'Cobro duplicado', version: 2 },
      { idempotencyKey: 'attempt-key-1' }
    )
    expect(usePosStore.getState().shiftSales[0].status).toBe('voided')
    expect(usePosStore.getState().cashSales).toBe(0)
    expect(usePosStore.getState().getShiftSalesTotal()).toBe(0)
    expect(usePosStore.getState().getShiftMovements()).toHaveLength(0)
  })
})
