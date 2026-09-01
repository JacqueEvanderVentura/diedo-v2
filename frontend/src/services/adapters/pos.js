import { calcSnapshotTotal } from '@/modules/pos/lib/openAccount'

const METHOD_ALIASES = Object.freeze({
  cash: 'efectivo',
  cash_payment: 'efectivo',
  efectivo: 'efectivo',
  card: 'tarjeta',
  credit_card: 'tarjeta',
  debit_card: 'tarjeta',
  tarjeta: 'tarjeta',
  transfer: 'transferencia',
  bank_transfer: 'transferencia',
  transferencia: 'transferencia',
  payment_link: 'link',
  link: 'link',
  credit: 'cxc',
  accounts_receivable: 'cxc',
  receivable: 'cxc',
  cxc: 'cxc',
})

const METHOD_ICONS = Object.freeze({
  efectivo: 'Banknote',
  tarjeta: 'CreditCard',
  transferencia: 'ArrowLeftRight',
  link: 'Link2',
  cxc: 'Clock',
})

const RECEIVABLE_STATUS = Object.freeze({
  open: 'pending',
  pending: 'pending',
  partially_paid: 'partial',
  partial: 'partial',
  paid: 'paid',
  settled: 'paid',
  overdue: 'overdue',
  void: 'voided',
  voided: 'voided',
  written_off: 'written_off',
  cancelled: 'voided',
  canceled: 'voided',
})

const QUOTE_OPEN_STATUSES = new Set(['draft', 'open', 'ready', 'pending'])

const numberValue = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const textValue = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback
  return String(value)
}

const first = (...values) => values.find((value) => value !== undefined && value !== null)

function normalizedCode(value) {
  return textValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function collection(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.results)) return value.results
  return []
}

function pagination(response, itemCount = 0) {
  const page = Math.max(1, numberValue(response?.page, 1))
  const pageSize = Math.max(1, numberValue(response?.pageSize, itemCount || 50))
  const totalItems = Math.max(0, numberValue(response?.totalItems, itemCount))
  const totalPages = Math.max(0, numberValue(
    response?.totalPages,
    totalItems ? Math.ceil(totalItems / pageSize) : 0
  ))
  return { page, pageSize, totalItems, totalPages, loading: false }
}

function entity(value, names = []) {
  let current = value?.data ?? value
  for (const name of names) {
    if (current?.[name] != null) return current[name]
  }
  return current
}

export function paymentMethodSemanticCode(method) {
  const source = typeof method === 'string'
    ? method
    : first(method?.semanticCode, method?.code, method?.slug, method?.name, method?.id)
  const normalized = normalizedCode(source) || 'payment'
  return METHOD_ALIASES[normalized] || normalized.replaceAll('_', '-')
}

export function mapPaymentMethodFromApi(method) {
  const semanticCode = paymentMethodSemanticCode(method)
  const rawSettlementMode = first(
    method.settlementMode,
    method.settlementPolicy,
    method.settlement_mode,
    method.settlement_policy
  )
  const settlementMode = rawSettlementMode === 'receivable' ? 'credit' : rawSettlementMode
  return {
    id: semanticCode,
    apiId: method.id || null,
    code: method.code || semanticCode,
    semanticCode,
    name: method.name || method.label || semanticCode,
    icon: method.icon || METHOD_ICONS[semanticCode] || 'Wallet',
    enabled: method.enabled ?? (method.status ? method.status === 'active' : true),
    core: Boolean(first(method.isSystem, method.is_system, false)),
    version: method.version ?? null,
    settlementMode: settlementMode || (semanticCode === 'cxc' ? 'credit' : ['transferencia', 'link'].includes(semanticCode) ? 'pending_confirmation' : 'immediate'),
    channel: method.channel || null,
    affectsCash: first(
      method.affectsCash,
      method.affectsCashDrawer,
      method.affects_cash,
      method.affects_cash_drawer,
      semanticCode === 'efectivo'
    ),
    requiresReference: first(method.requiresReference, method.requires_reference, ['transferencia', 'link'].includes(semanticCode)),
    requiresProof: first(
      method.requiresProof,
      method.requiresEvidence,
      method.requires_proof,
      method.requires_evidence,
      false
    ),
    apiSynced: true,
  }
}

export function mapPaymentMethodsFromApi(response) {
  const methods = collection(response).map(mapPaymentMethodFromApi)
  const seen = new Set()
  return methods.filter((method) => {
    if (seen.has(method.id)) return false
    seen.add(method.id)
    return true
  })
}

export function paymentMethodApiReference(methods, selected) {
  const method = (methods || []).find((item) => (
    item.id === selected || item.apiId === selected || item.code === selected
  ))
  const semanticCode = paymentMethodSemanticCode(method || selected)
  return {
    ...(method?.apiId ? { methodId: method.apiId } : {}),
    methodCode: method?.code || semanticCode,
  }
}

function mapCustomer(customer, fallbackName = 'Cliente Mostrador') {
  if (!customer) return { id: 'walk-in', name: fallbackName, phone: null }
  return {
    id: customer.id || customer.customerId || 'walk-in',
    name: customer.name || customer.displayName || customer.customerName || fallbackName,
    phone: customer.phone || customer.phoneNumber || null,
    email: customer.email || null,
  }
}

function mapProof(proof) {
  if (!proof) return null
  if (typeof proof === 'string') {
    return { id: null, name: proof.split('/').pop() || 'Comprobante', downloadUrl: proof }
  }
  return {
    id: proof.id || proof.attachmentId || null,
    name: proof.name || proof.originalFilename || proof.filename || 'Comprobante',
    contentType: proof.contentType || proof.mimeType || null,
    sizeBytes: numberValue(first(proof.sizeBytes, proof.size), null),
    downloadUrl: proof.downloadUrl || proof.contentUrl || proof.previewUrl || null,
  }
}

export function mapPaymentProofMutationResponse(response) {
  const proof = entity(response, ['proof', 'attachment'])
  return proof ? mapProof(proof) : null
}

export function mapPosLineFromApi(line) {
  const item = line.item || line.catalogItem || {}
  const quantity = numberValue(first(line.quantity, line.qty), 1)
  const price = numberValue(first(line.unitPrice, line.price, line.unit_price))
  return {
    id: first(line.itemId, line.catalogItemId, item.id, line.id),
    lineId: line.id || null,
    name: first(line.itemName, line.name, line.description, line.nameSnapshot, item.name, 'Artículo'),
    sku: first(line.itemSku, line.sku, line.skuSnapshot, item.sku, null),
    qty: quantity,
    price,
    listPrice: numberValue(first(line.listPrice, line.list_price, line.unitListPrice), price),
    taxPct: numberValue(first(line.taxPct, line.taxRate, line.tax_rate), null),
    apiSynced: true,
  }
}

export function mapPaymentFromApi(payment) {
  const method = first(
    payment.methodCode,
    payment.paymentMethodCode,
    payment.paymentMethod?.code,
    payment.method?.code,
    payment.method
  )
  return {
    id: payment.id,
    amount: numberValue(payment.amount),
    method: paymentMethodSemanticCode(method),
    methodId: first(payment.methodId, payment.paymentMethodId, payment.paymentMethod?.id, null),
    reference: payment.reference || null,
    note: payment.note || payment.notes || null,
    proof: mapProof(payment.proof || payment.attachment || collection(payment.proofs)[0]),
    status: payment.status || 'confirmed',
    reversed: Boolean(payment.reversedAt || payment.status === 'reversed'),
    version: payment.version ?? null,
    createdAt: payment.createdAt || payment.confirmedAt || payment.paidAt || new Date().toISOString(),
  }
}

export function mapReceivableFromApi(receivable) {
  const payments = collection(receivable.payments).map(mapPaymentFromApi)
  const amount = numberValue(first(receivable.originalAmount, receivable.amount, receivable.total))
  const paidFromPayments = payments
    .filter((payment) => !payment.reversed)
    .reduce((sum, payment) => sum + payment.amount, 0)
  const paidAmount = numberValue(
    first(receivable.paidAmount, receivable.paidTotal, receivable.amountPaid),
    paidFromPayments
  )
  const balance = numberValue(first(receivable.balance, receivable.pendingAmount), Math.max(0, amount - paidAmount))
  const rawStatus = normalizedCode(receivable.status)
  const mappedStatus = RECEIVABLE_STATUS[rawStatus]
    || (balance <= 0 ? 'paid' : paidAmount > 0 ? 'partial' : 'pending')
  const status = receivable.overdue === true && !['paid', 'voided'].includes(mappedStatus)
    ? 'overdue'
    : mappedStatus

  return {
    id: receivable.id,
    saleId: first(receivable.saleId, receivable.sale?.id, null),
    appointmentId: first(receivable.appointmentId, receivable.appointment?.id, null),
    source: receivable.source || receivable.sourceType || 'sale',
    branchId: first(receivable.branchId, receivable.branch?.id, null),
    customer: mapCustomer(receivable.customer || {
      id: receivable.customerId,
      name: receivable.customerName,
      phone: receivable.customerPhone,
    }),
    amount,
    paidAmount,
    balance,
    method: paymentMethodSemanticCode(first(receivable.methodCode, receivable.method, receivable.paymentMethod?.code, 'cxc')),
    reference: receivable.reference || null,
    status,
    createdAt: receivable.createdAt,
    updatedAt: receivable.updatedAt || null,
    dueDate: receivable.dueDate || null,
    notes: receivable.notes || '',
    payments,
    items: collection(first(receivable.items, receivable.lines)).map(mapPosLineFromApi),
    proof: mapProof(receivable.proof || receivable.attachment || collection(receivable.proofs)[0]),
    paidAt: receivable.paidAt || null,
    paidMethod: receivable.paidMethod ? paymentMethodSemanticCode(receivable.paidMethod) : null,
    version: receivable.version ?? null,
    detailLoaded: receivable.lines !== undefined
      || receivable.items !== undefined
      || receivable.payments !== undefined
      || receivable.proofs !== undefined,
    apiSynced: true,
  }
}

export function mapQuoteFromApi(quote) {
  const rawKind = normalizedCode(first(quote.kind, quote.quoteKind, quote.documentKind, quote.type))
  const heldKind = ['park', 'parked', 'held', 'retained'].includes(rawKind) ? 'park' : 'quote'
  const method = first(quote.paymentMethodCode, quote.paymentMethod?.code, quote.method, 'cash')
  const discountAmount = numberValue(first(quote.discountAmount, quote.discountAmt))
  const mapped = {
    id: quote.id,
    branchId: first(quote.branchId, quote.branch?.id, null),
    customer: mapCustomer(quote.customer || {
      id: quote.customerId,
      name: quote.customerName,
      phone: quote.customerPhone,
    }),
    items: collection(first(quote.items, quote.lines)).map(mapPosLineFromApi),
    discountMode: first(
      quote.discountMode,
      quote.discount?.mode,
      quote.discount?.type,
      discountAmount > 0 ? 'amount' : 'pct'
    ),
    discountValue: numberValue(first(quote.discountValue, quote.discount?.value), discountAmount),
    taxPct: numberValue(first(quote.taxPct, quote.taxRate), 18),
    paymentMethod: paymentMethodSemanticCode(method),
    paymentMethodApiId: first(quote.paymentMethodId, quote.paymentMethod?.id, null),
    paymentReference: quote.paymentReference || quote.reference || '',
    notes: quote.notes || '',
    documentKind: 'quote',
    heldKind,
    label: quote.label || `${quote.customer?.name || quote.customerName || 'Sin cliente'} · ${heldKind === 'quote' ? 'Cotización' : 'Retenida'}`,
    status: quote.status || 'open',
    version: quote.version ?? null,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt || quote.createdAt,
    detailLoaded: quote.lines !== undefined || quote.items !== undefined,
    apiSynced: true,
  }
  mapped.total = numberValue(first(quote.total, quote.grandTotal), calcSnapshotTotal(mapped))
  return mapped
}

export function mapSaleFromApi(sale) {
  const payment = collection(sale.payments)[0] || sale.payment || {}
  const method = first(
    sale.methodCode,
    sale.paymentMethodCode,
    sale.paymentMethod?.code,
    payment.methodCode,
    payment.paymentMethod?.code,
    sale.method,
    'cash'
  )
  return {
    id: sale.id,
    number: sale.documentNumber || sale.number || null,
    branchId: first(sale.branchId, sale.branch?.id, null),
    registerId: first(sale.registerId, sale.cashRegisterId, sale.shiftId, null),
    customer: mapCustomer(sale.customer || {
      id: sale.customerId,
      name: sale.customerName,
      phone: sale.customerPhone,
    }),
    items: collection(first(sale.items, sale.lines)).map(mapPosLineFromApi),
    subtotal: numberValue(sale.subtotal),
    discountAmt: numberValue(first(sale.discountAmount, sale.discountAmt)),
    discountPct: numberValue(first(sale.discountPct, sale.discountRate)),
    taxPct: numberValue(first(sale.taxPct, sale.taxRate), 18),
    taxAmt: numberValue(first(sale.taxAmount, sale.taxAmt)),
    total: numberValue(first(sale.total, sale.grandTotal)),
    method: paymentMethodSemanticCode(method),
    reference: first(sale.reference, payment.reference, null),
    status: sale.status || 'posted',
    soldBy: first(
      sale.soldByName,
      sale.soldBy?.name,
      sale.soldBy,
      sale.seller?.name,
      sale.createdBy?.name,
      ''
    ),
    soldById: first(sale.soldBy?.id, sale.sellerId, sale.createdBy?.id, null),
    version: sale.version ?? null,
    createdAt: sale.createdAt,
    detailLoaded: sale.lines !== undefined || sale.items !== undefined,
    apiSynced: true,
  }
}

export function mapCashMovementFromApi(movement) {
  const rawType = normalizedCode(first(movement.movementType, movement.type, movement.kind))
  const isSale = rawType.includes('sale') || rawType.includes('collection')
  const cashDelta = numberValue(first(movement.cashDelta, movement.cash_delta, movement.amount))
  const isIncome = !isSale && (
    rawType.includes('income')
    || rawType.includes('cash_in')
    || rawType === 'ingreso'
    || rawType === 'receivable_payment'
    || (rawType === 'reversal' && cashDelta > 0)
  )
  const type = isSale ? 'venta' : isIncome ? 'ingreso' : 'egreso'
  const method = first(movement.methodCode, movement.paymentMethod?.code, movement.method, 'cash')
  return {
    id: movement.id,
    type,
    movementType: rawType,
    concept: movement.concept || movement.description || movement.label || '',
    label: movement.label || movement.concept || movement.description || (type === 'ingreso' ? 'Ingreso de caja' : 'Egreso de caja'),
    amount: Math.abs(numberValue(first(movement.amount, cashDelta))),
    cashDelta,
    method: paymentMethodSemanticCode(method),
    reference: movement.reference || null,
    branchId: first(movement.branchId, movement.branch?.id, null),
    registerId: first(movement.registerId, movement.cashRegisterId, movement.shiftId, null),
    version: movement.version ?? null,
    createdAt: movement.createdAt,
    apiSynced: true,
  }
}

export function mapRegisterSummaryFromApi(summary = {}) {
  const salesByPaymentMethod = collection(summary.salesByPaymentMethod).map((row) => {
    const paymentMethod = row.paymentMethod || row.method || {}
    return {
      paymentMethod: mapPaymentMethodFromApi(paymentMethod),
      salesTotal: numberValue(first(row.salesTotal, row.total)),
      salesCount: numberValue(first(row.salesCount, row.count)),
    }
  })
  return {
    openingCash: numberValue(summary.openingCash),
    cashSales: numberValue(summary.cashSales),
    cashReceivablePayments: numberValue(summary.cashReceivablePayments),
    manualIncome: numberValue(first(summary.manualIncome, summary.cashIncomes, summary.incomes)),
    cashExpenses: numberValue(first(summary.cashExpenses, summary.expenses)),
    expectedCash: numberValue(summary.expectedCash),
    totalSales: numberValue(first(summary.totalSales, summary.completedSalesTotal)),
    salesCount: numberValue(first(summary.salesCount, summary.completedSalesCount)),
    voidedSalesCount: numberValue(summary.voidedSalesCount),
    salesByPaymentMethod,
  }
}

export function mapRegisterFromApi(register, branchId = null) {
  if (!register) {
    return {
      id: null,
      open: false,
      status: 'closed',
      branchId,
      openedAt: null,
      openingCash: 0,
      closedAt: null,
      version: null,
      apiSynced: true,
    }
  }
  const status = normalizedCode(register.status || (register.open ? 'open' : 'closed'))
  const summary = mapRegisterSummaryFromApi(register.summary || register.totals || {})
  return {
    id: register.id,
    open: register.open === true || ['open', 'active'].includes(status),
    status: status || 'closed',
    branchId: first(register.branchId, register.branch?.id, branchId),
    terminalId: first(register.terminalId, register.terminal?.id, null),
    openedAt: register.openedAt || register.startedAt || null,
    openingCash: numberValue(first(register.openingCash, register.openingAmount)),
    expectedCash: numberValue(first(register.expectedCash, register.expectedAmount), null),
    actualCash: numberValue(first(register.actualCash, register.countedCash, register.countedAmount), null),
    difference: numberValue(register.difference, null),
    closedAt: register.closedAt || register.endedAt || null,
    version: register.version ?? null,
    summary,
    movementsTotal: numberValue(
      first(register.movementsTotal, register.movementsCount),
      collection(register.movements).length
    ),
    apiSynced: true,
  }
}

export function mapRegisterHistoryEntry(register, branchId) {
  const mapped = mapRegisterFromApi(register, branchId)
  const summary = mapped.summary
  return {
    ...mapped,
    userName: first(
      register.userName,
      register.operator?.name,
      register.openedBy?.name,
      register.openedByName,
      ''
    ),
    cashSales: numberValue(first(register.cashSales, summary.cashSales)),
    cashReceivablePayments: numberValue(first(
      register.cashReceivablePayments,
      summary.cashReceivablePayments
    )),
    cashIncomes: numberValue(first(
      register.cashIncomes,
      summary.cashIncomes,
      summary.manualIncome,
      summary.incomes
    )),
    expenses: numberValue(first(register.expenses, summary.expenses, summary.cashExpenses)),
    totalSales: numberValue(first(register.totalSales, summary.totalSales)),
    salesCount: numberValue(first(register.salesCount, summary.salesCount)),
    voidedSalesCount: numberValue(first(register.voidedSalesCount, summary.voidedSalesCount)),
    salesByPaymentMethod: summary.salesByPaymentMethod,
    expected: numberValue(first(register.expected, register.expectedCash, summary.expectedCash)),
    actual: numberValue(first(register.actual, register.actualCash, register.countedCash, summary.countedCash)),
    difference: numberValue(first(register.difference, summary.difference)),
  }
}

export function mapPosCatalogItemFromApi(item, branchId = null) {
  const stock = first(item.stockQuantity, item.stock)
  return {
    id: item.id,
    name: item.name,
    sku: item.sku || null,
    type: item.itemType || item.type || 'other',
    price: numberValue(first(item.salePrice, item.price)),
    taxPct: numberValue(first(item.taxRate, item.taxPct)),
    stock: stock == null ? null : numberValue(stock),
    soldOut: item.stockStatus === 'out',
    stockStatus: item.stockStatus || null,
    unit: item.unitSymbol || item.unit || 'ud',
    branchId,
    branchIds: branchId ? [branchId] : [],
    apiSynced: true,
  }
}

export function mapPosStateFromApi(response, { branchId = null } = {}) {
  const state = entity(response, ['state']) || {}
  const registerSource = first(state.register, state.currentRegister, state.activeRegister, state.shift)
  const register = mapRegisterFromApi(registerSource, branchId)
  const allSales = collection(first(state.sales, state.recentSales)).map(mapSaleFromApi)
  const shiftSalesSource = first(state.shiftSales, registerSource?.sales)
  const shiftSales = shiftSalesSource == null
    ? allSales.filter((sale) => !register.id || sale.registerId === register.id)
    : collection(shiftSalesSource).map(mapSaleFromApi)
  const activeShiftSales = shiftSales.filter((sale) => sale.status !== 'voided')
  const movements = collection(first(state.movements, state.cashMovements, registerSource?.movements))
    .map(mapCashMovementFromApi)
  const shiftIncomes = collection(state.shiftIncomes).length
    ? collection(state.shiftIncomes).map(mapCashMovementFromApi)
    : movements.filter((movement) => movement.type === 'ingreso')
  const expenses = collection(state.expenses).length
    ? collection(state.expenses).map(mapCashMovementFromApi)
    : movements.filter((movement) => movement.type === 'egreso')
  const quotes = collection(first(state.quotes, state.saleDrafts, state.drafts)).map(mapQuoteFromApi)
  const activeQuotes = quotes.filter((quote) => (
    quote.heldKind === 'quote' && QUOTE_OPEN_STATUSES.has(normalizedCode(quote.status))
  ))
  const receivables = collection(state.receivables).map(mapReceivableFromApi)
  const catalog = collection(state.catalog).map((item) => mapPosCatalogItemFromApi(item, branchId))
  const paymentMethods = mapPaymentMethodsFromApi(state.paymentMethods || [])
  const history = collection(first(state.registerHistory, state.registers, state.cashShifts))
    .filter((entry) => entry.id !== register.id && !['open', 'active'].includes(normalizedCode(entry.status)))
    .map((entry) => mapRegisterHistoryEntry(entry, branchId))
  const summary = state.registerSummary || registerSource?.summary || state.summary || {}
  const cashSales = numberValue(
    first(state.cashSales, summary.cashSales),
    activeShiftSales.filter((sale) => sale.method === 'efectivo').reduce((sum, sale) => sum + sale.total, 0)
  )

  return {
    branchId: branchId || register.branchId,
    posCatalog: catalog,
    paymentMethods,
    register,
    registerSummary: register.summary,
    cashSales,
    shiftSales: activeShiftSales,
    shiftIncomes,
    expenses,
    registerHistory: history,
    sales: allSales,
    receivables,
    receivableSummary: state.receivableSummary || state.receivablesSummary || null,
    heldCarts: quotes,
    openQuotes: activeQuotes,
    lastCloseSummary: state.lastCloseSummary
      ? mapRegisterHistoryEntry(state.lastCloseSummary, branchId)
      : history[0] || null,
  }
}

export function mapSalesPageFromApi(response) {
  const items = collection(response).map(mapSaleFromApi)
  return { items, pagination: pagination(response, items.length) }
}

export function mapCashMovementsPageFromApi(response) {
  const items = collection(response).map(mapCashMovementFromApi)
  return { items, pagination: pagination(response, items.length) }
}

export function mapReceivablesPageFromApi(response) {
  const items = collection(response).map(mapReceivableFromApi)
  return { items, pagination: pagination(response, items.length) }
}

export function mapQuotesPageFromApi(response) {
  const items = collection(response).map(mapQuoteFromApi)
  return { items, pagination: pagination(response, items.length) }
}

export function mapReceivableSummaryFromApi(summary) {
  if (!summary) return null
  return {
    originalTotal: numberValue(summary.originalTotal),
    paidTotal: numberValue(summary.paidTotal),
    pendingTotal: numberValue(summary.pendingTotal),
    overdueTotal: numberValue(summary.overdueTotal),
    pendingCount: numberValue(summary.pendingCount),
    partialCount: numberValue(summary.partialCount),
    overdueCount: numberValue(summary.overdueCount),
  }
}

export function mapQuoteSummaryFromApi(summary) {
  if (!summary) return null
  return {
    openCount: numberValue(summary.openCount),
    heldCount: numberValue(summary.heldCount),
    convertedCount: numberValue(summary.convertedCount),
    openTotal: numberValue(summary.openTotal),
    heldTotal: numberValue(summary.heldTotal),
  }
}

export function mapReceivableStateMutationResponse(response) {
  const state = entity(response, ['receivable'])
  if (!state?.id) return null
  const rawStatus = normalizedCode(state.status)
  return {
    id: state.id,
    status: RECEIVABLE_STATUS[rawStatus] || rawStatus,
    paidAmount: numberValue(first(state.paidTotal, state.paidAmount)),
    balance: numberValue(state.balance),
    version: state.version ?? null,
  }
}

export function mapRegisterMutationResponse(response, branchId) {
  return mapRegisterFromApi(entity(response, ['register', 'cashRegister', 'shift']), branchId)
}

export function mapRegisterHistoryMutationResponse(response, branchId) {
  return mapRegisterHistoryEntry(entity(response, ['register', 'cashRegister', 'shift']), branchId)
}

export function mapSaleMutationResponse(response) {
  const sale = entity(response, ['sale'])
  return sale?.id ? mapSaleFromApi(sale) : null
}

export function mapQuoteMutationResponse(response) {
  const quote = entity(response, ['quote', 'draft'])
  return quote?.id ? mapQuoteFromApi(quote) : null
}

export function mapReceivableMutationResponse(response) {
  const receivable = entity(response, ['receivable'])
  return receivable?.id ? mapReceivableFromApi(receivable) : null
}

function customerId(customer) {
  if (!customer?.id || customer.id === 'walk-in') return null
  return customer.id
}

function lineToApiPayload(item) {
  return {
    itemId: item.apiId || item.id,
    quantity: numberValue(item.qty, 1),
    unitPrice: numberValue(item.price),
  }
}

function discountToApiPayload(mode, value, { includeZero = false } = {}) {
  const normalizedValue = numberValue(value)
  if (!includeZero && normalizedValue <= 0) return {}
  return {
    discountType: mode === 'amount' ? 'fixed' : 'percent',
    discountValue: normalizedValue,
  }
}

export function quoteToApiPayload(state, { kind = 'quote' } = {}) {
  const payment = paymentMethodApiReference(state.paymentMethods, state.paymentMethod)
  return {
    branchId: state.branchId,
    customerId: customerId(state.customer),
    kind: kind === 'parked' ? 'held' : kind,
    lines: (state.items || []).map(lineToApiPayload),
    ...discountToApiPayload(state.discountMode, state.discountValue),
    ...(payment.methodId ? { paymentMethodId: payment.methodId } : {}),
    reference: state.paymentReference?.trim() || null,
    notes: state.notes?.trim() || null,
  }
}

export function quotePatchToApiPayload(quote, patch) {
  const payload = { version: quote.version }
  if (patch.kind !== undefined) payload.kind = patch.kind === 'parked' ? 'held' : patch.kind
  if (patch.branchId !== undefined) payload.branchId = patch.branchId
  if (patch.customer !== undefined || patch.customerId !== undefined) {
    payload.customerId = patch.customerId ?? customerId(patch.customer)
  }
  if (patch.items !== undefined) payload.lines = patch.items.map(lineToApiPayload)
  if (patch.discountMode !== undefined || patch.discountValue !== undefined) {
    Object.assign(
      payload,
      discountToApiPayload(
        patch.discountMode ?? quote.discountMode,
        patch.discountValue ?? quote.discountValue,
        { includeZero: true }
      )
    )
  }
  if (patch.paymentMethod !== undefined || patch.paymentMethodId !== undefined) {
    const payment = paymentMethodApiReference(
      patch.paymentMethods || [],
      patch.paymentMethodId ?? patch.paymentMethod
    )
    payload.paymentMethodId = payment.methodId || patch.paymentMethodId || null
  }
  if (patch.paymentReference !== undefined || patch.reference !== undefined) {
    payload.reference = (patch.paymentReference ?? patch.reference)?.trim() || null
  }
  if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null
  if (patch.dueAt !== undefined) payload.dueAt = patch.dueAt || null
  return payload
}

export function checkoutToApiPayload(data, state) {
  const payment = paymentMethodApiReference(state.paymentMethods, data.method)
  if (!payment.methodId) {
    throw new Error('Selecciona un método de pago sincronizado con la API.')
  }
  const quoteId = state.activeQuoteId || null
  const activeQuote = quoteId
    ? [...collection(state.heldCarts), ...collection(state.openQuotes)]
      .find((quote) => quote.id === quoteId)
    : null
  const quoteVersion = activeQuote?.version
  if (quoteId && state.apiContext?.mode === 'online' && quoteVersion == null) {
    throw new Error('No se puede cobrar la cotización porque falta su versión sincronizada. Recárgala e inténtalo de nuevo.')
  }
  return {
    branchId: state.branchId,
    registerId: state.register?.id,
    quoteId,
    ...(quoteId && quoteVersion != null ? { quoteVersion } : {}),
    customerId: customerId(data.customer),
    paymentMethodId: payment.methodId,
    reference: data.reference?.trim() || null,
    lines: (data.items || []).map(lineToApiPayload),
    ...discountToApiPayload(state.discountMode, state.discountValue),
  }
}

export function registerOpenToApiPayload({ branchId, openingCash }) {
  return {
    branchId,
    openingCash: numberValue(openingCash),
  }
}

export function registerCloseToApiPayload(register, countedCash, notes = null) {
  return {
    countedCash: numberValue(countedCash),
    notes: notes?.trim() || null,
    version: register.version,
  }
}

export function movementToApiPayload(data, state, type) {
  const payment = paymentMethodApiReference(state.paymentMethods, data.method || 'efectivo')
  if (!payment.methodId) {
    throw new Error('Selecciona un método de pago sincronizado con la API.')
  }
  const lines = (data.items || []).map((item) => ({
    itemId: item.apiId || item.id || null,
    description: item.name || data.concept || 'Movimiento POS',
    quantity: numberValue(item.qty, 1),
    unitCost: numberValue(item.price),
  }))
  const lineAmount = Math.round(
    lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0) * 100
  ) / 100
  return {
    type,
    concept: data.concept?.trim() || '',
    amount: lines.length ? lineAmount : numberValue(data.amount),
    paymentMethodId: payment.methodId,
    reference: data.reference?.trim() || null,
    lines,
  }
}

export function receivablePatchToApiPayload(receivable, patch) {
  return {
    dueDate: patch.dueDate || null,
    notes: patch.notes?.trim() || '',
    version: receivable.version,
  }
}

export function receivablePaymentToApiPayload(receivable, data, state) {
  const payment = paymentMethodApiReference(state.paymentMethods, data.method)
  if (!payment.methodId) {
    throw new Error('Selecciona un método de pago sincronizado con la API.')
  }
  return {
    amount: numberValue(data.amount),
    methodId: payment.methodId,
    reference: data.reference?.trim() || null,
    note: data.note?.trim() || null,
    registerId: state.register?.open ? state.register.id : null,
    version: receivable.version,
    proof: typeof File !== 'undefined' && data.proof instanceof File ? data.proof : null,
  }
}

export function voidToApiPayload(entityToVoid, reason = 'Anulado desde Terminal POS') {
  return {
    reason,
    version: entityToVoid?.version ?? null,
  }
}
